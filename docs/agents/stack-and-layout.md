# Stack and repository layout

Reference detail moved out of the root `AGENTS.md` hot path.
The binding rules stay there: [AGENTS.md § Stack & Versions](../../AGENTS.md#stack--versions) (versions agents must use, Dependency policy) and [§ Directory Map](../../AGENTS.md#directory-map) (Module Boundaries).

## Stack & Versions

| Layer                        | Choice                                                                                                      | Version                                                                                  | Why                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Language                     | Python / TypeScript                                                                                         | 3.12 (`.python-version`; pyproject `>=3.11,<3.13`) / TS 5.5                              | upstream pins; local default Python 3.13 is out of range |
| Runtime                      | Node                                                                                                        | 22 (`.nvmrc` / `.tool-versions`; engines `<=22`, `engine-strict`; lockfile needs ≥22.12) | local default Node 24 is rejected — `nvm use`            |
| Framework                    | FastAPI + SvelteKit 2 / Svelte 5                                                                            | upstream v0.11.3                                                                         |                                                          |
| Persistence                  | SQLite (dev/harness) or PostgreSQL (deploy overlay)                                                         | SQLAlchemy + Alembic (58 migrations)                                                     |                                                          |
| Build / test / lint / format | Vite 5 · pytest+pytest-cov, Vitest 1.6, Playwright · ruff, ESLint 8, svelte-check · ruff format, Prettier 3 |                                                                                          |                                                          |

## Directory Map

```
backend/open_webui/     FastAPI app — routers/ models/ utils/ socket/ retrieval/ migrations/
src/routes/             SvelteKit pages ((app)/, auth/, s/)
src/lib/                components/ apis/ stores/ utils/ i18n/ (generated) pyodide/ (vendored)
docs/plans/             Plan 1 (implemented, epic #2) / Plan 2 (implemented; acceptance follow-ups open on epic #107)
docs/decisions/         decision records — proposed/ implemented/ rejected/ archived/
docs/postmortem/        postmortem contract (write one when an incident meets the criteria)
smoke/ e2e/             hurl API smoke, Playwright UI baseline
scripts/ .git-hooks/    harness scripts and hooks (logic lives here; Makefile stays thin)
.omp/skills/            repo-local skills (gitignored — see AGENTS.md § Skill / Memory boundaries)
```
