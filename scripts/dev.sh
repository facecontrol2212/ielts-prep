#!/usr/bin/env bash
# Start the whole stack for local development. Ctrl-C stops everything.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> infrastructure"
docker compose -f infra/docker-compose.yml up -d
until docker compose -f infra/docker-compose.yml exec -T postgres pg_isready -U ielts >/dev/null 2>&1; do
  echo "    waiting for postgres..."
  sleep 1
done

echo "==> migrations"
(cd api && uv run alembic upgrade head)

echo "==> api on :8000, web on :3000"
trap 'kill 0' EXIT
(cd api && uv run uvicorn app.main:app --reload --port 8000) &
(cd web && npm run dev) &
wait
