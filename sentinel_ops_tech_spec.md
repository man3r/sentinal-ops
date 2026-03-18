# Tech Spec: SentinelOps v1.0 — The Sovereign SRE Agent

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-03-18  
**Authors:** Engineering Team  

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack Decisions](#3-tech-stack-decisions)
4. [Module Design](#4-module-design)
5. [Data Models](#5-data-models)
6. [API Contracts](#6-api-contracts)
7. [Security & Data Privacy](#7-security--data-privacy)
8. [Auditability Implementation](#8-auditability-implementation)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Local Development Setup](#10-local-development-setup)

---

## 1. Product Overview

### 1.1 Problem Statement

High-stakes enterprise platforms suffer from long Mean Time to Resolution (MTTR) during incidents — averaging **45 minutes** due to manual investigation toil. Engineers must:

1. Detect anomalies by watching dashboards or waiting for alerts
2. Manually correlate errors with recent code changes
3. Identify root cause by sifting through logs and Git history
4. Draft a mitigation plan and get approvals
5. Execute a fix or rollback

SentinelOps eliminates steps 1–4 autonomously.

### 1.2 Solution

SentinelOps is a **VPC-native AI agent** that:

- Continuously watches system telemetry (logs, metrics, K8s events)
- Classifies anomalies using a local LLM (no data leaves the VPC)
- Correlates incidents with recent Git activity across all registered repos
- Generates a structured RCA (with 5 Whys + Action Items) via Claude 3.5 Sonnet
- Delivers a human-governed mitigation prompt via Slack
- Maintains a full immutable audit trail for regulatory compliance

### 1.3 Autonomy Level

> **Level 2 Autonomy** — The agent investigates and recommends; humans approve all write actions.

No rollback, code deployment, or infrastructure change is executed without an explicit human click in Slack.

### 1.4 Key Metrics

| Metric | Baseline | Target |
|---|---|---|
| MTTR | 45 min | < 10 min |
| MTTD | 10–15 min | < 2 min |
| Triage toil eliminated | 0% | > 80% |
| RCA accuracy | N/A | > 85% |

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```mermaid
graph TB
    subgraph VPC["AWS VPC (Private)"]
        subgraph Ingestion["Signal Ingestion"]
            CW[CloudWatch Logs] --> KF[Kinesis Firehose]
            DD[Datadog Metrics] --> APIGW[API Gateway - VPC]
            K8S[K8s Events / Prometheus] --> KF
            APIGW --> KF
        end

        subgraph Perception["Perception Engine (EC2 c5.2xlarge)"]
            KF --> PE[Llama 3.2 3B on CPU]
            PE --> PII[PII Sanitizer]
            PII --> SEV{Severity\nClassifier}
        end

        subgraph Agent["Agent Controller (ECS Fargate)"]
            SEV -->|SEV-1 / SEV-2| RL[Reasoning Loop\nOrchestrator]
            SEV -->|SEV-3| AUDITLOG[(Audit Log\nPostgreSQL)]
            RL --> VDB[(OpenSearch Serverless\nVector DB)]
            RL --> GIT[Git Correlator]
            RL --> BED
        end

        subgraph Storage["Storage Layer"]
            PG[(PostgreSQL RDS\nMulti-AZ)]
            S3[(S3 - WORM\nObject Lock)]
            AUDITLOG --> PG
        end

        subgraph Frontend["Admin Dashboard (ECS Fargate)"]
            REACT[React + Vite\nGovernance UI]
        end
    end

    subgraph AWS_Managed["AWS Managed (via PrivateLink)"]
        BED[AWS Bedrock\nClaude 3.5 Sonnet]
    end

    subgraph External["External Systems"]
        GIT --> GITHUB[GitHub / GitLab / Bitbucket]
        RL --> SLACK[Slack Bot]
        SLACK -->|Button Click| AGENT_HOOK[/slack/actions\nFastAPI endpoint/]
        AGENT_HOOK --> EXEC[Mitigation Executor]
        EXEC --> JIRA[Jira API]
        EXEC --> K8S_EXEC[kubectl rollback]
        PG --> REACT
        S3 --> REACT
    end

    BED --> RL
```

### 2.2 Data Flow Diagram

```mermaid
sequenceDiagram
    participant CW as CloudWatch Logs
    participant KF as Kinesis Firehose
    participant PE as Perception Engine (Llama 3B)
    participant AC as Agent Controller (FastAPI)
    participant VDB as Vector DB (OpenSearch)
    participant GIT as Git Correlator
    participant BED as Bedrock (Claude 3.5)
    participant SLACK as Slack
    participant ENG as Engineer
    participant EXEC as Mitigation Executor

    CW->>KF: Raw log stream (JSON)
    KF->>PE: Batch of log events
    PE->>PE: Semantic filter (95% noise dropped)
    PE->>PE: PII sanitization (mask customer IDs, transaction amounts)
    PE->>AC: Sanitized incident summary + severity (SEV-1/2)

    AC->>VDB: Query: similar past incidents + runbooks
    VDB-->>AC: Top-K historical context

    AC->>GIT: Fetch last 5-10 PRs across registered repos
    GIT-->>AC: Git diff + commit metadata

    AC->>BED: [Error Trace + Git Diff + Historical Context]
    BED-->>AC: RCA JSON (root cause, 5 Whys, confidence score, commit SHA)

    AC->>SLACK: Post Block Kit alert (RCA summary + buttons)
    SLACK->>ENG: Notification with [Approve Rollback] [Create Jira]

    ENG->>SLACK: Clicks [Approve Rollback]
    SLACK->>AC: POST /slack/actions (payload with actor SSO)

    AC->>AC: Guardrail gate check (Layer 1)
    AC->>EXEC: Dispatch rollback action
    EXEC->>GIT: git revert + PR creation
    EXEC->>JIRA: Create ticket (if requested)

    AC->>AC: Write audit record (hash + chain)
```

### 2.3 Component Interaction Map

```mermaid
graph LR
    subgraph Core["Core Services"]
        AC[Agent Controller\nFastAPI + asyncio]
        PE[Perception Engine\nLlama 3.2 3B]
        ME[Mitigation Engine]
        AU[Audit Logger]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL RDS)]
        OS[(OpenSearch Serverless)]
        S3[(S3 WORM)]
        SM[AWS Secrets Manager]
    end

    subgraph AI["AI Layer"]
        BED[Bedrock Claude 3.5]
        LLM[Llama 3.2 3B CPU]
    end

    AC <--> PE
    AC <--> ME
    AC <--> AU
    AC <--> OS
    AC <--> BED
    PE <--> LLM
    AU <--> PG
    AU <--> S3
    AC <--> SM
    ME --> PG
```

---

## 3. Tech Stack Decisions

### 3.1 Decision Log

| Component | Choice | Alternatives Considered | Rationale |
|---|---|---|---|
| Agent Controller | Python (`asyncio` + FastAPI) | Go (Golang) | Python has first-class SDKs for all AI/ML integrations (boto3, Slack, vLLM); Go's speed advantage is irrelevant when bottleneck is LLM latency (~2–10s). IP protection via private ECR in VPC. |
| Triage Model | Llama 3.2 3B on CPU (c5.2xlarge) | Llama 3.1 8B on GPU (g5.xlarge) | 8B on GPU = $864/mo; 3B on CPU = $245/mo (65% cheaper). Triage is binary classification — 8B is overkill. Raw logs never leave VPC. |
| Reasoning Model | AWS Bedrock Claude 3.5 Sonnet | Self-hosted LLM, GPT-4 | Bedrock is PrivateLink-accessible (stays in AWS network), pay-per-use, no infra management, highest benchmark accuracy for multi-step reasoning. Only receives sanitized summaries — no raw PII. |
| Vector DB | Amazon OpenSearch Serverless | Pinecone, Weaviate, pgvector | Already in AWS VPC; serverless auto-scaling; no data egress risk; native integration with existing IAM. |
| Relational DB | PostgreSQL (RDS Multi-AZ) | MySQL, DynamoDB | ACID compliance for audit trail; rich querying for incident timelines; Multi-AZ for 99.9% availability. |
| Frontend | React + Vite + Tailwind CSS | Next.js, Vue | Lightweight, fast build times; Tailwind for rapid admin UI iteration; Vite for HMR in development. |
| Notification | Slack Block Kit | MS Teams (v2), Email | Slack is universal in engineering teams; Block Kit supports interactive buttons natively; free tier sufficient for dev/test. |
| Secret Management | AWS Secrets Manager | HashiCorp Vault, .env files | Native AWS integration; automatic rotation; VPC-accessible without internet egress. |

### 3.2 Repository Structure

```
sentinel-ops/
├── agent/                          # Agent Controller (FastAPI)
│   ├── main.py                     # FastAPI app entrypoint
│   ├── config.py                   # Settings (pydantic-settings)
│   ├── modules/
│   │   ├── perception/
│   │   │   ├── consumer.py         # Kinesis Firehose consumer
│   │   │   ├── triage.py           # Llama 3B inference client
│   │   │   ├── pii_sanitizer.py    # PII masking
│   │   │   └── severity.py        # SEV-1/2/3 classifier
│   │   ├── reasoning/
│   │   │   ├── orchestrator.py     # Reasoning loop coordinator
│   │   │   ├── vector_retrieval.py # OpenSearch RAG queries
│   │   │   ├── git_correlator.py  # GitHub/GitLab/Bitbucket client
│   │   │   └── bedrock_client.py   # Claude 3.5 Sonnet via boto3
│   │   ├── mitigation/
│   │   │   ├── slack_notifier.py   # Block Kit composer + sender
│   │   │   ├── slack_handler.py    # /slack/actions webhook handler
│   │   │   ├── guardrails.py       # Layer 1 hard gate enforcement
│   │   │   └── executor.py         # Rollback + Jira actions
│   │   └── audit/
│   │       ├── logger.py           # Immutable audit record writer
│   │       └── hasher.py           # SHA-256 hash chaining
│   ├── models/                     # SQLAlchemy ORM models
│   ├── api/                        # FastAPI route handlers
│   └── tests/
├── perception-engine/              # Llama 3B inference service
│   ├── server.py                   # FastAPI inference server
│   ├── model_loader.py             # Llama model init
│   └── Dockerfile
├── dashboard/                      # React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Incidents.tsx
│   │   │   ├── AuditTrail.tsx
│   │   │   ├── ReasoningTrace.tsx
│   │   │   ├── Repositories.tsx
│   │   │   ├── Guardrails.tsx
│   │   │   └── TokenSpend.tsx
│   │   └── components/
│   └── vite.config.ts
├── infra/                          # Terraform / CDK
│   ├── vpc.tf
│   ├── ecs.tf
│   ├── rds.tf
│   └── opensearch.tf
├── sentinel_ops_prd.md
└── sentinel_ops_tech_spec.md
```

---

## 4. Module Design

### 4.1 Perception Engine

**Purpose:** 24/7 always-on log triage. Raw logs never leave VPC.

**Runtime:** Dedicated EC2 c5.2xlarge (8 vCPU, 16 GB RAM), systemd-managed.

**Internal Architecture:**

```mermaid
graph LR
    KF[Kinesis Firehose\nBatch Consumer] --> BUF[Event Buffer\nasyncio Queue]
    BUF --> FILT[Llama 3.2 3B\nSemantic Filter]
    FILT -->|Noise - 95%| DROP[Drop + Hash-log]
    FILT -->|Signal| PII[PII Sanitizer\nRegex + NER]
    PII --> SEV[Severity Classifier\nSEV-1 / 2 / 3]
    SEV -->|SEV-3| AUDIT[Audit Log only]
    SEV -->|SEV-1/2| HTTP[HTTP POST\nto Agent Controller]
```

**Llama 3B Prompt Template:**
```
System: You are a log anomaly classifier for a production environment.
Classify the following log batch as one of: [NORMAL, SEV1_CRITICAL, SEV2_HIGH, SEV3_LOW].
Only flag SEV1 for: 5xx errors on auth, payment, or core endpoints.
Respond with JSON only: {"classification": "...", "confidence": 0.0-1.0, "reason": "..."}

User: [LOG BATCH - max 2000 tokens]
```

**PII Sanitization Rules:**
| Pattern | Action |
|---|---|
| Customer ID (UUID format) | Replace with `[CUST_ID_REDACTED]` |
| Transaction amount (numeric after `amount:`, `tx_amt:`) | Replace with `[AMOUNT_REDACTED]` |
| PAN / Aadhaar (Indian ID formats) | Replace with `[GOV_ID_REDACTED]` |
| Email addresses | Replace with `[EMAIL_REDACTED]` |
| Phone numbers (10-digit Indian format) | Replace with `[PHONE_REDACTED]` |

**Output to Agent Controller:**
```json
{
  "incident_id": "uuid-v4",
  "severity": "SEV1_CRITICAL",
  "confidence": 0.94,
  "affected_service": "checkout-api",
  "error_pattern": "NullPointerException in PaymentGateway.process()",
  "error_rate_pct": 12.4,
  "window_start": "2026-03-18T13:30:00Z",
  "window_end": "2026-03-18T13:35:00Z",
  "sample_count": 847,
  "sanitized_trace": "... [PII-free stack trace] ..."
}
```

---

### 4.2 Reasoning Loop

**Purpose:** Deep incident investigation using Claude 3.5 Sonnet + RAG + Git correlation.

**Orchestration flow (async, concurrent):**

```python
async def run_reasoning_loop(incident: IncidentSummary) -> RCAResult:
    # Run retrieval and git correlation concurrently
    historical_ctx, git_context = await asyncio.gather(
        retrieve_similar_incidents(incident),
        correlate_git_commits(incident)
    )
    rca = await invoke_claude(incident, historical_ctx, git_context)
    await store_rca(rca)
    await notify_slack(rca)
    return rca
```

**Vector DB Query (RAG):**
- Embed incident summary using `amazon.titan-embed-text-v2` (via Bedrock)
- Query OpenSearch k-NN index with `k=5`
- Returns: similar past incident RCAs + relevant runbook sections

**Git Correlator:**
- Queries all repos registered in Admin Dashboard (stored in PostgreSQL `repositories` table)
- For each repo: fetches PRs merged in the last 24 hours (configurable window)
- Extracts: commit SHA, PR title, author, diff summary (first 500 lines)
- Supports GitHub, GitLab, Bitbucket via unified `GitProvider` interface

**Bedrock Prompt Design:**
```
System: You are SentinelOps, a Senior SRE agent.
You have been given an incident report, historical context, and recent Git activity.
Your job is to produce a structured RCA in JSON.

GUARDRAILS (HARD RULES — DO NOT VIOLATE):
- Do not suggest any action involving: [NO_GO_ZONES from config]
- Never recommend actions with confidence < [THRESHOLD from config]

Produce output ONLY as valid JSON matching the RCA schema.

User:
## Incident Summary
{incident_summary}

## Similar Past Incidents (RAG)
{historical_context}

## Recent Git Changes (last 24h across all repos)
{git_diffs}

Generate a complete RCA JSON.
```

---

### 4.3 Mitigation Engine

**Purpose:** Human-governed action dispatch via Slack.

**Slack Block Kit Alert Structure:**

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🚨 SEV-1 Incident — checkout-api" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Incident ID:*\nSOP-2026-0318-001" },
        { "type": "mrkdwn", "text": "*Confidence:*\n94%" },
        { "type": "mrkdwn", "text": "*Causal Commit:*\n`a3f9c12` — PaymentGateway null-check removed" },
        { "type": "mrkdwn", "text": "*Repo:*\nbackend-core (by @john.doe)" }
      ]
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Root Cause:*\nNull-check removed in `PaymentGateway.process()` causes NPE when `merchant_id` is absent (new field in v2.3 contract, not backward compatible)." }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Suggested Fix:*\n```java\nif (request.getMerchantId() == null) {\n    throw new IllegalArgumentException(\"merchant_id required\");\n}\n```" }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button", "style": "danger",
          "text": { "type": "plain_text", "text": "✅ Approve Rollback" },
          "action_id": "approve_rollback",
          "value": "SOP-2026-0318-001"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "🎟 Create Jira Ticket" },
          "action_id": "create_jira",
          "value": "SOP-2026-0318-001"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "❌ Dismiss" },
          "action_id": "dismiss_incident",
          "value": "SOP-2026-0318-001"
        }
      ]
    }
  ]
}
```

**Guardrail Enforcement (Layer 1 — Hard Code Gate):**

```python
class GuardrailGate:
    def __init__(self, no_go_zones: list[str], min_confidence: float):
        self.no_go_zones = no_go_zones
        self.min_confidence = min_confidence

    def check(self, action: MitigationAction, rca: RCAResult) -> GuardrailResult:
        # Hard rule 1: No-Go zone check
        for zone in self.no_go_zones:
            if zone.lower() in action.target_service.lower():
                return GuardrailResult(
                    allowed=False,
                    reason=f"Target service '{action.target_service}' is in No-Go zone '{zone}'"
                )
        # Hard rule 2: Confidence threshold
        if rca.confidence < self.min_confidence:
            return GuardrailResult(
                allowed=False,
                reason=f"Confidence {rca.confidence:.0%} below threshold {self.min_confidence:.0%}"
            )
        return GuardrailResult(allowed=True)
