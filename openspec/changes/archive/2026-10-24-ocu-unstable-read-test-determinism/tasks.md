## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-unstable-read-test-determinism --strict --no-interactive`.

## 2. Implement (in open-computer-use, from `main` `1aef272`)

- [x] 2.1 Red: 30 isolated runs of the test in `python:3.13` as uid 1001 on `1aef272`; record the failure count.
- [x] 2.2 The mid-read rewrite writes `b"ABCDEFGHI"` (a different length); assertions unchanged.
- [x] 2.3 Green: 30/30 passes in the same container. Mutation in a scratch copy: remove both post-read conditions at `outputs_broker.py:689-693` (`bytes_read != observation.size` and `self._signature(after) != observation.signature`), keep the `before` comparison: 30/30 runs fail with `DID NOT RAISE UnstableReadError`. Removing only one of the two leaves the test green by design (they are independent checks) and is not evidence; optionally record both single removals as passing. A full `python -m pytest tests/orchestrator/ -v` in the container passes. `pytest tests/orchestrator/test_outputs_broker.py` on macOS; `./tests/test-project-structure.sh`.

## Risk packs

Not selected:

- **Concurrency / shared state:** the test simulates a concurrent writer; the broker's lock and detection are unchanged.
- **File IO:** test-only write in the test's temporary tree.
- **Public API, Config, Documentation:** no production or operator-visible change.
