import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from agent.database import get_db
from agent.models import AuditLog, Incident
from agent.modules.audit.logger import append_audit_event
from agent.modules.reasoning.orchestrator import run_reasoning_loop
from agent.schemas import IncidentSummary

logger = logging.getLogger(__name__)
router = APIRouter()

SEV_TRIGGERS_REASONING = {"SEV1_CRITICAL", "SEV2_HIGH"}


@router.post("/incident", status_code=status.HTTP_202_ACCEPTED)
async def trigger_incident(
    incident: IncidentSummary,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the Perception Engine when an anomaly is detected.
    Persists the incident, writes an audit event, then fires the
    Reasoning Loop as a non-blocking background task.
    """
    # ── 1. Persist the Incident ────────────────────────────────────────────────
    new_incident = Incident(
        id=incident.incident_id,
        severity=incident.severity,
        affected_service=incident.affected_service,
        confidence=incident.confidence,
        error_pattern=incident.error_pattern,
        error_rate_pct=incident.error_rate_pct,
        sanitized_trace=incident.sanitized_trace,
    )
    db.add(new_incident)

    # ── 2. Immutable Audit Event ───────────────────────────────────────────────
    await append_audit_event(
        db=db,
        incident_id=new_incident.id,
        event_type="TRIAGE_DECISION",
        actor="PerceptionEngine",
        payload={
            "error_pattern": incident.error_pattern,
            "error_rate_pct": incident.error_rate_pct,
            "sanitized_trace": incident.sanitized_trace,
        }
    )
    # The commit here finalizes the incident and the audit log lock together
    await db.commit()

    # ── 3. Fire Reasoning Loop (background, non-blocking) ─────────────────────
    reasoning_triggered = incident.severity in SEV_TRIGGERS_REASONING
    if reasoning_triggered and incident.confidence >= 0.5:
        background_tasks.add_task(run_reasoning_loop, str(new_incident.id))
        logger.info(f"Reasoning loop queued for incident {new_incident.id} ({incident.severity})")

    return {
        "incident_id": str(new_incident.id),
        "severity": incident.severity,
        "status": "reasoning_loop_triggered" if reasoning_triggered else "logged_only",
    }
