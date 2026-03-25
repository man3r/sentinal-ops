"""
Bedrock Client — invokes Claude 3.5 Sonnet to generate structured, schema-validated RCA JSON.
Falls back to a deterministic MOCK RCA when Bedrock is unavailable (local dev without AWS creds).
"""
import json
import logging
import uuid
from typing import Any

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

from agent.config import settings

logger = logging.getLogger(__name__)


# ── RCA Fallback (local dev mock) ──────────────────────────────────────────────

SCENARIO_TEMPLATES = {
    "DATABASE": {
        "root_cause": "A connection pool saturation in the {service} data layer blocked transactional throughput, likely triggered by a surge in long-running queries.",
        "five_whys": [
            {"why": 1, "question": "Why is {service} failing?", "answer": "The database connection pool is exhausted, leading to timeouts."},
            {"why": 2, "question": "Why is the pool exhausted?", "answer": "Active connections are hanging on read-latency from the secondary partition."},
            {"why": 3, "question": "Why is latency high on the secondary?", "answer": "An unoptimized migration added a large index in the background without a maintenance window."},
            {"why": 4, "question": "Why was the migration unoptimized?", "answer": "The CI/CD pipeline lacked a query-plan analyzer for the new schema changes."},
            {"why": 5, "question": "Why was the analyzer missing?", "answer": "The SRE core library hasn't been updated to include Postgres 16 specific plan validation."},
        ],
        "action_items": {
            "corrective": "Temporarily double the MAX_CONNECTIONS in the production k8s ConfigMap.",
            "preventive": "Implement query-plan linting in the pre-deployment pipeline.",
        }
    },
    "LOGIC": {
        "root_cause": "An unhandled {error} in {service} flow control caused 5xx bubbling to the gateway. This correlates with edge-case parameter handling.",
        "five_whys": [
            {"why": 1, "question": "Why is {service} returning 5xx?", "answer": "It is encountering an unhandled {error} during the {service} execution cycle."},
            {"why": 2, "question": "Why is this exception unhandled?", "answer": "The try-except block was too narrow, missing the specific subclass of this error."},
            {"why": 3, "question": "Why was the block narrow?", "answer": "The feature was refactored recently and the error handling wasn't reviewed for parity."},
            {"why": 4, "question": "Why did code review miss this?", "answer": "The reviewer focused on the happy-path throughput rather than failure state coverage."},
            {"why": 5, "question": "Why is failure coverage not mandatory?", "answer": "Code coverage gates are set only to 70%, which allows critical logic paths to remain untested."},
        ],
        "action_items": {
            "corrective": "Deploy a hotfix patch to the error-handler module to intercept {error}.",
            "preventive": "Increase mandatory code coverage gate to 90% for the core logic pkg.",
        }
    },
    "RESOURCE": {
        "root_cause": "Memory pressure on the {service} pod led to GC thrashing and eventual OOMKill. This points to a potential leak in the cache-eviction logic.",
        "five_whys": [
            {"why": 1, "question": "Why did {service} restart?", "answer": "It was OOMKilled by the node after exceeding the 2Gi limit."},
            {"why": 2, "question": "Why was memory usage so high?", "answer": "The internal LRU cache for user-state was not evicting stale objects."},
            {"why": 3, "question": "Why was eviction failing?", "answer": "A bug in the timestamp comparison caused all objects to be flagged as 'permanent'."},
            {"why": 4, "question": "Why was this not caught in load tests?", "answer": "Load test durations are only 10 minutes, too short for this gradual leak to manifest."},
            {"why": 5, "question": "Why are load tests short?", "answer": "To save costs on the CI runners, durations were capped last quarter."},
        ],
        "action_items": {
            "corrective": "Increase k8s memory limits while a patch for the cache logic is developed.",
            "preventive": "Implement a 60-minute 'Soak Test' for all changes affecting core state memory.",
        }
    }
}

def generate_dynamic_mock_rca(incident: dict[str, Any], git_prs: list[dict[str, Any]]) -> dict[str, Any]:
    """Generates a scenario-based mock RCA for real-world simulation flavor."""
    service = incident.get("affected_service", "unknown-service")
    error = incident.get("error_pattern", "Unexpected Anomaly")
    
    # Select Scenario
    scenario_key = "LOGIC"
    if any(k in error.upper() for k in ["DB", "DATABASE", "CONNECTION", "TIMEOUT", "POOL"]):
        scenario_key = "DATABASE"
    elif any(k in error.upper() for k in ["MEMORY", "OOM", "GC", "THROTTLE"]):
        scenario_key = "RESOURCE"
    
    template = SCENARIO_TEMPLATES[scenario_key]
    causal_pr = git_prs[0] if git_prs else None

    # Inject variables into template
    def fmt(s): return s.format(service=service, error=error)
    
    return {
        "root_cause": fmt(template["root_cause"]),
        "causal_commit": causal_pr.get("sha") if causal_pr else None,
        "causal_repo": causal_pr.get("repo") if causal_pr else None,
        "causal_pr": causal_pr.get("number") if causal_pr else None,
        "five_whys": [
            {"why": w["why"], "question": fmt(w["question"]), "answer": fmt(w["answer"])}
            for w in template["five_whys"]
        ],
        "impact_analysis": {
            "affected_users": 280 if scenario_key == "DATABASE" else 45,
            "stalled_transactions": 32 if scenario_key == "DATABASE" else 4,
            "revenue_at_risk": "$12,000/hr" if scenario_key == "DATABASE" else "$850/hr",
            "duration_minutes": 22,
        },
        "action_items": {
            "corrective_actions": [
                {"action": fmt(template["action_items"]["corrective"]), "owner": "on-call-sre", "due_date": "Now", "status": "Open"},
            ],
            "preventive_actions": [
                {"action": fmt(template["action_items"]["preventive"]), "owner": "dev-team", "due_date": "Next Sprint", "status": "Open"},
                {"action": "Conduct post-mortem review with the architecture board.", "owner": "sre-lead", "due_date": "End of week", "status": "Open"},
            ],
            "systemic_actions": [
                {"action": "Audit systemic failure domain boundaries for similar services.", "owner": "arch-council", "due_date": "End of Month", "status": "Open"},
            ],
        },
    }


