---
id: 2026-11-07-ci-critical-path
title: CI runs its layers in parallel and splits browser verification into shards
kind: process
status: implemented
date: 2026-11-07
supersedes: none
references: 2026-10-17-coverage-gate-test-status, 2026-10-22-browser-failure-evidence-redaction
---

# CI runs its layers in parallel and splits browser verification into shards

## Problem

The 35 successful CI runs before this change took 24.9 min (median) and 26.9 min (p90) wall time. Queueing was negligible. The time went to three places:

- **Serial chain.** `layer2` (unit tests, 16 min) waited on `layer1` (fast checks, 7.5 min) through a `needs` that passed no data.
- **Duplicated test runs.** `layer2` ran the backend pytest suite twice, about 245 s each: once in `make test` and again in `make coverage-gate`.
- **Serial browser run.** `layer3` ran 44 baseline and 51 OCU Playwright cases one after another (11 min).

On top of that, every job spent 2–2.7 min on setup. Of that, `npm ci` took about 55 s, and restoring the 3 GB uv cache took about 44 s, including in jobs that run only ruff. Scoped lint added 242 s by starting eslint once per file, one file at a time.

## Decision

Every check that ran before still runs, on every push to `main` and on every pull request that changes code.

**Job graph.** The jobs that run code fan out from a small `changes` job: `layer2-backend-tests`, `layer2-frontend-tests`, `layer3-runtime-smoke` and three `layer3-browser` shards.

**Unit tests.**

- The backend job's only test run is `make coverage-gate PART=backend`. `scripts/coverage-gate.sh --only backend|frontend` selects one half.
- When a test fails, the gate prints the whole pytest log, so nothing is lost by dropping `make test-backend` from CI.
- The frontend job keeps `make test-frontend`. The frontend coverage run excludes the `e2e/` Vitest files, so this is the only CI run of those files.

**Browser verification.**

- `make verify-ui SHARD=i/n` passes Playwright `--shard` to the baseline run and, through a validated `OCU_UI_SHARD`, to the OCU run.
- OCU test discovery still requires every spec in every shard.
- Playwright splits each run into contiguous groups of test files, so the shards together are exactly `make verify-ui`.
- Three shards balance best on the measured per-file times. On PR #758 their browser steps took 301 s, 354 s and 387 s, including the dev server and OCU stack start. A simulation on those times puts the longest of four combined shards higher than the longest of three, because whole files cannot be split.
- The failure-evidence artifact is uploaded once per shard.

**Setup.**

- `.github/actions/setup-toolchain` restores `node_modules` from a cache keyed on the OS, Node version and `package-lock.json`; `npm ci` runs only on a cache miss.
- The full backend environment keeps setup-uv's default cache key, which the liveness workflow also reads.
- Jobs that need only ruff and vulture install just the `dev` group, from their own small cache.
- Jobs that do not lint baseline blobs check out with `filter: blob:none`.

**Scoped lint.** `scripts/lint-scoped.sh` checks files in parallel, one worker per CPU. Each worker writes only under its own index, and the verdicts are printed in scope order. A worker that dies counts as a failed file, never as a pass.

**Docs-only pull requests.**

- A PR whose every path, including the old path of a rename, is under `docs/` or `openspec/`, or is top-level Markdown other than `CHANGELOG.md`, skips the four layer2/layer3 code jobs. `CHANGELOG.md` is excluded because `backend/open_webui/env.py` reads it at runtime.
- `make fmt-check` (prettier covers Markdown), `make doc-gate`, `make decisions-verify`, the secret scan and the PR guards still run.
- `scripts/ci-gate.py` owns two decisions: the classification, and the `All checks passed` verdict.
- A skip passes the verdict only in two cases: a PR-only job on a push, and a code job on a docs-only PR. Every other skip fails, as does any failure, cancellation, unknown job or missing classification.
- `backend/open_webui/test/test_ci_gate.py` pins the job sets to `ci.yml`.

## Alternatives considered

- **Workflow-level `paths-ignore` for docs.** Rejected. The required `All checks passed` check would never report on a docs-only PR, and that PR could not merge.
- **Hand-picked spec lists per shard.** Rejected. These lists would repeat `REQUIRED_SPECS` in `ci.yml`, and a new spec could silently join no shard. Playwright's `--shard` partitions whatever the configuration collects.
- **Shard backend pytest across runners.** Deferred. It would need coverage files combined in an extra job. The backend job (358 s on PR #758, 289 s of it pytest) already finishes before the slowest browser shard (8.0 min), so splitting it would not shorten the critical path.
- **Cache `.venv` instead of the uv cache.** Rejected. The CUDA `torch` wheels in `uv.lock` make the environment about 3 GB either way, and `uv sync` from a warm cache takes about 3 s.
- **Fold anti-drift into the fast-checks job.** Rejected. The Enforcement Index names CI layers by number, and that job is not on the critical path.

## Consequences

- The critical path is now the slowest browser shard plus its setup. On PR #758, with warm caches, a run took 8.5 min of wall time. Before the change, the median over 35 successful runs was 24.9 min.
- Each browser shard spends about 3.5 min before its first test: setup, the dev server, the warm-up and the OCU stack. That fixed cost, not test time, now limits further sharding. Separate baseline and OCU jobs (four OCU shards) are the next lever, and the ~100 s `open_webui.main` import is the floor for any backend shard.
- Runner minutes rise: setup now repeats on seven parallel jobs instead of four. That is free on this public repository.
- Each browser shard starts its own dev and OCU stacks.
- Lint jobs with a warm cache read only a small dev-only uv cache.
- A docs-only classification depends on the pull-request files API. A list that is incomplete or does not match `changed_files` runs every job.
- `backend.yaml` (upstream "Python CI") still runs a duplicate `ruff format --check` on backend changes. This record leaves it as upstream ships it.