```

---

### 4.4 Admin Dashboard

**Pages and responsibilities:**

| Page | Route | Purpose |
|---|---|---|
| Incident Feed | `/incidents` | Live list of all active + resolved incidents with SEV badges |
| Incident Detail | `/incidents/:id` | Full RCA, 5 Whys, action items, audit timeline |
| Reasoning Trace | `/incidents/:id/trace` | Chain-of-Thought debug view |
| Audit Trail | `/audit` | Filter by actor, date range, event type; export bundle |
| Repository Manager | `/repos` | Register/remove repos; configure auth tokens (stored in Secrets Manager) |
| Guardrail Config | `/guardrails` | Add/remove No-Go zones; set confidence threshold |
| Knowledge Base | `/knowledge` | Upload/manage RAG source documents |
| Token Spend | `/spend` | Real-time Bedrock cost; cost-per-incident chart |

---

## 5. Data Models

### 5.1 PostgreSQL Schema

```sql
-- Incidents
CREATE TABLE incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity        VARCHAR(10) NOT NULL,  -- SEV1, SEV2, SEV3
    affected_service VARCHAR(255) NOT NULL,
    status          VARCHAR(20) DEFAULT 'OPEN',  -- OPEN, ACKNOWLEDGED, RESOLVED
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    causal_commit   VARCHAR(64),
    causal_repo     VARCHAR(255),
    confidence      DECIMAL(4,3)
);

