import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from agent.models.base import Base


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # SEV1_CRITICAL | SEV2_HIGH | SEV3_LOW
    affected_service: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="OPEN")  # OPEN | ACKNOWLEDGED | RESOLVED
    causal_commit: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    causal_repo: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3), nullable=True)
    error_pattern: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    error_rate_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    sanitized_trace: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Full raw context for LLM
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
