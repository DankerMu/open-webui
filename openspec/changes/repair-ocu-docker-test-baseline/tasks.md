# Tasks

## 1. Restore faithful test dependencies

- [ ] 1.1 Update the existing Docker fixtures in both environment-injection test modules to model start/reload state and consistent DNS attributes; preserve all original environment assertions. Verify both modules with `OCU_SANDBOX_DNS` absent and with the valid value `8.8.8.8`.
- [ ] 1.2 Record the narrow test-fixture correction in the existing OCU changelog. Verify no production files or guard expectations change.

## 2. Verification and review

- [ ] 2.1 Run `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration` in OCU; require exit 0 with no added skips. Existing failing-before evidence: 8 failed and 5 passed in the two isolated modules on both the working branch and pristine origin/main.
- [ ] 2.2 Review the compact fixture and changed test dependencies against the lifecycle specification; require existing negative DNS/startup tests and credential assertions remain intact. No runtime smoke is required for a test-only change; the executed test modules are the changed surface.

## Risk packs

- Public API / CLI / script entry: not selected; production entrypoints unchanged.
- Config / project setup: selected; run the two modules with DNS unset and set to a valid value, without consuming host-dependent inputs.
- File IO / path safety / overwrite: not selected; production filesystem behavior unchanged.
- Schema / columns / units / field names: not selected; production schemas unchanged.
- Auth / permissions / secrets: selected; preserve and execute all environment-injection and CLI-isolation assertions; never bypass production validation.
- Concurrency / shared state / ordering: not selected; no runtime synchronization changes; fixtures must restore their environment after use.
- Resource limits / large input / discovery: not selected; no resource policy change.
- Legacy compatibility / examples: not selected; no consumer API change.
- Error handling / rollback / partial outputs: selected; full suite retains negative startup and DNS cases without new skips.
- Release / packaging / dependency compatibility: not selected; no dependency or image changes.
- Documentation / migration notes: selected; narrow existing changelog entry, no migration.
