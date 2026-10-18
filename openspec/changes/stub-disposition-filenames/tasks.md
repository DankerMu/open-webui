# Tasks

## 1. Qualified serializer correction

- [x] 1.1 Qualify the independent standards-aware parser with valid escaped and invalid raw quote/backslash headers; add one real upload-to-GET regression and capture semantic RED before source changes.
- [x] 1.2 Correct the existing shared header builder once for both modes; prove the frozen quote regression GREEN and exact raw/parsed filename behavior for backslash, combined, nested and ordinary controls without changing upload/storage policy.
- [x] 1.3 Execute the actual stub over HTTP and record uploaded name, exact bytes, raw single-field framing, parser defects and recovered leaf in both modes; retire child/private roots and preserve original error/rejection behavior.

## 2. Compatibility and delivery

- [x] 2.1 Run actual `make smoke-stub` and focused public-stub regressions, preserving issue209's 33 controls, traversal, ordinary disposition, pagination and Office outcomes; run scoped lint and changed-file format checks.
- [ ] 2.2 After runtime proof update the existing stub decision, then pass doc/decision/strict fixture/Markdown gates and actual commit hooks on the final bytes.
- [ ] 2.3 Complete expanded three-seat review and exact-head authorized local scoped CI; merge, archive and manually close358 with empty automatic closing sets.

## Risk-pack mapping

- Public API / serialization: real upload-to-GET both modes, tasks1.1-1.3.
- Input safety: raw framing and unchanged control/traversal rejection, tasks1.3/2.1.
- Compatibility/downstream consumers: exact standards-parser leaf, ordinary quoted representation and original smoke assertions, tasks1.1-1.3/2.1.
- Error handling: existing rejected inputs/storage outcomes retained, tasks1.3/2.1; no new fallback or suppression.
- Documentation: existing decision and gates, task2.2.
- File persistence/concurrency/auth/config/dependencies/performance/deployment: not selected; no redesign or new guarantee, production untouched.
