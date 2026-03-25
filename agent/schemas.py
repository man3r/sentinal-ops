"""
Pydantic schemas for all API request/response models.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Incident Schemas ──────────────────────────────────────────────────────────

class IncidentSummary(BaseModel):
    """Inbound payload from the Perception Engine (/internal/incident)."""
    incident_id: str
    severity: str  # SEV1_CRITICAL | SEV2_HIGH
    affected_service: str
    confidence: float = Field(ge=0.0, le=1.0)
    error_pattern: str
    error_rate_pct: Optional[float] = None
    window_start: datetime
    window_end: datetime
    sanitized_trace: Optional[str] = None


class IncidentResponse(BaseModel):
    id: uuid.UUID
    severity: str
    affected_service: str
    status: str
    causal_commit: Optional[str]
    causal_repo: Optional[str]
    confidence: Optional[Decimal]
    error_pattern: Optional[str] = None
    error_rate_pct: Optional[Decimal] = None
    created_at: datetime
    resolved_at: Optional[datetime]

    model_config = {"from_attributes": True}


class IncidentListResponse(BaseModel):
    total: int
    items: list[IncidentResponse]


# ── RCA Schemas ───────────────────────────────────────────────────────────────

class WhyEntry(BaseModel):
    why: int
    question: str
    answer: str


class ActionItem(BaseModel):
    action: str
    owner: str
    due_date: Optional[str] = None
    status: str = "Open"


class ActionItems(BaseModel):
    corrective_actions: list[ActionItem] = []
    preventive_actions: list[ActionItem] = []
    systemic_actions: list[ActionItem] = []


class ImpactAnalysis(BaseModel):
    affected_users: Optional[int] = None
    stalled_loans: Optional[int] = None
    revenue_at_risk: Optional[str] = None
    duration_minutes: Optional[int] = None


class RCAResponse(BaseModel):
    incident_id: uuid.UUID
    root_cause: str
    causal_commit: Optional[str]
    causal_repo: Optional[str]
    five_whys: list[WhyEntry]
    action_items: ActionItems
    impact_analysis: ImpactAnalysis
    llm_model: Optional[str] = None
    bedrock_tokens: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Audit Schemas ─────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    id: int
    incident_id: Optional[uuid.UUID]
    event_type: str
    actor: Optional[str]
    payload: dict[str, Any]
    record_hash: str
    prev_hash: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditListResponse(BaseModel):
    total: int
    items: list[AuditLogResponse]


# ── Repository Schemas ────────────────────────────────────────────────────────

class RepositoryCreate(BaseModel):
    name: str
    provider: str  # GITHUB | GITLAB | BITBUCKET
    url: str
    token: str  # Stored in Secrets Manager; not persisted in plain text


class RepositoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    url: str
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Guardrail Schemas ─────────────────────────────────────────────────────────

class GuardrailCreate(BaseModel):
    rule_type: str  # NO_GO_ZONE | CONFIDENCE_THRESHOLD
    value: str
    description: Optional[str] = None


class GuardrailResponse(BaseModel):
    id: uuid.UUID
    rule_type: str
    value: str
    description: Optional[str]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