-- RCA Reports
CREATE TABLE rca_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id     UUID REFERENCES incidents(id),
    root_cause      TEXT NOT NULL,
    five_whys       JSONB NOT NULL,
    action_items    JSONB NOT NULL,
    impact_analysis JSONB NOT NULL,
    bedrock_tokens  INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log (append-only, never UPDATE or DELETE)
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    incident_id     UUID REFERENCES incidents(id),
    event_type      VARCHAR(50) NOT NULL,  -- TRIAGE, RCA_GENERATED, ALERT_SENT, HUMAN_DECISION, etc.
    actor           VARCHAR(255),           -- SSO identity (null for system events)
    payload         JSONB NOT NULL,
    record_hash     VARCHAR(64) NOT NULL,   -- SHA-256 of this record
    prev_hash       VARCHAR(64),            -- SHA-256 of previous record (chain)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_incident ON audit_log(incident_id);
CREATE INDEX idx_audit_actor ON audit_log(actor);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- Registered Repositories
CREATE TABLE repositories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    provider        VARCHAR(20) NOT NULL,   -- GITHUB, GITLAB, BITBUCKET
    url             VARCHAR(512) NOT NULL,
    secret_arn      VARCHAR(512) NOT NULL,  -- AWS Secrets Manager ARN for token
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Guardrail Rules
CREATE TABLE guardrail_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type       VARCHAR(20) NOT NULL,   -- NO_GO_ZONE, CONFIDENCE_THRESHOLD
    value           TEXT NOT NULL,           -- service name or threshold float
    description     TEXT,
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 OpenSearch Index Schema

