"""
SentinelOps Agent Controller — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent.api.internal import router as internal_router
from agent.api.incidents import router as incidents_router
from agent.api.audit import router as audit_router
from agent.api.repositories import router as repositories_router
from agent.api.guardrails import router as guardrails_router
from agent.api.slack import router as slack_router
from agent.api.integrations import router as integrations_router
from agent.api.analytics import router as analytics_router
from agent.api.integrations import ping_all_integrations

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SentinelOps Agent starting up...")
    import asyncio
    asyncio.create_task(ping_all_integrations())
    yield
    logger.info("SentinelOps Agent shutting down...")


app = FastAPI(
    title="SentinelOps Agent",
    version="1.0.0",
    description="VPC-native AI SRE Agent for high-stakes lending environments.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(internal_router, prefix="/internal", tags=["internal"])
app.include_router(incidents_router, prefix="/api/incidents", tags=["incidents"])
app.include_router(audit_router, prefix="/api/audit", tags=["audit"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(repositories_router, prefix="/api/repositories", tags=["repositories"])
app.include_router(guardrails_router, prefix="/api/guardrails", tags=["guardrails"])
app.include_router(integrations_router, prefix="/api/integrations", tags=["integrations"])
app.include_router(slack_router, prefix="/slack", tags=["slack"])


@app.get("/health", tags=["health"])
async def health_check():
    """Health check — used by ECS health checks and systemd watchdog."""
    return {
        "status": "healthy",
        "service": "sentinelops-agent",
        "version": "1.0.0",
    }


@app.post("/api/payments", tags=["simulations"])
async def process_payment(payload: dict):
    """
    Simulated Buggy Payment Endpoint for SentinelOps E2E testing.
    Crashes if amount is 0 (division by zero bug).
    """
    amount = payload.get("amount", 0)
    # Simulate a critical logic error
    result = 100 / amount
    return {"status": "success", "processed_amount": result}
