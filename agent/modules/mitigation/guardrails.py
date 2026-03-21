"""
Guardrail Layer 1 — hard gate evaluated BEFORE any mitigation action is executed.
Two checks:
  1. NO_GO_ZONE: action is explicitly blocked by an admin-configured rule
  2. CONFIDENCE_THRESHOLD: agent confidence is below the required minimum

This is a code-level enforcement (not just prompt-level).
The LLM-level system prompt injection (Layer 2) is handled at prompt build time.
"""
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent.models import GuardrailRule

logger = logging.getLogger(__name__)


@dataclass
class GuardrailResult:
    allowed: bool
    reason: str


async def check(
    action_id: str,
    incident_id: str,
    confidence: float | None,
    db: AsyncSession,
) -> GuardrailResult:
    """
    Evaluate all active guardrail rules against the requested action.
    Returns GuardrailResult(allowed=True) if the action is permitted.
    """

    # ── Rule 1: Confidence threshold ───────────────────────────────────────────
    threshold_result = await db.execute(
        select(GuardrailRule).where(
            GuardrailRule.rule_type == "CONFIDENCE_THRESHOLD",
            GuardrailRule.active == True,
        )
    )
    threshold_rules = threshold_result.scalars().all()

    for rule in threshold_rules:
        try:
            min_confidence = float(rule.value)
            if confidence is None or confidence < min_confidence:
                reason = (
                    f"Action '{action_id}' blocked: confidence {confidence} < "
                    f"required threshold {min_confidence} (rule: {rule.id})"
                )
                logger.warning(f"GUARDRAIL TRIGGERED: {reason}")
                return GuardrailResult(allowed=False, reason=reason)
        except ValueError:
            logger.error(f"Invalid CONFIDENCE_THRESHOLD rule value: {rule.value}")

    # ── Rule 2: NO_GO_ZONE ─────────────────────────────────────────────────────
    no_go_result = await db.execute(
        select(GuardrailRule).where(
            GuardrailRule.rule_type == "NO_GO_ZONE",
            GuardrailRule.active == True,
        )
    )
    no_go_rules = no_go_result.scalars().all()

    for rule in no_go_rules:
        if action_id.lower() == rule.value.lower() or incident_id == rule.value:
            reason = (
                f"Action '{action_id}' is in a NO_GO_ZONE configured by admin "
                f"(rule: {rule.id}, description: {rule.description or 'n/a'})"
            )
            logger.warning(f"GUARDRAIL TRIGGERED: {reason}")
            return GuardrailResult(allowed=False, reason=reason)

    return GuardrailResult(allowed=True, reason="All guardrail checks passed.")