```json
{
  "index": "sentinelops-incidents",
  "mappings": {
    "properties": {
      "incident_id":      { "type": "keyword" },
      "affected_service": { "type": "keyword" },
      "root_cause":       { "type": "text" },
      "error_pattern":    { "type": "text" },
      "causal_commit":    { "type": "keyword" },
      "embedding":        { "type": "knn_vector", "dimension": 1536 },
      "severity":         { "type": "keyword" },
      "created_at":       { "type": "date" }
    }
  },
  "settings": {
    "index": {
      "knn": true,
      "knn.algo_param.ef_search": 512
    }
  }
}
```

---

## 6. API Contracts

### 6.1 Internal Agent Controller API (FastAPI)

#### `POST /internal/incident`
Triggered by Perception Engine when an anomaly is detected.

**Request:**
```json
{
  "incident_id": "uuid-v4",
  "severity": "SEV1_CRITICAL | SEV2_HIGH",
  "affected_service": "string",
  "confidence": 0.94,
  "error_pattern": "string",
  "error_rate_pct": 12.4,
  "window_start": "ISO-8601",
  "window_end": "ISO-8601",
  "sanitized_trace": "string"
}
```

**Response:** `202 Accepted`
```json
{ "incident_id": "uuid-v4", "status": "reasoning_loop_triggered" }
```

