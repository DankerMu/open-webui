## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec deltas; fixture review; `openspec validate ocu-review-followups --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: start-ttyd answers, stop-ttyd, smoke timeout. Evidence a, b, d.
- **Concurrency / shared state / ordering** — selected: stop and reuse under the chat lock; bounds vs exec timeouts. Evidence b, d, e.
- **Error handling** — selected: escalation and cleanup. Evidence b, c.
- **Legacy compatibility** — selected: healthy reuse stays one probe exec; restore refuses the same states; the smoke's first-start and reuse rules. Must-preserve tests, evidence f.
- **Test hygiene** — two loopback httpx calls ignore environment proxies (#676 item 4). Evidence h.
- **Documentation** — selected: NETWORK-HARDENING.md. Evidence g.
- **Auth / secrets, Config, Schema, File IO, Resource limits, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [ ] 3.1 The FakeSandbox changes named in design.md; tests first for evidence a–d, f and h; record which fail on `origin/main`.
- [ ] 3.2 `app.py`, `smoke_deployment.py`, `recovery_resources.py`, `NETWORK-HARDENING.md`, the two Office test call sites.
- [ ] 3.3 Real-bash run (evidence e).
- [ ] 3.4 Green:
  - OCU unit command for `test_terminal_gateway.py`, `test_overlay_structure.py`, `test_recovery.py`, and `test_office_save_as.py` + `test_office_resolution.py` both with and without `ALL_PROXY=socks5://127.0.0.1:9`;
  - `test_deployment_smoke.py` in a Linux container (port 8082 is held locally);
  - docs-lint gates;
  - `./tests/test-project-structure.sh`.
