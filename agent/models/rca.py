import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from agent.models.base import Base


class RCAReport(Base):
    __tablename__ = "rca_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    root_cause: Mapped[str] = mapped_column(Text, nullable=False)
    five_whys: Mapped[dict] = mapped_column(JSONB, nullable=False)
    action_items: Mapped[dict] = mapped_column(JSONB, nullable=False)
    impact_analysis: Mapped[dict] = mapped_column(JSONB, nullable=False)
    llm_model: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # The specific model hit
    bedrock_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
