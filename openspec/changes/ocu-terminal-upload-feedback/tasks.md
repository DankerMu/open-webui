## 1. Contract and browser RED

- [x] 1.1 Independent expanded fixture review and strict validation pass; confirm both mount sites and preserve the existing shared upload/request/refresh boundaries.
- [x] 1.2 Extend the owning mounted-browser harness before production edits; parent captures semantic HTTP/network failure evidence against the current handler, with real DOM/input and request observations rather than source-text assertions.

## 2. Shared handler and runtime proof

- [x] 2.1 Check response success, catch upload request/body-read rejection, present localized text-only failure feedback and remove the selected temporary input in finally; verify both mounted surfaces without changing endpoint or wrapper policy.
- [x] 2.2 Preserve sequential processing and stop on first failure without retries/rollback; exercise a failed selection with preceding success and a later unattempted file. Keep all-success dashboard/standalone Files refresh and failure-to-success feedback clearing evidenced in the browser.
- [x] 2.3 Run the existing preview browser harness and owning preview Python regressions; capture standalone and embedded failure screenshots with zero unhandled page errors and only exactly correlated injected HTTP/network diagnostics. Run central `make verify-ui`, explicitly distinguishing its pinned baseline from changed-source browser evidence; stop owned services.

## 3. Documentation and delivery

- [x] 3.1 Update source changelog and owning runtime-embedding decision after UI proof; central docs/decision/strict-spec/changed-format gates pass.
- [ ] 3.2 Expanded correctness, test-evidence/spec-compliance and invariant-state reviews close at the exact source head; publish scoped local CI and complete reports.
- [ ] 3.3 Merge paired source/fixture, close the issue and archive the preview capability delta after every criterion is evidenced.

## Risk packs

Selected: public UI entrypoint — both mounts and visible accessible feedback (2.1,2.3); async ordering/resource lifetime — rejection containment, selected-input finally cleanup, existing mounted-state guard (1.2,2.1); legacy compatibility — encoded/prefixed request, sequential selection and success refresh, no upload-list/manifest (2.2–2.3); error handling/partial output —4xx/5xx/network, truthful partial selection and no rollback/retry (2.1–2.2); documentation — current handler contract and evidence (3.1).

Not selected: auth/secrets — no auth/provenance changes and no raw response/body disclosure; file IO/path safety — storage stays unchanged; schema/config/dependency/image/release — no such changes; resource limits/performance — no cap or performance claim. Picker cancellation, upload abort-on-unmount protocol, progress UI and batch redesign remain non-goals.
