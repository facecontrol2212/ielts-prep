.PHONY: help up down api web install migrate seed test test-api test-web lint fmt check

help:
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up:        ## start postgres, redis and minio
	docker compose -f infra/docker-compose.yml up -d

down:      ## stop the infrastructure
	docker compose -f infra/docker-compose.yml down

install:   ## install all dependencies
	cd api && uv sync
	cd web && npm install

migrate:   ## apply database migrations
	cd api && uv run alembic upgrade head

seed:      ## load band tables and the content in content/
	cd api && uv run python -m app.cli seed-bands
	cd api && uv run python -m app.cli import-dir ../content

api:       ## run the API with reload
	cd api && uv run uvicorn app.main:app --reload --port 8000

web:       ## run the web app
	cd web && npm run dev

test: test-api test-web  ## run every test

test-api:  ## backend tests with coverage
	cd api && uv run pytest --cov=app --cov-report=term-missing

test-web:  ## frontend tests
	cd web && npx vitest run

lint:      ## lint both sides
	cd api && uv run ruff check app tests
	cd web && npx tsc --noEmit

fmt:       ## format both sides
	cd api && uv run ruff format app tests
	cd api && uv run ruff check --fix app tests

check: lint test  ## what CI runs
