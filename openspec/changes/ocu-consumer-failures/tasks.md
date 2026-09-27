# Tasks

## 1. Failure contract

- [ ] 1.1 Add typed status-aware upstream failure and exact never_created classification; client tests cover JSON/plain/empty failures, unrelated409, preserved success/transport and no raw marker leakage.
- [ ] 1.2 Map describe/launch/refresh failures to the documented rows; real-route tests prove non-success status, unchanged cursor/prefs, retained unreachable describe and unchanged401/403/404/409 precedence.
- [ ] 1.3 Replace frontend nullable failure handling with the stable Error shape; Vitest covers reason-only409, non-JSON/empty failure, exact0/request_failed fetch rejection and200/invalid_response malformed success, with status-based401/403/404 precedence and no raw console/body leakage; remove incidental forwarding-only tests instead of repinning them.

## 2. Evidence and delivery

- [ ] 2.1 Parent qualifies regressions red/green and runs make test-backend, make test-frontend, make typecheck, make lint-scoped, make coverage-gate and make smoke; no Docker commands.
- [ ] 2.2 Update CONTEXT public interface and decision rationale, validate OpenSpec/doc-gate/decisions-verify, cross-review, exact-head CI, merge and archive before issue29 consumes the contract.

## Risk mapping

Status/compatibility:1.1–1.3; authorization precedence:1.2; sensitive detail containment:1.1–1.3; persistence:1.2; runtime:2.1; docs:2.2. Implementation leaves skip execution; parent owns all validation.
