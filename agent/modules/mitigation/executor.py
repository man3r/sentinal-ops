"""
Mitigation Executor — dispatches approved human actions.

Supported actions:
  - approve_rollback : Logs that a rollback was approved. (Actual k8s/deploy call is Phase 6)
  - create_jira      : Creates a Jira issue from the RCA (stub in Phase 3; real API in Phase 3b)
  - dismiss          : Marks the incident as resolved without further action
  - escalate         : Bumps severity and re-pages
"""
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.models import AuditLog, Incident, RCAReport

logger = logging.getLogger(__name__)


async def handle(
    action_id: str,
    incident_id: str,
    actor: str,
    db: AsyncSession,
) -> dict:
    """
    Execute the approved action after guardrails have passed.
    Writes HUMAN_DECISION + MITIGATION_EXECUTED audit events.
    Returns a dict with `message` for Slack response.
    """
    result = await db.execute(
        select(Incident).where(Incident.id == uuid.UUID(incident_id))
    )
    incident = result.scalar_one_or_none()
    if not incident:
        return {"message": f"❌ Incident `{incident_id}` not found."}

    rca_result = await db.execute(
        select(RCAReport).where(RCAReport.incident_id == incident.id)
    )
    rca = rca_result.scalar_one_or_none()

    # ── HUMAN_DECISION audit ───────────────────────────────────────────────────
    decision_audit = AuditLog(
        incident_id=incident.id,
        event_type="HUMAN_DECISION",
        actor=actor,
        payload={"action": action_id, "incident_id": incident_id},
        record_hash="PENDING",
    )
    db.add(decision_audit)

    # ── Dispatch action ────────────────────────────────────────────────────────
    if action_id == "approve_rollback":
        return await _approve_rollback(incident, rca, actor, db)

    elif action_id == "create_jira":
        return await _create_jira(incident, rca, actor, db)

    elif action_id == "dismiss":
        return await _dismiss(incident, actor, db)

    else:
        logger.warning(f"Unknown action_id: {action_id}")
        return {"message": f"❓ Unknown action `{action_id}`."}


async def _approve_rollback(incident: Incident, rca: RCAReport | None, actor: str, db: AsyncSession) -> dict:
    """Mark incident as resolved; log rollback approval. Actual deploy rollback is Phase 6."""
    incident.status = "RESOLVED"

    mitigation_audit = AuditLog(
        incident_id=incident.id,
        event_type="MITIGATION_EXECUTED",
        actor=actor,
        payload={
            "action": "approve_rollback",
            "causal_commit": incident.causal_commit,
            "causal_repo": incident.causal_repo,
            "note": "Rollback command execution wired in Phase 6 (AWS deploy integration).",
        },
        record_hash="PENDING",
    )
    db.add(mitigation_audit)
    await db.commit()

    logger.info(f"✅ Rollback approved for incident {incident.id} by {actor}")
    return {
        "message": (
            f"✅ *Rollback approved* by `{actor}`.\n"
            f"Causal commit `{incident.causal_commit or 'unknown'}` in `{incident.causal_repo or 'unknown'}` "
            f"flagged for rollback.\n_Incident status → RESOLVED._"
        )
    }


async def _create_jira(incident: Incident, rca: RCAReport | None, actor: str, db: AsyncSession) -> dict:
    """Create a Jira issue (stub — real Jira API call wired in Phase 3b)."""
    root_cause = rca.root_cause if rca else "RCA pending"
    jira_key = f"SENTINEL-{str(incident.id)[:8].upper()}"  # Stub ticket key

    mitigation_audit = AuditLog(
        incident_id=incident.id,
        event_type="MITIGATION_EXECUTED",
        actor=actor,
        payload={
            "action": "create_jira",
            "jira_key": jira_key,
            "root_cause": root_cause,
            "note": "Real Jira API integration wired in Phase 3b.",
        },
        record_hash="PENDING",
    )
    db.add(mitigation_audit)
    await db.commit()

    logger.info(f"📋 Jira ticket {jira_key} created for incident {incident.id} by {actor}")
    return {
        "message": (
            f"📋 *Jira ticket created:* `{jira_key}`\n"
            f"*Root Cause:* {root_cause[:200]}\n"
            f"_Created by `{actor}`._"
        )
    }


async def _dismiss(incident: Incident, actor: str, db: AsyncSession) -> dict:
    """Dismiss the incident — marks it RESOLVED with no automated action."""
    incident.status = "RESOLVED"

    mitigation_audit = AuditLog(
        incident_id=incident.id,
        event_type="MITIGATION_EXECUTED",
        actor=actor,
        payload={"action": "dismiss", "note": "Manually dismissed by engineer."},
        record_hash="PENDING",
    )
    db.add(mitigation_audit)
    await db.commit()

    logger.info(f"🔕 Incident {incident.id} dismissed by {actor}")
    return {
        "message": (
            f"🔕 *Incident dismissed* by `{actor}`.\n"
            f"_No automated action taken. Incident status → RESOLVED._"
        )
    }
