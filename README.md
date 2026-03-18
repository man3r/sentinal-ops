# SentinelOps v1.0

The VPC-native AI SRE Agent for high-stakes environments.

## Quickstart (Local Development)

### Prerequisites
- Python 3.12+
- Docker & Docker Compose
- ngrok (for Slack integration)

### Setup

```bash
# 1. Virtual Environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Environment Variables
cp .env.example .env

# 3. Start Database
docker-compose up -d postgres pgadmin

# 4. Run Migrations
alembic upgrade head

# 5. Start Agent Controller
uvicorn agent.main:app --reload --port 8000
```

### Next Steps
- Head to Phase 1 in the `sentinel_ops_phase_plan.md`.
