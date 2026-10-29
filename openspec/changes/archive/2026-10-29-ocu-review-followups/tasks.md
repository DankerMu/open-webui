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

- [x] 3.1 The FakeSandbox changes named in design.md; tests first for evidence a–d, f and h; record which fail on `origin/main`. Red on `origin/main`: a `already_running: true`; b the second start reused; c exit 1 with no `-KILL`; d `-ge 3` and smoke 3 failed (`20.0`); f 4 failed; h 38 failed / 401 passed (DankerMu/open-computer-use#193 Test plan).
- [x] 3.2 `app.py`, `smoke_deployment.py`, `recovery_resources.py`, `NETWORK-HARDENING.md`, the two Office test call sites. OCU PR #193, reviewed head `1e54d04`, merged as `89327b6`; review round 1 clean on both seats.
- [x] 3.3 Real-bash run (evidence e): sandbox image entrypoint, no `--init`; a SIGTERM-ignoring ttyd was killed and the stop exited 0 after 3.3 s with no ttyd or zombie left; probe answered NONE / MATCH / OTHER / OTHER; a non-reaped zombie made the stop exit 1 after 5.7 s; on `origin/main` the ttyd survived.
- [x] 3.4 Green (gateway + overlay + recovery 161 passed / 2 skipped; smoke 55 passed in a python:3.12 container; Office 439 passed with and without proxies, re-run by the orchestrator at `1e54d04` under `ALL_PROXY`; docs-lint exit 0; STRUCTURE OK):
  - OCU unit command for `test_terminal_gateway.py`, `test_overlay_structure.py`, `test_recovery.py`, and `test_office_save_as.py` + `test_office_resolution.py` both with and without `ALL_PROXY=socks5://127.0.0.1:9`;
  - `test_deployment_smoke.py` in a Linux container (port 8082 is held locally);
  - docs-lint gates;
  - `./tests/test-project-structure.sh`.