---

#### `POST /slack/actions`
Slack Interactivity webhook — handles button clicks.

**Request:** (Slack-formatted `application/x-www-form-urlencoded`)
- Verified via Slack signing secret (HMAC-SHA256)

**Parsed payload fields:**
```json
{
  "type": "block_actions",
  "actions": [{ "action_id": "approve_rollback | create_jira | dismiss_incident", "value": "incident_id" }],
  "user": { "id": "SLACK_USER_ID", "name": "john.doe" }
}
```

**Response:** `200 OK` (must respond within 3s)
```json
{ "text": "✅ Rollback approved. Executing..." }
```

---

#### `GET /api/incidents`
List incidents for Dashboard.

**Query params:** `?severity=SEV1&status=OPEN&limit=20&offset=0`

**Response:**
```json
{
  "total": 42,
  "items": [
    {
      "id": "uuid",
      "severity": "SEV1_CRITICAL",
      "affected_service": "checkout-api",
      "status": "RESOLVED",
      "causal_commit": "a3f9c12",
      "confidence": 0.94,
      "created_at": "ISO-8601",
      "resolved_at": "ISO-8601"
    }
  ]
}
```

---

#### `GET /api/incidents/:id/rca`
Fetch full RCA for an incident.

**Response:**
```json
{
  "incident_id": "uuid",
  "root_cause": "string",
  "causal_commit": "SHA",
  "causal_repo": "backend-core",
  "five_whys": [...],
  "action_items": { "corrective": [...], "preventive": [...], "systemic": [...] },
  "impact_analysis": { "affected_users": 1200, "stalled_transactions": 340, "revenue_at_risk": "$68,000", "duration_minutes": 8 },
  "audit": { "triage_timestamp": "...", "approved_by": "john.doe", ... }
}
```

