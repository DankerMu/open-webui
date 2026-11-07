# Debugging CI failures (protocol)

Procedure behind [AGENTS.md § Agent Operating Rules](../../AGENTS.md#agent-operating-rules) → Debugging CI failures.

CI (`.github/workflows/ci.yml`) runs on the fork (`origin` = `DankerMu/open-webui`; `upstream` = `open-webui/open-webui`) and its `All checks passed` job is the required check on `main`. Classify the layer (`layer1-fast-checks`, `layer2-backend-tests`, `layer2-frontend-tests`, `layer3-runtime-smoke`, `layer3-browser` shard `n`, `layer4-anti-drift`, `layer5-secret-scan`); a browser shard reproduces with `make verify-ui SHARD=n/3`, and on a docs-only pull request the `changes` job skips the layer2 and layer3 jobs by design (`scripts/ci-gate.py`), read the first actionable error, reproduce locally with the same `make` target, fix the root cause, re-run that target, then `make check` before pushing. Environment-parity mismatches become a dated entry in `## Important Development Notes`.
