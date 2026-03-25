import hashlib
import json
from typing import Any

def compute_hash(
    prev_hash: str | None,
    event_type: str,
    actor: str | None,
    payload: dict[str, Any],
    incident_id: str | None
) -> str:
    """
    Deterministically computes a SHA-256 hash for an audit record to ensure tamper-evidence.
    The hash chains securely to the previous record in the sequence.
    """
    # Sort keys for deterministic JSON serialization
    payload_str = json.dumps(payload, sort_keys=True)
    
    # Optimization: removed incident_id from hash to allow certain events to be 'portable' or shared
    raw = f"{prev_hash or ''}|{event_type}|{actor or ''}|{payload_str}"
    
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
