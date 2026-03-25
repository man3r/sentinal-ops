#!/bin/bash
# SentinelOps Development Startup Script
# Usage: ./scripts/start_dev.sh

# 1. Colors and Setup
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Ensure we're in the repository root
cd "$(dirname "$0")/.." || exit

# Ensure logs directory exists
mkdir -p logs

echo -e "${BLUE}>>> Starting SentinelOps Development Environment...${NC}"

# 2. Check for .env file
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found. Please create one from .env.example.${NC}"
    exit 1
fi

# 3. Start Docker dependencies
echo -e "${BLUE}>>> Starting Docker dependencies (Postgres, OpenSearch)...${NC}"
docker compose up -d

# 4. Wait for Postgres to be ready
echo -e "${BLUE}>>> Waiting for Postgres to be healthy...${NC}"
MAX_RETRIES=30
RETRIES=0
until docker exec sentinelops-postgres pg_isready -U postgres > /dev/null 2>&1 || [ $RETRIES -eq $MAX_RETRIES ]; do
  echo -n "."
  sleep 1
  ((RETRIES++))
done

if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo -e "${RED}[TIMEOUT] Postgres failed to become healthy.${NC}"
    exit 1
fi
echo -e "${GREEN}[OK]${NC}"

# 5. Run Database Migrations
echo -e "${BLUE}>>> Running DB Migrations (Alembic)...${NC}"
./.venv/bin/alembic upgrade head
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Alembic migrations failed. See log for details.${NC}"
    exit 1
fi

# 6. Start Services in Background
echo -e "${BLUE}>>> Launching Services (Logs redirected to ./logs/)...${NC}"

# Ollama Global Check
OLLAMA_PID=""
if command -v ollama &> /dev/null; then
    if ! pgrep -x "ollama" > /dev/null; then
        echo -e "${BLUE}>>> Starting Local Ollama LLM Service...${NC}"
        ollama serve > logs/ollama.log 2>&1 &
        OLLAMA_PID=$!
        sleep 2
    else
        echo -e "${GREEN}>>> Ollama is already running.${NC}"
    fi
else
    echo -e "${YELLOW}>>> Ollama not found. Local LLM reasoning will be disabled.${NC}"
fi

# Perception Engine (Port 8001)
echo -e "${BLUE}>>> Starting Perception Engine on http://localhost:8001 (hot-reload enabled)...${NC}"
(cd perception_engine && ../.venv/bin/uvicorn server:app --port 8001 --host 0.0.0.0 --reload) > logs/perception.log 2>&1 &
PERCEPTION_PID=$!

# SentinelOps Agent (Port 8000)
echo -e "${BLUE}>>> Starting SentinelOps Agent on http://localhost:8000 (hot-reload enabled)...${NC}"
./.venv/bin/uvicorn agent.main:app --port 8000 --host 0.0.0.0 --reload > logs/agent.log 2>&1 &
AGENT_PID=$!

# Dashboard (Port 5173)
echo -e "${BLUE}>>> Starting Dashboard on http://localhost:5173...${NC}"
(cd dashboard && npm run dev) > logs/dashboard.log 2>&1 &
DASHBOARD_PID=$!

# Ngrok Tunnel (Port 8000)
NGROK_PID=""
if command -v ngrok &> /dev/null; then
    echo -e "${BLUE}>>> Starting Ngrok tunnel for port 8000...${NC}"
    ngrok http 8000 --log=stdout > logs/ngrok.log 2>&1 &
    NGROK_PID=$!
    
    # Wait for the tunnel to initialize and retrieve the URL from the ngrok API
    sleep 3
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys, json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null)
    
    if [ -n "$NGROK_URL" ]; then
        echo -e "${GREEN}>>> Ngrok Tunnel Active:${NC} $NGROK_URL"
        echo -e "${YELLOW}>>> Update Slack Interaction URL to:${NC} $NGROK_URL/slack/actions"
    else
        echo -e "${YELLOW}>>> Ngrok started but URL not found. Check ./logs/ngrok.log${NC}"
    fi
else
    echo -e "${YELLOW}>>> Ngrok not found. Skipping tunnel.${NC}"
fi

# 7. Cleanup on Exit
function cleanup {
    echo -e "\n${YELLOW}>>> Shutting down processes (PIDs: $PERCEPTION_PID $AGENT_PID $DASHBOARD_PID $NGROK_PID $OLLAMA_PID)...${NC}"
    kill "$PERCEPTION_PID" "$AGENT_PID" "$DASHBOARD_PID" "$NGROK_PID" "$OLLAMA_PID" 2>/dev/null
    echo -e "${GREEN}>>> Clean exit.${NC}"
    exit
}

trap cleanup SIGINT SIGTERM

echo -e "${GREEN}>>> All services are running!${NC}"
echo -e "${BLUE}Dashboard:${NC} http://localhost:5173"
echo -e "${BLUE}Agent API Docs:${NC} http://localhost:8000/docs"
echo -e "${YELLOW}Press [Ctrl+C] to stop all services.${NC}"

# Keep script running
wait
