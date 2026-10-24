## Why

#634. In `open-computer-use` (`main` `1aef272`), `tests/orchestrator/test_outputs_broker.py::test_unstable_hash_read_rejects_successor_without_partial_index` (`:2113-2141`) writes `b"abcdefgh"`, then, after the broker's first `os.read` chunk, rewrites the file in place with `b"ABCDEFGH"`: same length, same inode (`write_bytes` truncates). The broker detects an unstable read by `bytes_read != size` or a changed `_signature` `(dev, ino, mode, size, mtime_ns, ctime_ns)` (`computer-use-server/outputs_broker.py:243-250`, `:689-694`). After this rewrite only the timestamps can differ, and on Linux they are likely taken from the coarse kernel clock (inferred, not probed), so a rewrite within the same tick leaves the signature identical and the broker correctly hashes what it read. Measured in the CI-shaped `python:3.13` container: 14/30 and 16/30 isolated failures (`DID NOT RAISE UnstableReadError`), and one failure in a full `tests/orchestrator` run, where it stops the `bash -e` CI step before later selectors.

The broker is not at fault: it compares every field `stat` offers plus the bytes read, and production writers are excluded by the broker lock, which the test bypasses.

## What Changes

In `open-computer-use`, tests only: the mid-read rewrite writes content of a different length (`b"ABCDEFGHI"`), so two independent post-read checks reject the read on every filesystem regardless of timestamp granularity: `bytes_read` (9) differs from the scanned size (8), and the size field of the `after` signature differs. The assertions (`UnstableReadError`, the mutation happened, index bytes unchanged) stay.

Must preserve: the test still proves a successor read during hashing is rejected without a partial index; no production change; other tests unchanged.

Non-goals: changing broker unstable-read detection; other timestamp-sensitive tests (none measured as flaky).

## Capabilities

### Modified Capabilities

- `ocu-outputs-test-isolation`: ADDED requirement "Unstable-read regression is deterministic".

## Impact

The test passes on every run on Linux and macOS, so the `pytest-orchestrator` step no longer goes red at random.

## Triage

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one test's mutation, no production change
Blast radius: one test's reliability
Selected risk packs: none (test-only; the assertion strength is reviewed)
Evidence floor: 30 isolated runs of the test in the CI-shaped python:3.13 container as uid 1001: failures > 0 on 1aef272 (record the count), 0/30 after; mutation in a scratch copy removing both post-read conditions (`bytes_read != observation.size` and `_signature(after) != observation.signature`, keeping the `before` check) gives 30/30 `DID NOT RAISE`; a full `python -m pytest tests/orchestrator/ -v` in that container passes; macOS run of test_outputs_broker.py green; ./tests/test-project-structure.sh
design.md: omitted at compact level
```
