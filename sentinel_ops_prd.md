# PRD: SentinelOps v1.0 - The Sovereign SRE Agent

## 1. Executive Summary
**SentinelOps** is a VPC-native AI Agent designed for high-stakes enterprise environments. It proactively monitors system telemetry (Logs/Metrics), correlates error spikes with Git commits, and provides autonomous Root Cause Analysis (RCA) and human-governed mitigation.

**Primary Goal:** Reduce MTTR from 45 mins to <10 mins by eliminating manual investigation toil and providing a "Senior SRE in a box."

---

## 2. Tech Stack & Architecture Constraints
* **Agent Controller & Backend API:** Python (`asyncio` + FastAPI) for agent orchestration, AI service integration, and ecosystem compatibility. IP protection via private ECR image deployment within VPC.
* **Frontend:** React (Vite) + Tailwind CSS (Admin/Governance Dashboard).
* **Inference (Data-Tiered Model):**
    * **Local (Always-on, VPC-native):** Llama 3.2 3B on CPU (c5.2xlarge, ~$245/mo) for 24/7 log triage. Raw logs **never leave the VPC**.
    * **Managed (Reasoning):** AWS Bedrock (Claude 3.5 Sonnet) via **VPC PrivateLink** — receives only sanitized incident summaries, never raw logs or PII.
* **Database:** PostgreSQL (RDS) for metadata; Amazon OpenSearch Serverless (Vector Engine) for RAG context.
* **Interface:** Slack for "Human-in-the-loop" interaction and one-click mitigation. *(MS Teams: v2 roadmap)*

---

## 3. Core Functional Modules

### 3.1 Perception Engine (The "Eyes")
* **Multi-Signal Ingestion:** Real-time ingestion of CloudWatch Logs, Datadog Metrics, and K8s Events via Kinesis Firehose.
* **Semantic Filtering:** Local Llama 3.2 3B (CPU, inside VPC) must filter out 95% of routine "warnings." Raw logs never leave the VPC boundary.
* **PII Sanitization:** Before any escalation, strip/mask sensitive fields (customer IDs, transaction amounts, PII) to produce a structured incident summary.
* **Trigger:** Activate the "Reasoning Loop" only when a true business-impacting anomaly (e.g., 5xx spikes on critical endpoints) is detected. Only the sanitized summary is forwarded.

### 3.2 Reasoning Loop (The "Brain")
* **Context Retrieval:** Query Vector DB for similar past incidents and relevant system runbooks.
* **Git Correlation:** Automatically fetch the last 5–10 merged PRs **across all repositories registered by the client in the Admin Dashboard**. Supports cross-repo causal linking (e.g., a shared library commit breaking a downstream critical service). Scope is fully configurable per deployment.
* **Cross-Reference:** Feed `Error Trace` + `Git Diff` + `Historical Context` into Claude 3.5 Sonnet.
* **Hypothesis Generation:** Output a "Confidence Score" and a "Causal Link" identifying the specific commit and repository responsible.

### 3.3 Mitigation Engine (The "Hands")
* **Actionable Alerts:** Post a Slack block containing:
    * Root Cause Summary.
    * Suggested Fix (Code Snippet).
    * `[Approve Rollback]` & `[Create Jira Ticket]` interactive buttons.
* **Automation:** Level 2 Autonomy. No write-action is taken without a human click.

---

## 4. Admin Dashboard (Governance UI)
* **Token Spend Tracker:** Real-time Bedrock cost visibility.
* **Knowledge Base Manager:** UI for managing RAG source files (PDFs, Markdown, Confluence links).
* **Repository Manager:** UI to register, authenticate, and manage Git repositories the agent is allowed to query for commit correlation. Supports GitHub, GitLab, and Bitbucket. Scope changes take effect immediately without redeployment.
* **Guardrail Config:** UI to define "No-Go" services/zones (e.g., "Do not touch Payment Gateway") and set confidence thresholds. Guardrails are enforced via **two layers**:
    * **Layer 1 — Hard Code Gate:** Rule is checked at the agent controller level before any action is dispatched. Cannot be overridden by the LLM.
    * **Layer 2 — System Prompt Injection:** The No-Go rule is injected into every Claude prompt to prevent the model from even suggesting an action against a protected zone.
* **Reasoning Trace:** A debug view showing the "Chain of Thought" for every incident.

---

## 5. Auditability & Compliance Logging

All communications, decisions, and actions must be immutably logged for regulatory auditability (RBI, GDPR, PCI-DSS).

### 5.1 What Gets Logged
| Event | Details Captured |
|---|---|
| **Log Ingestion** | Timestamp, source service, raw signal hash (not content) |
| **Triage Decision** | Incident ID, confidence score, triage model output, sanitized summary |
| **Reasoning Loop** | Full Chain-of-Thought, Git SHAs correlated, Bedrock token usage |
| **Slack/Teams Alert Sent** | Message ID, recipient channel, full alert payload, timestamp |
| **Human Decision** | Actor (SSO identity), action taken (Approve/Reject/Ignore), timestamp |
| **Mitigation Executed** | Action type, target service, execution status, rollback SHA |
| **Jira Ticket Created** | Ticket ID, linked incident ID, creator identity |
| **Guardrail Triggered** | Rule violated, action blocked, timestamp |

