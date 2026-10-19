# Tasks

## 1. Bookmark correction

- [x] 1.1 Extend the existing real-DOCX browser fixture with one already-prefixed bookmark click; freeze the regression and capture semantic RED before source edits.
- [x] 1.2 Apply only idempotent decoded-fragment namespacing in the Office helper; prove the unchanged regression GREEN and retain fragment-local membership and malformed-encoding rejection.
- [x] 1.3 Exercise ordinary/prefixed real DOCX navigation in embedded and standalone previews, including before/after viewport evidence and screenshots; add encoded and invalid/missing/external-target boundary controls without changing existing assertions.

## 2. Compatibility and delivery

- [x] 2.1 Execute the complete browser harness with pinned Playwright/Chromium and canonical preview-prefix pytest selection; retain all results, zero unexpected browser errors and owned-resource cleanup evidence.
- [x] 2.2 After runtime proof update the existing restricted-Office-embedding decision and OCU changelog; pass doc/decision/strict fixture/format and real commit gates.
- [x] 2.3 Complete expanded three-seat review and exact-head authorized local scoped CI, paired merges, archive and manual issue closure with empty automatic closing sets.

## Risk-pack mapping

- Public input / compatibility: real DOCX conversion, both preview modes and shared XLSX consumer; tasks 1.1–1.3/2.1.
- Security: namespaced IDs, local membership, malformed/missing/global-only targets and unchanged external-link/image/style-map protections; tasks 1.2–1.3/2.1.
- Error handling: invalid fragments lose href without unsafe fallback; tasks 1.2–1.3.
- Documentation: existing owner and gates; task 2.2.
- Configuration, persistence, schema, concurrency, resource limits, dependencies and deployment: no behavior change or new guarantee. No LAN operations.
