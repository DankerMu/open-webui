# Tasks

## 1. Contract and tracer

- [x] 1.1 Complete read-only fixture review and `openspec validate ocu-markdown-sanitization --strict --no-interactive` before production edits.
- [x] 1.2 Extend the existing browser harness with one hostile Markdown insertion/event canary; parent records semantic RED against unchanged source, not an environment failure.

## 2. Renderer and behavioral proof

- [x] 2.1 Implement pre-insertion sanitization and URL policy in the existing renderer; browser GREEN proves prohibited tags/attributes/schemes never reach the trusted stage and harmless neighboring content survives.
- [x] 2.2 Exercise formatting, headings/fragments, lists/tables/details, relative file selection/images, HTTP/HTTPS/mailto, PNG/JPEG/GIF/WebP data images, highlight, Mermaid and KaTeX with actual rendered output and screenshots across supported prefixes.
- [x] 2.3 Exercise missing and unusable sanitizer, superseded loading, Markdown/Office/Drawio ordering and embedded Markdown refusal; assert no raw fallback, policy leakage, stale overwrite or unexpected browser errors.

## 3. Acceptance

- [x] 3.1 Parent runs `node tests/orchestrator/preview_embedding_browser.cjs` with `OCU_PREVIEW_PYTHON` inside the Python 3.12 requirements environment and installed Playwright/Chromium; retain exact versions, screenshots, red/green logs and all existing controls.
- [x] 3.2 Parent runs `uv run --offline --python 3.12 --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/orchestrator/test_preview_prefix.py tests/security/test_xss_preview.py -q --import-mode=importlib`; commit hooks and scoped secret scan pass.
- [x] 3.3 Update the existing preview architecture decision; central `make doc-gate decisions-verify`, changed-doc formatting and strict validation pass. WebUI baseline UI smoke is separate from source-preview proof; do not claim its pinned OCU assets exercise this source change.
- [x] 3.4 Complete correctness, test-evidence/spec and security cross-review; publish exact-head local CI evidence and satisfy normal merge protection before paired merge and fixture archive.

## Risk packs

| Pack                                           | Selection and evidence                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected: production preview/browser harness, 2.1–3.1. No public API shape change.                              |
| Config / project setup                         | Not selected: no configuration or setup contract change.                                                        |
| File IO / path safety / overwrite              | Selected: relative resource resolution and unsafe URL refusal, 2.2; no server file writes.                      |
| Schema / columns / units / field names         | Not selected: no persisted schema or protocol change.                                                           |
| Auth / permissions / secrets                   | Selected: trusted-DOM canaries, forbidden markup, embedding refusal, 2.1–2.3.                                   |
| Concurrency / shared state / ordering          | Selected: per-call sanitizer isolation and retired stage, 2.3.                                                  |
| Resource limits / large input / discovery      | Not selected: existing Markdown size limit and listing bounds unchanged.                                        |
| Legacy compatibility / examples                | Selected: safe Markdown and Office/Drawio controls, 2.2–3.2.                                                    |
| Error handling / rollback / partial outputs    | Selected: missing/unusable sanitizer fails closed, 2.3.                                                         |
| Release / packaging / dependency compatibility | Selected: existing pinned sanitizer and prefix-safe local assets, 2.2–3.1; image/deploy certification excluded. |
| Documentation / migration notes                | Selected: owning decision and central gates, 3.3.                                                               |