---

#### `GET /api/audit`
Audit trail with filtering.

**Query params:** `?incident_id=&actor=&event_type=&from=&to=&limit=50`

**Response:**
```json
{
  "total": 156,
  "items": [
    {
      "id": 1,
      "incident_id": "uuid",
      "event_type": "HUMAN_DECISION",
      "actor": "john.doe",
      "payload": { "action": "approve_rollback", "incident_id": "..." },
      "record_hash": "sha256...",
      "created_at": "ISO-8601"
    }
  ]
}
```

---

#### `POST /api/repositories`
Register a new Git repository.

**Request:**
```json
{
  "name": "backend-core",
  "provider": "GITHUB",
  "url": "https://github.com/org/backend-core",
  "token": "ghp_xxxx"
}
```

**Response:** `201 Created`
```json
{ "id": "uuid", "secret_arn": "arn:aws:secretsmanager:..." }
```

---

#### `POST /api/guardrails`
Add a guardrail rule.

**Request:**
```json
{
  "rule_type": "NO_GO_ZONE",
  "value": "payment-gateway",
  "description": "Payment Gateway is off-limits for agent actions"
}
```

**Response:** `201 Created`

---

### 6.2 Perception Engine Internal API

#### `POST /triage`
Called by Kinesis consumer to triage a log batch.

**Request:**
```json
{
  "batch_id": "uuid",
  "source": "cloudwatch | datadog | k8s",
  "events": ["raw log line 1", "raw log line 2"]
}
```

**Response:**
```json
{
  "classification": "SEV1_CRITICAL | SEV2_HIGH | SEV3_LOW | NORMAL",
  "confidence": 0.94,
  "affected_service": "checkout-api",
  "sanitized_summary": "...",
  "pii_fields_redacted": 3
}
```

---

#### `GET /health`
Used by systemd watchdog every 30s.

**Response:** `200 OK`
```json
{ "status": "healthy", "model_loaded": true, "uptime_seconds": 86400 }
```

---

## 7. Security & Data Privacy

### 7.1 Data Boundary Enforcement

