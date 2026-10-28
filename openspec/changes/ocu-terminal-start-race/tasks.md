## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate ocu-terminal-start-race --strict --no-interactive`.

## 2. Risk packs

- **Public API / CLI / script entry** — selected: the `start-ttyd` response contract and the deployment smoke, including its HTTP timeout. Evidence b, c, d, f.
- **Concurrency / shared state / ordering** — selected: the stop/start race under the chat lock; the worst-case hold is about 11 s, only on a failing start. Evidence a, b, and the existing serialization test.
- **Error handling / rollback / partial outputs** — selected: 503 instead of `started: true`; a failed readiness check stops what it started. Evidence b, c, d.
- **Legacy compatibility** — selected: reuse, 422 refusals, gateway off, `stop-ttyd` answer, the smoke's ownership rule. Evidence e, f.
- **Documentation** — selected: `NETWORK-HARDENING.md:218` smoke coverage list gains the reuse check. Task 3.2.
- **Auth / secrets, Schema, File IO, Resource limits, Release packaging** — not selected: token handling unchanged; no schema or file change; bounded waits only; bash `/dev/tcp`, no new image tool.

## 3. Implement OCU

- [ ] 3.1 Tests first for design evidence a–d in `tests/orchestrator/test_terminal_gateway.py` and f in `tests/deploy/test_deployment_smoke.py`; record which fail on `main`.
- [ ] 3.2 `app.py`: bounded `TERMINAL_STOP_COMMAND`, readiness probe, cleanup stop, 503 answers in `_start_gateway_terminal`. `smoke_deployment.py`: 20 s start timeout and the second-start reuse check. `NETWORK-HARDENING.md:218`: reuse check listed.
- [ ] 3.3 Renames (evidence g).
- [ ] 3.4 Green: OCU unit command for the three test modules. `test_deployment_smoke.py` binds `127.0.0.1:8082`, so it runs in a Linux container when a local tunnel holds the port. Also the full unit command where the environment allows, with environment-only failures shown identical to `main`, and `./tests/test-project-structure.sh`.
