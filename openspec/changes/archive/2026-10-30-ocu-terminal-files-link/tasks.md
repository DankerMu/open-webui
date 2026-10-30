## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review (revise twice, applied); `openspec validate ocu-terminal-files-link --strict --no-interactive`.

## 2. Risk packs

- **File IO / path safety / overwrite** — selected: one atomic `ln -sT`; never replaces an existing entry or writes inside one. Evidence b, c.
- **Legacy compatibility** — selected: same execs, order and answers; start directory unchanged; existing tests change only their expected command strings. Evidence a, d.
- **Error handling** — selected: a failing `ln` prints nothing and never changes a probe's output. Evidence c (read-only and absent home).
- **Concurrency, Public API / CLI, Config, Schema, Auth / secrets, Resource limits, Release packaging, Documentation** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [x] 3.1 The harness rewrite and stub `ln` in `design.md`; tests first for evidence a and b; record which fail on `origin/main`. Red on `89327b6`: 7 failed / 73 passed (the 3 evidence-a tests on the missing prefix; 4 expected-string updates of the gateway-off test); the 15 evidence-b cases pass on main by design (no-op and silence guard).
- [x] 3.2 `computer-use-server/app.py`. DankerMu/open-computer-use#194, reviewed head `94accb0`, merged as `b42edfc`; review round 1 clean on all three seats.
- [x] 3.3 Real-bash run (evidence c) in workspace image `efd2aee4…` (GNU coreutils 9.4) as `assistant`: absent → link owned by `assistant`; the five existing kinds and a previous link unchanged with nothing created inside; bare `ln -sT` fails with `File exists`; read-only and absent home → exactly `MATCH`/`OTHER`/`NONE` and `RUNNING`/`STOPPED`.
- [x] 3.4 Green (evidence d): `test_terminal_gateway.py` + `test_subagent_gateway.py` 103 passed (re-run by the orchestrator at `94accb0`); docs-lint workflow gates exit 0; `./tests/test-project-structure.sh` STRUCTURE OK.
