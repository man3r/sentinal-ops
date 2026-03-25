from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, extract
from sqlalchemy.ext.asyncio import AsyncSession

from agent.database import get_db
from agent.models import Incident

router = APIRouter()


@router.get("/metrics")
async def get_analytics_metrics(db: AsyncSession = Depends(get_db)):
    """
    Aggregates incident data for the Observatory dashboard.
    """
    # ── 1. Incident Velocity (Last 7 Days) ────────────────────────────────────
    seven_days_ago = datetime.now() - timedelta(days=7)
    velocity_query = (
        select(
            func.date_trunc('day', Incident.created_at).label('day'),
            func.count(Incident.id).label('count')
        )
        .where(Incident.created_at >= seven_days_ago)
        .group_by('day')
        .order_by('day')
    )
    velocity_result = await db.execute(velocity_query)
    velocity_data = [
        {"timestamp": row.day.isoformat(), "incidents": row.count}
        for row in velocity_result
    ]

    # ── 2. Severity Portfolio ────────────────────────────────────────────────
    severity_query = (
        select(Incident.severity, func.count(Incident.id))
        .group_by(Incident.severity)
    )
    severity_result = await db.execute(severity_query)
    severity_data = [
        {"severity": row[0], "count": row[1]}
        for row in severity_result
    ]

    # ── 3. Top Affected Services ──────────────────────────────────────────────
    service_query = (
        select(Incident.affected_service, func.count(Incident.id))
        .group_by(Incident.affected_service)
        .order_by(func.count(Incident.id).desc())
        .limit(5)
    )
    service_result = await db.execute(service_query)
    service_data = [
        {"service": row[0], "count": row[1]}
        for row in service_result
    ]

    # ── 4. AI Confidence Trend ───────────────────────────────────────────────
    confidence_query = (
        select(
            func.date_trunc('day', Incident.created_at).label('day'),
            func.avg(Incident.confidence).label('avg_confidence')
        )
        .where(Incident.created_at >= seven_days_ago)
        .group_by('day')
        .order_by('day')
    )
    confidence_result = await db.execute(confidence_query)
    confidence_data = [
        {"timestamp": row.day.isoformat(), "confidence": float(row.avg_confidence or 0)}
        for row in confidence_result
    ]

    # ── 5. MTTR (Mean Time To Resolution) in Minutes ─────────────────────────
    # We only look at resolved incidents
    mttr_query = select(
        func.avg(
            extract('epoch', Incident.resolved_at - Incident.created_at) / 60
        )
    ).where(Incident.resolved_at.isnot(None))
    
    mttr_result = await db.execute(mttr_query)
    avg_mttr = mttr_result.scalar() or 0

    # ── 6. Hourly Incident Distribution (24h clock) ──────────────────────────
    hour_query = (
        select(
            extract('hour', Incident.created_at).label('hour'),
            func.count(Incident.id).label('count')
        )
        .group_by('hour')
        .order_by('hour')
    )
    hour_result = await db.execute(hour_query)
    hour_distribution = [{"hour": int(row.hour), "count": row.count} for row in hour_result]

    # ── 7. Status Distribution ───────────────────────────────────────────────
    status_query = (
        select(Incident.status, func.count(Incident.id))
        .group_by(Incident.status)
    )
    status_result = await db.execute(status_query)
    status_distribution = [{"status": row[0], "count": row[1]} for row in status_result]

    return {
        "velocity": velocity_data,
        "severity_distribution": severity_data,
        "top_services": service_data,
        "confidence_trend": confidence_data,
        "mttr_avg_minutes": round(float(avg_mttr), 1),
        "hourly_distribution": hour_distribution,
        "status_distribution": status_distribution
    }