### 5.2 Audit Log Storage
* **Primary Store:** PostgreSQL (RDS) — structured audit records, indexed by `incident_id` and `actor`.
* **Long-term Archive:** S3 (versioned, with Object Lock) — immutable WORM storage for regulatory retention.
* **Retention Policy:** Minimum 5 years (RBI requirement for financial records).
* **Tamper-Evidence:** Each audit record is SHA-256 hashed and chained (hash of record N includes hash of record N-1).

### 5.3 Auditability UI (Dashboard)
* **Full Incident Timeline:** End-to-end chronological trace — from first log anomaly to human approval to mitigation.
* **Actor Audit Trail:** Filter all actions by engineer identity and time range.
* **Export:** One-click export of full incident audit bundle (JSON + PDF) for regulator submission.

---

## 6. RCA Template Schema
The agent must generate structured RCAs in JSON for downstream integration:

```json
{
  "incident_id": "UUID",
  "causal_commit": "SHA-256",
  "impact_analysis": {
    "affected_users": "integer",
    "stalled_transactions": "integer",
    "revenue_at_risk": "string",
    "duration_minutes": "integer"
  },
  "root_cause": "string",

  "five_whys": [
    { "why": 1, "question": "Why did the incident occur?",              "answer": "string" },
    { "why": 2, "question": "Why did that condition exist?",            "answer": "string" },
    { "why": 3, "question": "Why was that allowed to happen?",          "answer": "string" },
    { "why": 4, "question": "Why wasn't it caught earlier?",            "answer": "string" },
    { "why": 5, "question": "Why does the underlying gap exist?",       "answer": "string" }
  ],

  "action_items": {
    "corrective_actions": [
      {
        "action": "string (immediate fix to stop the bleeding)",
        "owner": "string",
        "due_date": "ISO-8601",
        "status": "Open | In Progress | Done"
      }
    ],
    "preventive_actions": [
      {
        "action": "string (stops this specific failure from recurring)",
        "owner": "string",
        "due_date": "ISO-8601",
        "status": "Open | In Progress | Done"
      }
    ],
    "systemic_actions": [
      {
        "action": "string (addresses the deeper process / architectural gap)",
        "owner": "string",
        "due_date": "ISO-8601",
        "status": "Open | In Progress | Done"
      }
    ]
  },

  "audit": {
    "triage_timestamp": "ISO-8601",
    "reasoning_timestamp": "ISO-8601",
    "approved_by": "SSO identity",
    "approval_timestamp": "ISO-8601",
    "mitigation_executed_at": "ISO-8601",
    "audit_hash": "SHA-256"
  }
}
```

---

## 7. Non-Functional Requirements (NFRs)

### 7.1 Latency SLAs
| Pipeline Stage | Target Latency | Hard Limit |
|---|---|---|
| Log ingestion → triage decision | < 30 seconds | 60 seconds |
| Triage trigger → full RCA generated | < 3 minutes | 5 minutes |
| RCA generated → Slack alert delivered | < 15 seconds | 30 seconds |
| Human approval → mitigation executed | < 10 seconds | 20 seconds |
| **End-to-end MTTR (P95)** | **< 10 minutes** | **15 minutes** |

### 7.2 Availability
* **Agent Controller (FastAPI):** 99.9% uptime (< 8.7 hrs downtime/year). Deployed on ECS Fargate with multi-AZ redundancy.
* **Perception Engine (Llama 3B):** 99.9% uptime. Systemd-managed process with auto-restart; health-check endpoint polled every 30 seconds.
* **Bedrock (Reasoning):** Inherits AWS SLA (99.9%). Agent must handle transient failures gracefully (see Section 9).
* **PostgreSQL (RDS):** Multi-AZ with automated failover. RPO < 1 min, RTO < 2 min.

### 7.3 Scalability
* **Perception Engine:** Must process up to **50,000 log events/minute** without degrading triage latency.
* **Concurrent Incidents:** Must handle up to **10 simultaneous active incident investigations** without queuing.
* **Vector DB:** OpenSearch Serverless auto-scales; no manual capacity management required.
* **Slack/Teams:** Rate limit handling with exponential backoff; queue alerts during API throttling.

---

## 8. Incident Severity Classification

All detected anomalies are classified before triggering the Reasoning Loop.

| Severity | Criteria | Response |
|---|---|---|
| **SEV-1 — Critical** | Core transaction flow down (auth, payment, core APIs); >10% 5xx error rate; data integrity risk | Immediately page on-call (PagerDuty), alert CTO/VP Eng via Slack DM, trigger full Reasoning Loop |
| **SEV-2 — High** | Elevated error rate (2–10%); performance degradation >2x baseline; single non-critical service failure | Post to incident Slack channel, trigger Reasoning Loop, SLA: RCA within 3 min |
| **SEV-3 — Low** | Isolated warnings, transient spikes < 2 min, non-business-impacting anomalies | Log to audit trail, no alert, summarised in daily digest |