```mermaid
graph LR
    RAW[Raw Logs\nPII + Financial Data] -->|stays inside VPC| PE[Perception Engine\nVPC-native]
    PE -->|sanitized summary only| AC[Agent Controller]
    AC -->|sanitized summary only| BED[Bedrock via PrivateLink]
    BED -->|RCA JSON, no PII| AC
```

- **Rule:** Raw log data never crosses the VPC boundary under any condition.
- **Enforcement:** The PII sanitizer runs before any HTTP call to the Agent Controller or Bedrock.
- **Verification:** Integration tests assert that sanitized payloads contain no PII-pattern matches.

### 7.2 Secrets Management

All credentials are stored in **AWS Secrets Manager** and fetched at runtime. Zero secrets in environment variables or config files.

| Secret | Rotation |
|---|---|
| Git provider tokens (GitHub/GitLab/Bitbucket) | Manual (on compromise) |
| Slack Bot Token | Manual |
| PagerDuty Integration Key | Manual |
| Jira API Token | Manual |
| PostgreSQL credentials | Automatic (30 days) |

### 7.3 Network Security

- All services deployed within a **private VPC subnet** — no public IP addresses.
- Bedrock accessed exclusively via **VPC PrivateLink** (no internet egress).
- External webhooks (Slack, Datadog) enter via **API Gateway with VPC link** — never directly to the agent.
- **Security Groups** scoped to principle of least privilege: each service only accepts traffic from its direct upstream.

### 7.4 Authentication

| Interface | Auth Method |
|---|---|
| Dashboard → Agent API | AWS Cognito (JWT Bearer token) |
| Slack → `/slack/actions` | Slack signing secret (HMAC-SHA256 verification) |
| Agent → Bedrock | IAM Role (ECS Task Role) |
| Agent → RDS | IAM DB Authentication |
| Agent → Secrets Manager | IAM Role |

---

## 8. Auditability Implementation

### 8.1 Hash Chain Algorithm

Every audit record is tamper-evident via SHA-256 hash chaining:

```python
import hashlib, json

def compute_audit_hash(record: dict, prev_hash: str | None) -> str:
    payload = {
        "incident_id": record["incident_id"],
        "event_type":  record["event_type"],
        "actor":       record["actor"],
        "payload":     record["payload"],
        "created_at":  record["created_at"].isoformat(),
        "prev_hash":   prev_hash or "GENESIS"
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
```

### 8.2 S3 WORM Archival

- Audit records are batch-exported to S3 daily.
- S3 bucket configured with **Object Lock (Compliance mode)** — records cannot be deleted or overwritten for 5 years, even by the AWS account root user.
- Exports are in newline-delimited JSON (`.ndjson`) with AES-256 server-side encryption.

### 8.3 Audit Event Types Reference

| Event Type | Trigger | Actor |
|---|---|---|
| `LOG_INGESTION` | Every Kinesis batch processed | SYSTEM |
| `TRIAGE_DECISION` | Perception Engine classifies a batch | SYSTEM |
| `REASONING_STARTED` | Agent Controller triggers Reasoning Loop | SYSTEM |
| `RCA_GENERATED` | Claude returns RCA result | SYSTEM |
| `ALERT_SENT` | Slack Block Kit message posted | SYSTEM |
| `HUMAN_DECISION` | Engineer approves/rejects/dismisses | SSO Identity |
| `GUARDRAIL_TRIGGERED` | Hard gate blocks an action | SYSTEM |
| `MITIGATION_EXECUTED` | Rollback or action dispatched | SSO Identity |
| `JIRA_CREATED` | Jira ticket created | SSO Identity |
| `ESCALATION` | SEV level auto-promoted | SYSTEM |

---

## 9. Deployment Architecture

### 9.1 AWS Infrastructure

```mermaid
graph TB
    subgraph VPC["VPC (10.0.0.0/16)"]
        subgraph Private_A["Private Subnet A (us-east-1a)"]
            ECS_A[ECS Fargate\nAgent Controller]
            DASH_A[ECS Fargate\nDashboard]
        end
        subgraph Private_B["Private Subnet B (us-east-1b)"]
            ECS_B[ECS Fargate\nAgent Controller - Standby]
        end
        subgraph Private_C["Private Subnet C (us-east-1c)"]
            EC2[EC2 c5.2xlarge\nPerception Engine]
        end
        subgraph Data_Layer["Data Layer (Private)"]
            RDS_P[(RDS Primary\nus-east-1a)]
            RDS_S[(RDS Standby\nus-east-1b)]
            OS[(OpenSearch\nServerless)]
        end
        ALB[Internal ALB]
        PL[Bedrock PrivateLink\nVPC Endpoint]
    end

    S3[(S3 WORM\nAudit Archive)]
    ECR[ECR\nPrivate Registry]
    SM[Secrets Manager]

    ALB --> ECS_A
    ALB --> ECS_B
    ECS_A --> RDS_P
    ECS_A --> OS
    ECS_A --> PL
    ECS_B --> RDS_P
    EC2 --> ECS_A
    RDS_P -.->|Multi-AZ replication| RDS_S
    ECS_A --> S3
    ECS_A --> SM
    ECS_A --> ECR
```

