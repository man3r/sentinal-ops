from fastapi import APIRouter, Depends
from typing import Any
from agent.config import settings

from agent.modules.reasoning.bedrock_client import get_active_engine_name

router = APIRouter(tags=["config"])

@router.get("/llm")
async def get_active_llm() -> dict[str, Any]:
    """Returns the primary reasoning model configured for simulation UI."""
    engine = get_active_engine_name()
    return {
        "model_name": engine,
        "provider": "Sovereign AI" if "Ollama" in engine else "AWS Cloud",
        "tier": "Tier-2" if "Ollama" in engine else "Tier-1"
    }