# ── Prompt Builder ─────────────────────────────────────────────────────────────

def _build_rca_prompt(
    incident: dict[str, Any],
    rag_context: list[dict[str, Any]],
    git_prs: list[dict[str, Any]],
) -> str:
    rag_text = "\n".join(
        [f"  [{i+1}] ({r.get('doc_type','?')}) {r.get('title','')}: {r.get('text','')[:400]}" for i, r in enumerate(rag_context)]
    ) or "  No similar incidents found in knowledge base."

    git_text = "\n".join(
        [f"  - PR #{p['number']} '{p['title']}' by @{p['author']} merged {p['merged_at']} (repo: {p['repo']})" for p in git_prs]
    ) or "  No recent PRs in the correlation window."

    return f"""System: You are SentinelOps, a Senior SRE agent.
You have been given an incident report, historical context, and recent Git activity.
Your job is to produce a structured RCA in JSON.

## Incident
Service:       {incident.get('affected_service', 'unknown')}
Severity:      {incident.get('severity', 'unknown')}
Error Pattern: {incident.get('error_pattern', 'unknown')}
Error Rate:    {incident.get('error_rate_pct', 'N/A')}%
Sanitized Trace (excerpt):
{str(incident.get('sanitized_trace', ''))[:1500]}

## Historical Context (similar past incidents / runbooks)
{rag_text}

## Recent Git Activity (merged in last 24h across all registered repos)
{git_text}

## Instructions
Return ONLY a valid JSON object with these exact keys:
- root_cause: string (one clear sentence identifying the root cause)
- causal_commit: string | null (git commit SHA if identifiable, else null)
- causal_repo: string | null (repository name if identifiable, else null)
- causal_pr: integer | null (PR number if identifiable, else null)
- five_whys: array of exactly 5 objects with keys: why (int 1-5), question (str), answer (str)
- impact_analysis: object with keys: affected_users (int), stalled_transactions (int), revenue_at_risk (str), duration_minutes (int)
- action_items: object with keys:
    corrective_actions: array of {{action, owner, due_date, status}} (fix NOW)
    preventive_actions: array of {{action, owner, due_date, status}} (prevent recurrence)
    systemic_actions: array of {{action, owner, due_date, status}} (address systemic gaps)

Return ONLY valid JSON. No markdown. No explanation."""


async def _invoke_local_ollama(prompt: str) -> tuple[dict[str, Any], int | None, str | None]:
    """Invoke local Ollama/Qwen for sovereign, real-time RCA generation."""
    import httpx
    model_name = "qwen2.5-coder:3b"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("response", "{}")
                if content.strip().startswith("```"):
                   content = content.replace("```json", "").replace("```", "").strip()
                rca = json.loads(content)
                return rca, 0, f"ollama:{model_name}"
    except Exception as e:
        logger.warning(f"Ollama local connector failed: {e}")
    return None, None, None

async def generate_rca(
    incident: dict[str, Any],
    rag_context: list[dict[str, Any]],
    git_prs: list[dict[str, Any]],
) -> tuple[dict[str, Any], int | None, str]:
    """
    Returns: (rca_dict, token_count, model_name)
    """
    prompt = _build_rca_prompt(incident, rag_context, git_prs)

    # Layer 1: Attempt Cloud Bedrock
    if settings.aws_region and settings.bedrock_model_id:
        try:
            client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
            # ... invocation code ...
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2048,
                "temperature": 0.1,
                "messages": [{"role": "user", "content": prompt}],
            })
            response = client.invoke_model(modelId=settings.bedrock_model_id, body=body)
            result = json.loads(response["body"].read())
            content = result["content"][0]["text"].strip()
            tokens = result.get("usage", {}).get("output_tokens", 0)
            
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"): content = content[4:]

            return json.loads(content), tokens, f"bedrock:{settings.bedrock_model_id}"
        except Exception:
            pass

    # Layer 2: Attempt Local Ollama (Sovereign)
    ollama_rca, tokens, model = await _invoke_local_ollama(prompt)
    if ollama_rca:
        return ollama_rca, tokens, model

    # Layer 3: Deterministic Mock Fallback
    return generate_dynamic_mock_rca(incident, git_prs), 0, "mock:template"

def get_active_engine_name() -> str:
    """Helper for UI to show what is actually configured."""
    # This logic matches the generation tier order
    if settings.aws_region and settings.bedrock_model_id:
        try:
            import boto3
            # Check for generic credentials
            session = boto3.Session()
            if session.get_credentials():
                return f"Bedrock (Claude 3.5 Sonnet)"
        except Exception:
            pass
    
    return "Local Ollama (Qwen 2.5 Coder)"
