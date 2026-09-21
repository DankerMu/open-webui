# Makefile — single command surface for humans and agents (AGENTS.md § Development Workflow).
# Docker targets (install/start/startAndBuild/stop) are upstream Open WebUI; everything
# below "Engineering harness" was added by eng-init. Scripts hold the logic; targets stay thin.

ifneq ($(shell which docker-compose 2>/dev/null),)
    DOCKER_COMPOSE := docker-compose
else
    DOCKER_COMPOSE := docker compose
endif

.PHONY: install start startAndBuild stop \
	setup dev dev-bg dev-stop dev-status logs \
	check check-fast fmt fmt-check lint lint-scoped typecheck test test-unit test-backend test-frontend \
	coverage-gate anti-drift build clean \
	smoke smoke-stub e2e verify-ui db-reset seed db-verify test-guardrails doc-gate decisions-verify

default: check

# ── Upstream docker compose targets ───────────────────────────
install:
	$(DOCKER_COMPOSE) up -d

start:
	$(DOCKER_COMPOSE) start
startAndBuild:
	$(DOCKER_COMPOSE) up -d --build

stop:
	$(DOCKER_COMPOSE) stop

# ── Engineering harness ───────────────────────────────────────
# Toolchain: Node 22 (nvm use 22), Python 3.12 (uv). See .tool-versions.

setup:
	uv sync --frozen --group dev
	npm ci
	uv run pre-commit install --hook-type pre-commit --hook-type commit-msg
	@echo "setup complete — run 'make check'"

dev:
	npm run dev

dev-bg:
	bash scripts/dev-bg.sh start

dev-stop:
	bash scripts/dev-bg.sh stop

dev-status:
	bash scripts/dev-bg.sh status

logs:
	bash scripts/dev-bg.sh logs

# Full gate. Order: cheap static checks first, runtime verification excluded (see smoke/verify-ui).
check: fmt-check lint typecheck lint-scoped test coverage-gate anti-drift doc-gate decisions-verify
	@echo "All checks passed."

# Changed-since-HEAD only, for the iterate loop.
check-fast:
	bash scripts/check-fast.sh

fmt:
	uv run ruff format backend
	npx prettier --plugin-search-dir --write "**/*.{js,ts,svelte,css,md,html,json}"

fmt-check:
	uv run ruff format --check backend
	npx prettier --plugin-search-dir --check "**/*.{js,ts,svelte,css,md,html,json}"

# Repo-wide lint at upstream strength (what upstream CI runs). Repo-wide eslint is NOT here:
# upstream's tree crashes @typescript-eslint (upstream disabled lint-frontend); eslint runs
# per file on the change scope in lint-scoped instead.
lint:
	uv run ruff check --select=F --ignore=F401,F403,F405,F541,F811,F841 backend

# L3 lint/size/complexity on the fork's change scope with per-file ratchet vs baseline.rev.
lint-scoped:
	bash scripts/lint-scoped.sh

# svelte-check with a frozen error ceiling (upstream does not pass svelte-check). See scripts/typecheck-ratchet.sh.
typecheck:
	bash scripts/typecheck-ratchet.sh

test: test-backend test-frontend

test-unit: test

# pytest exit 5 = "no tests collected": upstream ships zero backend tests (baseline). Any other non-zero fails.
test-backend:
	cd backend && uv run pytest -q -p no:cacheprovider open_webui; rc=$$?; if [ $$rc -eq 5 ]; then echo "test-backend: no backend tests collected yet (baseline gap)"; elif [ $$rc -ne 0 ]; then exit $$rc; fi

test-frontend:
	npx vitest run --passWithNoTests

coverage-gate:
	bash scripts/coverage-gate.sh

anti-drift:
	bash scripts/anti-drift.sh

build:
	npm run build

clean:
	rm -rf .run build .svelte-kit backend/.pytest_cache backend/.coverage

# ── Runtime verification (AGENTS.md § Verification Matrix) ────
# Single source for the harness seed identity: scripts/seed.sh reads these from the environment.
export SEED_EMAIL ?= admin@harness.local
export SEED_PASSWORD ?= harness-admin-pw

smoke:
	bash scripts/dev-bg.sh status >/dev/null || bash scripts/dev-bg.sh start
	bash scripts/seed.sh
	hurl --test smoke/*.hurl --variable base_url=http://localhost:8080 \
		--variable seed_email=$(SEED_EMAIL) --variable seed_password=$(SEED_PASSWORD)

smoke-stub:
	bash scripts/smoke-stub.sh

e2e:
	bash scripts/seed.sh
	npx playwright test

# verify-ui ROUTE="/auth" runs one route's test; no ROUTE = all.
verify-ui:
	bash scripts/dev-bg.sh status >/dev/null || bash scripts/dev-bg.sh start
	bash scripts/seed.sh
	npx playwright test $(if $(ROUTE),--grep "route $(ROUTE) ",)

db-reset:
	bash scripts/db-reset.sh

seed:
	bash scripts/seed.sh

db-verify:
	bash scripts/db-verify.sh

test-guardrails:
	bash scripts/test-guardrails.sh

doc-gate:
	bash scripts/doc-gate.sh

decisions-verify:
	python3 scripts/decisions-verify.py