### 9.2 ECS Task Definitions

**Agent Controller:**
- CPU: 1 vCPU, Memory: 2 GB
- Min tasks: 2 (multi-AZ), Max: 10 (auto-scale on CPU > 70%)
- Health check: `GET /health` every 30s

**Dashboard:**
- CPU: 0.5 vCPU, Memory: 1 GB
- Min tasks: 1, Max: 3

### 9.3 CI/CD Pipeline

```mermaid
graph LR
    PR[GitHub PR] --> GHA[GitHub Actions]
    GHA --> LINT[Ruff + mypy lint]
    LINT --> TEST[pytest unit tests]
    TEST --> BUILD[Docker build]
    BUILD --> PUSH[Push to ECR\nwith SHA tag]
    PUSH --> DEPLOY[ECS rolling deploy\nblue/green]
```

---

## 10. Local Development Setup

### 10.1 Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.12+ | `brew install python@3.12` |
| Node.js | 20+ | `brew install node` |
| Docker | Latest | Docker Desktop |
| ngrok | Any | Already installed |
| AWS CLI | v2 | `brew install awscli` |

### 10.2 Quick Start

```bash
# 1. Clone and set up Python environment
git clone <repo>
cd sentinel-ops/agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Fill in: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, 
#          AWS_REGION, BEDROCK_MODEL_ID, DATABASE_URL

# 3. Start local PostgreSQL (Docker)
docker run -d --name sentinelops-pg \
  -e POSTGRES_PASSWORD=localdev \
  -e POSTGRES_DB=sentinelops \
  -p 5432:5432 postgres:16

# 4. Run DB migrations
alembic upgrade head

# 5. Start Agent Controller
uvicorn agent.main:app --reload --port 8000

# 6. Start ngrok (for Slack interactive button testing)
ngrok http 8000
# Copy HTTPS URL → paste into Slack App Interactivity settings

# 7. Start Dashboard
cd ../dashboard
npm install && npm run dev
```

### 10.3 Mocking the Perception Engine Locally

For local testing without the Llama 3B model, a mock endpoint is provided:

```bash
# Simulate an SEV-1 incident
curl -X POST http://localhost:8000/internal/incident \
  -H "Content-Type: application/json" \
  -d '{
    "incident_id": "test-001",
    "severity": "SEV1_CRITICAL",
    "affected_service": "checkout-api",
    "confidence": 0.94,
    "error_pattern": "NullPointerException in PaymentGateway",
    "error_rate_pct": 12.4,
    "window_start": "2026-03-18T13:30:00Z",
    "window_end": "2026-03-18T13:35:00Z",
    "sanitized_trace": "java.lang.NullPointerException at PaymentGateway.process(line 142)"
  }'
```

This will trigger the full Reasoning Loop → Bedrock call → Slack alert flow locally.

### 10.4 Environment Variables Reference

```bash
# Agent Controller
DATABASE_URL=postgresql+asyncpg://postgres:localdev@localhost:5432/sentinelops
OPENSEARCH_ENDPOINT=https://...us-east-1.aoss.amazonaws.com
OPENSEARCH_INDEX=sentinelops-incidents

# AWS
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_EMBED_MODEL_ID=amazon.titan-embed-text-v2:0

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_INCIDENT_CHANNEL=#incidents

# Perception Engine
PERCEPTION_ENGINE_URL=http://localhost:8001  # or EC2 private IP in AWS
LLAMA_MODEL_PATH=/models/Llama-3.2-3B-Instruct

# Feature Flags
MIN_CONFIDENCE_THRESHOLD=0.75
REASONING_TIMEOUT_SECONDS=180
```
