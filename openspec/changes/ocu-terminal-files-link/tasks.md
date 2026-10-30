## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review (revise twice, applied); `openspec validate ocu-terminal-files-link --strict --no-interactive`.

## 2. Risk packs

- **File IO / path safety / overwrite** — selected: one atomic `ln -sT`; never replaces an existing entry or writes inside one. Evidence b, c.
- **Legacy compatibility** — selected: same execs, order and answers; start directory unchanged; existing tests change only their expected command strings. Evidence a, d.
- **Error handling** — selected: a failing `ln` prints nothing and never changes a probe's output. Evidence c (read-only and absent home).
- **Concurrency, Public API / CLI, Config, Schema, Auth / secrets, Resource limits, Release packaging, Documentation** — not selected; reasons are in the proposal Fixture block.

## 3. Implement OCU

- [ ] 3.1 The harness rewrite and stub `ln` in `design.md`; tests first for evidence a and b; record which fail on `origin/main`.
- [ ] 3.2 `computer-use-server/app.py`.
- [ ] 3.3 Real-bash run (evidence c).
- [ ] 3.4 Green (evidence d).
