# IELTS Prep Platform

Free IELTS preparation platform for Uzbek learners. Full timed mock tests in the browser,
instant band scores, progress tracking.

See [`plan.md`](./plan.md) for scope, decisions and milestones.

## Stack
- **web/** — Next.js 15 (App Router, TypeScript, Tailwind)
- **api/** — FastAPI + SQLAlchemy 2 + Postgres
- **infra/** — docker-compose (postgres, redis, minio)

## Local development

```bash
# 1. Infrastructure
docker compose -f infra/docker-compose.yml up -d

# 2. API
cd api && uv sync && uv run alembic upgrade head && uv run uvicorn app.main:app --reload

# 3. Web
cd web && npm install && npm run dev
```

API docs: http://localhost:8000/docs · Web: http://localhost:3000

## Tests

```bash
cd api && uv run pytest          # backend
cd web && npm test               # frontend
```
