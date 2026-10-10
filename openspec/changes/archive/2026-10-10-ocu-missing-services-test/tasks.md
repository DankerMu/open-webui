## 1. Fixture

- [x] 1.1 Independent fixture review and strict OpenSpec validation pass before editing the test.

## 2. Cleanup and evidence

- [x] 2.1 Remove only the earlier duplicate; compare the retained method with the original and confirm exactly one definition remains.
- [x] 2.2 Run `tests/deploy/test_check_ports.py` before and after: retain 31 passing tests and 21 passing subtests, including the missing-services rejection case.
- [x] 2.3 Run `uv run ruff check --select F tests/deploy/test_check_ports.py`: no F811; report unrelated F541 without editing or suppressing it.
- [x] 2.4 Exercise the actual checker: valid documents exit zero; a networks-only core document exits nonzero.

## 3. Delivery

- [x] 3.1 Complete compact correctness/test-evidence review at the frozen source head and publish local CI evidence.
- [x] 3.2 Merge source and central fixture PRs, close the issue, and archive the fixture.

## Risk packs

Selected: error handling / rollback / partial outputs — preserve the existing rejection assertion and exercise the checker with missing services (2.2, 2.4).

Not selected: public API / CLI, config / setup, file IO / path safety, schema, auth / secrets, concurrency, resource limits, legacy compatibility, release / dependencies — none of these production surfaces changes. The smoke uses temporary input files only. Documentation / migration notes: no migration or product contract change; this fixture records the test-only scope.

Must preserve: every other test, the original missing-services method body, valid-input success, missing-services rejection, and all production bytes. No new permanent source-text test or assertion-free coverage test.
