# Tasks

## 1. Behavioral correction

- [x] 1.1 Add the focused backend-discovered environment regression and `make test-harness-env`; parent records RED for unset/false harness imports and GREEN for the non-harness in-memory positive control before the policy edit.
- [x] 1.2 Enforce the unconditional shared export and remove the redundant UI-backend mapping entry; parent verifies GREEN, explicit-value preservation and unchanged ordinary dotenv behavior without any dotenv file access.

## 2. Integration and delivery

- [x] 2.1 Exercise both real backend launcher paths with parent false/unset cases, using the existing dev/health/smoke/UI targets and owned cleanup; record actual startup evidence and no orphan processes, then run scoped lint and doc gates.
- [ ] 2.2 Complete expanded correctness/evidence review, exact-head scoped CI, merge and archive this fixture; retain evidence and leave unrelated acceptance issues unchanged.

## Risk coverage

- Script entry and config/setup — selected: shell policy regression, both launcher runtimes and unconditional parent override.
- File IO and secrets — selected: in-memory discovery/stream substitution and parser instrumentation; never inspect/create dotenv files or expose credentials.
- Compatibility — selected: explicit-value preservation, normal non-harness positive control, real backend health/smoke/UI behavior.
- Documentation — selected: this contract and motivating inline comment; no claim that path discovery is disabled, no AGENTS change.
- Concurrency/resource limits, schema, release/dependencies — no new behavior; retain existing process ownership and dependency versions.
- Error handling — preserve launcher failures and cleanup; no retry/suppression behavior added.

[Source-bound verification](https://github.com/DankerMu/open-webui/blob/main/docs/evidence/issue-419/verification.json.gz) retains actual harness-import REDs, the normal-start positive control, permanent regression GREEN, launcher observations and cleanup. A separate initial control setup failure lacked the required application secret and is not semantic evidence. All dotenv inputs are synthetic in-memory strings; no dotenv file is created or opened. Runtime cases are development with parent false and isolated UI with parent unset, including restart; the shared-policy regression covers both parent values.
