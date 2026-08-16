#!/usr/bin/env bash
set -e

echo "=== Starting WhatsApp Bulk Unified Single Service ==="

# Explicitly assign scraper port to avoid collision with Railway PORT (e.g. 8080)
export SCRAPER_PORT=8787
export SCRAPER_URL="http://127.0.0.1:8787"

# Start local embedded Redis server if REDIS_URL points to localhost/127.0.0.1 or is unconfigured
REDIS_TARGET="${REDIS_URL:-redis://127.0.0.1:6379}"
if [[ "$REDIS_TARGET" == *"127.0.0.1"* ]] || [[ "$REDIS_TARGET" == *"localhost"* ]]; then
  echo "[Redis] Starting embedded local Redis server on port 6379..."
  redis-server --daemonize yes --port 6379 || echo "Warning: local redis-server start skipped"
fi

# Run database migrations and seeding
echo "[1/4] Running Prisma database setup..."
npx prisma db push || echo "Warning: prisma db push failed or pending"
npx prisma db seed || echo "Warning: prisma db seed warning"

# Start Python Gmap Scraper background service
echo "[2/4] Starting Google Maps Python Lead Scraper background service on port $SCRAPER_PORT..."
if [ -d "Gmap-scrapper/.venv" ]; then
  echo "Using virtualenv python for scraper..."
  Gmap-scrapper/.venv/bin/python Gmap-scrapper/server.py &
else
  python3 Gmap-scrapper/server.py &
fi
SCRAPER_PID=$!
echo "Scraper running with PID $SCRAPER_PID on port $SCRAPER_PORT"

# Start WhatsApp Worker background service
echo "[3/4] Starting WhatsApp & Queue Worker background service..."
npx tsx scripts/worker.ts &
WORKER_PID=$!
echo "Worker running with PID $WORKER_PID"

# Signal handler for graceful shutdown
cleanup() {
  echo "Stopping services..."
  kill -TERM "$SCRAPER_PID" 2>/dev/null || true
  kill -TERM "$WORKER_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start Next.js web application server (Foreground)
echo "[4/4] Starting Next.js Web Server on port ${PORT:-3000}..."
exec npx next start -p "${PORT:-3000}"