### 8.1 Escalation Rules
* A **SEV-2** that persists for > 5 minutes without human acknowledgement auto-escalates to **SEV-1**.
* A **SEV-3** cluster (≥ 5 SEV-3s on the same service within 10 min) auto-escalates to **SEV-2**.
* All escalations are logged with the escalation reason and timestamp.

---

## 9. Failure Modes & Graceful Degradation

The agent must remain partially functional even when individual subsystems fail.

| Failed Component | Degraded Behaviour | Recovery |
|---|---|---|
| **Perception Engine (Llama 3B)** | Fall back to rule-based anomaly detection (regex + threshold). Alert ops team. | Auto-restart via systemd; health check every 30s |
| **Bedrock PrivateLink unavailable** | Perception Engine continues triage. Suppress Reasoning Loop. Post Slack alert: "RCA unavailable — manual investigation required." | Retry with exponential backoff (max 5 attempts, 2-min ceiling) |
| **Agent Controller crashes** | Kinesis Firehose buffers incoming events (up to 24 hrs). No events lost. | ECS Fargate auto-restarts task; CloudWatch alarm fires to ops |
| **PostgreSQL RDS failover** | Agent pauses audit writes, queues in-memory (max 500 records). Flushes on reconnect. | Multi-AZ automatic failover, RTO < 2 min |
| **Slack/Teams API down** | Alert routed to fallback email (configurable). Incident stored in DB for dashboard retrieval. | Retry queue with 5-min intervals |
| **Vector DB unavailable** | Reasoning Loop proceeds without RAG context. Claude prompted to note "no historical context available." | Auto-reconnect; OpenSearch Serverless handles scaling transparently |

---

## 10. Integration Contracts

### 10.1 Signal Ingestion (Inbound)
| Source | Method | Auth | Data Format |
|---|---|---|---|
| CloudWatch Logs | Kinesis Firehose subscription filter | IAM Role (least-privilege) | JSON log events |
| Datadog Metrics | Datadog Webhook → API Gateway (VPC) | Datadog API key (secrets manager) | JSON metric payload |
| K8s Events | `kube-state-metrics` → Prometheus → Kinesis | Service Account token | Prometheus exposition format |

### 10.2 Git Correlation (Outbound)
| System | Method | Auth | Scope Required |
|---|---|---|---|
| GitHub | REST API v3 (`/repos/{owner}/{repo}/commits`) | GitHub App (fine-grained token) | `contents:read`, `pull_requests:read` |
| GitLab | REST API v4 (`/projects/{id}/merge_requests`) | GitLab Personal Access Token | `read_api` |
| Bitbucket | REST API 2.0 | OAuth 2.0 App | `repository:read` |

### 10.3 Notifications (Outbound)
| System | Method | Auth | Required Permissions |
|---|---|---|---|
| Slack *(MVP)* | Block Kit via Bot Token | OAuth 2.0 Bot Token | `chat:write`, `channels:read` |
| PagerDuty | Events API v2 | Integration Key (secrets manager) | `incidents:write` |
| MS Teams | Incoming Webhook / Adaptive Cards | Webhook URL (secrets manager) | N/A — *v2 roadmap* |

### 10.4 Ticketing (Outbound)
| System | Method | Auth | Required Permissions |
|---|---|---|---|
| Jira | REST API v3 (`/rest/api/3/issue`) | API Token (Basic Auth) | `BROWSE_PROJECTS`, `CREATE_ISSUES` |

---

## 11. Success Metrics & KPIs

### 11.1 Primary SRE Metrics
| Metric | Baseline (Today) | v1.0 Target | Measurement |
|---|---|---|---|
| **Mean Time to Resolution (MTTR)** | 45 min | < 10 min | Incident open → mitigation executed |
| **Mean Time to Detection (MTTD)** | 10–15 min (human) | < 2 min | First log anomaly → Slack alert |
| **Incident Triage Toil Eliminated** | 100% manual | > 80% automated | % of incidents resolved without manual investigation |

### 11.2 AI Quality Metrics
| Metric | Target | Measurement |
|---|---|---|
| **Perception Engine Precision** | > 90% | % of triggered RCAs confirmed as real incidents |
| **Perception Engine Recall** | > 99% | % of real incidents caught (no missed SEV-1s) |
| **RCA Accuracy** | > 85% | Engineer-validated correct root cause identification |
| **False Positive Rate** | < 10% | % of alerts that required no action |
| **Causal Commit Accuracy** | > 80% | Correct commit identified as root cause |

### 11.3 Operational Metrics
| Metric | Target |
|---|---|
| Agent Uptime | > 99.9% |
| Bedrock Cost / Incident | < $0.50 |
| Monthly Infrastructure Cost | < $400 (Perception Engine + Agent ECS) |
| Audit Log Completeness | 100% — zero dropped events |