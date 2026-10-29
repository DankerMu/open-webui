## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec deltas; fixture review; `openspec validate ocu-review-followups --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: start-ttyd answers, stop-ttyd, smoke timeout. Evidence a, b, d.
- **Concurrency / shared state / ordering** — selected: stop and reuse under the chat lock; bounds vs exec timeouts. Evidence b, d, e.
- **Error handling** — selected: escalation and cleanup. Evidence b, c.
- **Legacy compatibility** — selected: healthy reuse stays one probe exec; restore refuses the same states. Must-preserve tests, evidence f.
- **Documentation** — selected: NETWORK-HARDENING.md. Evidence g.
- **Auth / secrets, Schema, File IO, Resource limits, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [ ] 3.1 Tests first for evidence a–d and f; record which fail on `origin/main`.
- [ ] 3.2 `app.py`, `smoke_deployment.py`, `recovery_resources.py`, `NETWORK-HARDENING.md`.
- [ ] 3.3 Real-bash run (evidence e).
- [ ] 3.4 Green:
  - OCU unit command for `test_terminal_gateway.py`, `test_overlay_structure.py` and `test_recovery.py`;
  - `test_deployment_smoke.py` in a Linux container (port 8082 is held locally);
  - docs-lint gates;
  - `./tests/test-project-structure.sh`.
