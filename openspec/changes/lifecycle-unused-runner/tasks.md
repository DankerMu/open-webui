# Tasks

## 1. Behavior-preserving cleanup

- [x] 1.1 Freeze the original test module; confirm declarations have no consumers, capture a real child-process reference GREEN and qualify the equivalence check against an altered subprocess argument.
- [x] 1.2 Remove only the two unused assignments; verify byte-for-byte equality with the reference minus those declarations, unchanged subprocess ASTs, and no developer-home uv path.
- [x] 1.3 Run the unchanged lifecycle module and the same real child-process smoke; record exact results and clean owned temporary resources.

## 2. Delivery

- [x] 2.1 Update the existing changelog after proof; pass strict fixture, documentation gates and commit hooks with source-bound evidence.
- [ ] 2.2 Complete compact correctness/test-evidence review and authorized exact-head local scoped CI; merge paired PRs, archive and manually close #304.

## Risk packs

- Compatibility: preserve all tests and subprocess callsites; tasks 1.1–1.3.
- Documentation: changelog and fixture gates; task 2.1.
- API/CLI, configuration, file safety, schema, authorization, concurrency, resource limits, error handling and dependencies: no behavior change. Existing process/filesystem behavior is exercised, not redesigned.

Equivalence / Light: protected reference plus exact deletion check and existing executable scenarios. No permanent source-text test or artificial bug RED; the original runtime is expected to pass. Parent evidence custody is not OS-enforced isolation.
