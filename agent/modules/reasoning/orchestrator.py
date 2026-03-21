"""
Reasoning Loop Orchestrator.
Runs as a FastAPI Background Task after /internal/incident is received.

Pipeline:
  1. Fetch incident from DB
  2. Load registered repositories from DB
  3. Parallel: RAG retrieval + Git correlation   (asyncio.gather)
  4. Call Bedrock Claude 3.5 Sonnet → structured RCA JSON
  5. Persist RCAReport to DB
  6. Update Incident causal fields
  7. Write RCA_GENERATED audit event
"""
import asyncio
import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.config import settings
from agent.database import AsyncSessionLocal
from agent.models import AuditLog, Incident, RCAReport, Repository
from agent.modules.reasoning.bedrock_client import generate_rca
from agent.modules.reasoning.git_correlator import correlate
from agent.modules.reasoning.vector_retrieval import ensure_index_exists, retrieve_similar
from agent.modules.mitigation.slack_notifier import send_incident_alert

logger = logging.getLogger(__name__)


async def _build_incident_dict(incident: Incident) -> dict[str, Any]:
    """Flatten ORM model to a plain dict for the Bedrock prompt."""
    return {
        "affected_service": incident.affected_service,
        "severity": incident.severity,
        "confidence": float(incident.confidence) if incident.confidence else None,
        # error_pattern and sanitized_trace will be enriched from the incoming
        # IncidentSummary payload in Phase 3 when we carry context through.
        "error_pattern": "See sanitized trace",
        "sanitized_trace": "",
    }


async def run_reasoning_loop(incident_id: str) -> None:
    """
    Entry point — creates its own DB session so it can run as a
    FastAPI BackgroundTask that outlives the original request.
    """
    async with AsyncSessionLocal() as db:
        await _execute(incident_id=incident_id, db=db)


async def _execute(incident_id: str, db: AsyncSession) -> None:
    logger.info(f"🧠 Reasoning loop started for incident: {incident_id}")

    try:
        # ── 1. Fetch incident ──────────────────────────────────────────────────
        result = await db.execute(
            select(Incident).where(Incident.id == uuid.UUID(incident_id))
        )
        incident = result.scalar_one_or_none()
        if not incident:
            logger.error(f"Incident {incident_id} not found — aborting reasoning loop.")
            return

        # ── 2. Load registered repos ───────────────────────────────────────────
        repos_result = await db.execute(
            select(Repository).where(Repository.active == True)
        )
        repos = [
            {"url": r.url, "name": r.name, "secret_arn": r.secret_arn, "provider": r.provider}
            for r in repos_result.scalars().all()
        ]

        # ── 3. Parallel: RAG + Git ─────────────────────────────────────────────
        await ensure_index_exists()
        incident_text = f"{incident.affected_service} {incident.severity}"

        rag_context, git_prs = await asyncio.gather(
            retrieve_similar(incident_text, top_k=5),
            correlate(repos),
        )
        logger.info(f"  RAG: {len(rag_context)} hits  |  Git: {len(git_prs)} recent PRs")

        # ── 4. Bedrock: Generate RCA ───────────────────────────────────────────
        incident_dict = await _build_incident_dict(incident)
        rca_data, token_count = await generate_rca(incident_dict, rag_context, git_prs)

        # ── 5. Persist RCAReport ───────────────────────────────────────────────
        rca_report = RCAReport(
            incident_id=incident.id,
            root_cause=rca_data.get("root_cause", "Unknown"),
            five_whys=rca_data.get("five_whys", []),
            action_items=rca_data.get("action_items", {}),
            impact_analysis=rca_data.get("impact_analysis", {}),
            bedrock_tokens=token_count,
        )
        db.add(rca_report)

        # ── 6. Update Incident causal fields ───────────────────────────────────
        incident.causal_commit = rca_data.get("causal_commit")
        incident.causal_repo = rca_data.get("causal_repo")
        incident.status = "ACKNOWLEDGED"

        # ── 7. Audit event ─────────────────────────────────────────────────────
        audit = AuditLog(
            incident_id=incident.id,
            event_type="RCA_GENERATED",
            actor="ReasoningLoop",
            payload={
                "root_cause": rca_data.get("root_cause"),
                "causal_commit": rca_data.get("causal_commit"),
                "causal_repo": rca_data.get("causal_repo"),
                "bedrock_tokens": token_count,
                "rag_hits": len(rag_context),
                "git_prs_correlated": len(git_prs),
            },
            record_hash="PENDING",  # Full hash chaining lands in Phase 4
        )
        db.add(audit)

        await db.commit()
        logger.info(f"✅ RCA persisted for incident {incident_id} (tokens={token_count})")

        # ── 8. Post Slack Alert ──────────────────────────────────────────────
        slack_ts = await send_incident_alert(
            incident_id=str(incident.id),
            severity=incident.severity,
            affected_service=incident.affected_service,
            confidence=float(incident.confidence) if incident.confidence else None,
            root_cause=rca_data.get("root_cause", "Unknown"),
            causal_commit=rca_data.get("causal_commit"),
            causal_repo=rca_data.get("causal_repo"),
            five_whys=rca_data.get("five_whys", []),
        )

        # Write ALERT_SENT audit event
        alert_audit = AuditLog(
            incident_id=incident.id,
            event_type="ALERT_SENT",
            actor="SentinelOps",
            payload={
                "channel": settings.slack_incident_channel,
                "slack_ts": slack_ts,
                "mode": "slack" if slack_ts else "dry_run",
            },
            record_hash="PENDING",
        )
        db.add(alert_audit)
        await db.commit()

    except Exception as e:
        logger.error(
            f"❌ Reasoning loop failed for incident {incident_id}: {e}", exc_info=True
        )
