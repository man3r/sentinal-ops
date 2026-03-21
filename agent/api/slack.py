"""
Slack Actions Webhook — receives interactive button click payloads from Slack.

Security:
  - Verifies HMAC-SHA256 signature using SLACK_SIGNING_SECRET before processing.
  - Rejects stale requests (timestamp > 5 minutes old).

Flow:
  POST /slack/actions
    → Verify signature
    → Parse action_id + incident_id + actor
    → Guardrail Layer 1 check
    → dispatch to executor
    → Return Slack response JSON
"""
import hashlib
import hmac
import json
import logging
import time
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.config import settings
from agent.database import get_db
from agent.models import AuditLog, Incident
from agent.modules.mitigation.executor import handle
from agent.modules.mitigation.guardrails import check

logger = logging.getLogger(__name__)
router = APIRouter()


# ── HMAC Verification ─────────────────────────────────────────────────────────

def _verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """Verify Slack's HMAC-SHA256 request signature."""
    # Reject stale requests (replay attack protection)
    if abs(time.time() - float(timestamp)) > 300:
        logger.warning("Slack request rejected: timestamp too old (possible replay attack).")
        return False

    signing_secret = settings.slack_signing_secret
    if not signing_secret:
        logger.warning("SLACK_SIGNING_SECRET not set — skipping signature verification (dev mode).")
        return True  # Allow in dev when secret is not configured

    base_string = f"v0:{timestamp}:{body.decode('utf-8')}"
    expected_sig = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        base_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected_sig, signature)


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/actions", status_code=status.HTTP_200_OK)
async def slack_actions(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Slack interactive component webhook.
    Slack sends a form-encoded POST with a `payload` field containing JSON.
    """
    body = await request.body()

    # ── Signature verification ─────────────────────────────────────────────────
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "0")
    signature = request.headers.get("X-Slack-Signature", "")

    if not _verify_slack_signature(body, timestamp, signature):
        raise HTTPException(status_code=403, detail="Invalid Slack signature.")

    # ── Parse payload ──────────────────────────────────────────────────────────
    parsed = urllib.parse.parse_qs(body.decode("utf-8"))
    payload_str = parsed.get("payload", ["{}"])[0]
    payload = json.loads(payload_str)

    action_list = payload.get("actions", [])
    if not action_list:
        return {"text": "No actions found in payload."}

    action = action_list[0]
    action_id: str = action.get("action_id", "")
    incident_id: str = action.get("value", "")

    # Actor = Slack user who clicked the button
    user = payload.get("user", {})
    actor = user.get("name") or user.get("id", "unknown-slack-user")

    logger.info(f"Slack action received: action={action_id}, incident={incident_id}, actor={actor}")

    # ── Fetch confidence for guardrail check ───────────────────────────────────
    incident_result = await db.execute(
        select(Incident).where(Incident.id == incident_id)
    )
    incident = incident_result.scalar_one_or_none()
    confidence = float(incident.confidence) if incident and incident.confidence else None

    # ── Guardrail Layer 1 ──────────────────────────────────────────────────────
    guardrail = await check(
        action_id=action_id,
        incident_id=incident_id,
        confidence=confidence,
        db=db,
    )

    if not guardrail.allowed:
        # Write GUARDRAIL_TRIGGERED audit event
        audit = AuditLog(
            incident_id=incident.id if incident else None,
            event_type="GUARDRAIL_TRIGGERED",
            actor=actor,
            payload={"action": action_id, "reason": guardrail.reason},
            record_hash="PENDING",
        )
        db.add(audit)
        await db.commit()
        logger.warning(f"Guardrail blocked action '{action_id}': {guardrail.reason}")
        return {
            "response_type": "ephemeral",
            "text": f"🚫 *Action blocked by guardrail.*\n_{guardrail.reason}_",
        }

    # ── Execute action ─────────────────────────────────────────────────────────
    result = await handle(
        action_id=action_id,
        incident_id=incident_id,
        actor=actor,
        db=db,
    )

    return {
        "response_type": "in_channel",
        "replace_original": False,
        "text": result.get("message", "Action completed."),
    }
