"""
Llama 3.2 3B Perception Engine Server Wrapper
Runs separately from the main Agent Controller. 
Uses FastAPI, but in production would run natively with vLLM.
"""
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SentinelOps Perception Engine (Llama 3B)")

class LogBatchRequest(BaseModel):
    service_name: str
    trace_text: str
    error_rate_pct: float

class InferenceResponse(BaseModel):
    is_anomaly: bool
    confidence: float
    detected_pattern: str

# MOCK LLAMA MODEL LOADING
logger.info("Loading Llama 3.2 3B Model into memory... (MOCKED)")

import re

# Sophisticated Pattern Library for Simulation
KNOWN_PATTERNS = {
    r"ZeroDivisionError": ("Arithmetic Error: Division by Zero", 0.99),
    r"psycopg2\.OperationalError.*connection": ("Database: Connection Pool Exhausted", 0.95),
    r"Timeout.*after \d+ms": ("Network: Latency SLO Violation", 0.88),
    r"MemoryError": ("System: Out of Memory (OOM)", 0.98),
    r"AttributeError: 'NoneType'": ("Logic: Null Resource Access", 0.92),
    r"BrokenPipeError": ("Infrastructure: Gateway Socket Closed", 0.85),
    r"ValidationError": ("Client: Malformed API Request", 0.70),
}

@app.post("/triage", response_model=InferenceResponse)
async def triage_log_batch(request: LogBatchRequest):
    """
    Simulates Llama 3.2 3B logic by matching sanitized logs against
    known signature patterns and generating a confidence score.
    """
    logger.info(f"Triaging logs for service: {request.service_name}")
    
    detected_pattern = "Normal execution"
    confidence = 0.1
    is_anomaly = False

    # Perform recursive pattern matching (simulating local model triage)
    for regex, (title, base_conf) in KNOWN_PATTERNS.items():
        if re.search(regex, request.trace_text, re.IGNORECASE):
            detected_pattern = title
            is_anomaly = True
            # Boost confidence if the error rate is high
            confidence = min(0.99, base_conf + (request.error_rate_pct / 500))
            break
            
    if not is_anomaly and ("Error" in request.trace_text or "Exception" in request.trace_text):
        detected_pattern = "Uncategorized Runtime Anomaly"
        is_anomaly = True
        confidence = 0.65

    return InferenceResponse(
        is_anomaly=is_anomaly,
        confidence=confidence,
        detected_pattern=detected_pattern
    )

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
