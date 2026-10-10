## 1. Fixture and baseline

- [x] 1.1 Independent compact fixture review and strict OpenSpec validation pass before implementation.
- [x] 1.2 Record the measured counterexample:32 held descriptors with four low slots released; root11, broker-owned12/13/14, iterator43 outside the old exclusive bound16; the existing oracle fails at its discovery assertion.

## 2. Corrective test repair

- [x] 2.1 Enumerate actual open descriptors on supported Linux/macOS hosts instead of guessing a numeric prefix. Keep the helper local to the owning test and leave the separate RLIMIT64 subprocess probe unchanged.
- [x] 2.2 Parameterize ordinary and pressured layouts for both exception classes. Fragment the layout before root acquisition (32 owned descriptors, lowest four released); each pressured case must observe `iterator_fd >= max([root_fd, *acquired]) + 2`. Register cleanup for every pressure descriptor and retain native iterator references through assertions, with failure-path finalizers.
- [x] 2.3 Preserve every ownership assertion: iterator observed; all acquired/current/frontier/iterator descriptors closed; borrowed root still valid; subsequent scan succeeds.

## 3. Qualification and delivery

- [ ] 3.1 Parent runs the four cases and whole broker module; all pass. A temporary native-iterator nonclosure fault must fail the EBADF/closure oracle, then restoring the test returns GREEN. Do not commit the fault variant.
- [ ] 3.2 Proxy-clean complete `pytest tests/orchestrator/ -v` passes apart from unchanged pre-existing live-CLI skips; no exclusion of the failing cases or increased timeout.
- [ ] 3.3 Compact correctness/test-evidence review and exact-head local CI pass; merge source and central fixture, close the corrective issue, archive, and resume #186 on the integrated base.

## Risk packs

Selected: resource limits / large input — fragmented descriptor ownership must not hide the iterator (2.1–2.3,3.1); error handling / rollback — success, OSError, BaseException and failing-oracle cleanup preserve owned resources (2.2–2.3,3.1).

Not selected: public API, production config, file path safety, schema, auth, concurrency policy, legacy compatibility, release/dependencies — none changes. Descriptor pressure is isolated to the test and does not assert a production leak. Documentation/migration: no migration; this fixture records the corrected assurance boundary.
