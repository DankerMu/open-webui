## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-oversized-output-entry --strict --no-interactive`.

## 2. OCU PR (`DankerMu/open-computer-use`)

- [x] 2.1 Tests first, in `tests/orchestrator/test_outputs_broker.py`, `test_outputs_endpoint.py`, one Office session test, and the static JS tests, for design.md evidence (a)–(h2). Record red on `origin/main` for (a), (b) grow, (c), (f), (g) and (h2).
- [x] 2.2 Implement D2–D6 in `outputs_broker.py` and `app.py`, and D8 in `static/ocu-request.js` and `static/preview.js`. Keep the size-limit half of `test_outputs_broker.py:431-447` as a register/other-limit assertion, or replace it with (a) if it only covered the scan path. State which in the PR.
- [x] 2.3 Update the `computer-use-server/README.md` broker section: oversized entries, `hash: null`, `too_large`, the one-way rollback, and the null-hash check command `grep -l '"hash":null' <chat_dir>/*/.ocu/index.json` (design.md § Rollback).
- [x] 2.4 Green in the CI-shaped container (`python:3.13`, uid 1001): `pytest tests/orchestrator -q`, plus the repo's lint command for the touched files.

## 3. WebUI fork PR (after the OCU PR merges)

- [x] 3.1 Tests first: evidence (i) in `src/lib/apis/ocu/index.test.ts`, and (j) in the sidebar component tests.
- [x] 3.2 Implement D7: `index.ts`, `WorkspaceArtifact.svelte`, `WorkspaceSelectedFile.svelte`, `workspace-file-rows.ts`, and i18n through `npm run i18n:parse`.
- [x] 3.3 Stub: `_fixture_file` emits `too_large: False`, and a new `oversized` scenario adds `big.html` and `big.docx` (D7). Add a Playwright case for evidence (k) on that scenario. Existing scenarios and their row-count assertions stay unchanged. Fix any listing validator in `scripts/ocu_stub_*.py`, `smoke-stub.sh` or `backend/open_webui/test/test_ocu_stub_public.py` that the new field breaks.
- [x] 3.4 Decision record in `docs/decisions/implemented/architecture/`. It records that oversized files become entries without a hash and why the alternative was rejected. It covers the one-way rollback, including previous-release activation, the order of rollback, and the rehash needed if the limit is ever raised. `make decisions-verify` must pass.
- [x] 3.5 Green:
  - `make test-frontend`;
  - `make typecheck`;
  - `make lint-scoped`;
  - `make coverage-gate`;
  - `make smoke-stub`;
  - `make verify-ui-ocu-repeat SPEC=<spec> REPEAT=3`;
  - `make verify-ui-ocu`;
  - `make doc-gate`.

## 4. Host

- [x] 4.1 Rebuild the OCU image from the merged SHA and record its digest. Redeploy OCU and the fork on the acceptance VPS, then run evidence (l).

## Risk packs

Selected:

- **Schema / persistence.** The validator is widened additively and `SCHEMA_VERSION` is unchanged (D2, evidence (d)).
- **Data integrity / identity.** Crossing the limit keeps the `file_id`, and oversized entries are never paired as renames (D3, D4, evidence (b), (c)).
- **Public API / contract.** `too_large` and a nullable `hash` (D6, evidence (f), (i)); spec deltas.
- **Error handling.** The other limits and publish still fail (D5, evidence (e), (h)).
- **UI state.** Selection gating in the sidebar and the preview SPA, with no iframe and no fetch (D7, D8, evidence (h2), (j), (k)).
- **Compatibility / rollback.** The index change is one-way, and an older image rejects it. The fork tolerates a missing field (Rollback, D7, evidence (i), 3.4).
- **Documentation.** The README, the decision record and the spec deltas (2.3, 3.4).

Not selected:

- **Performance.** Oversized files are never read, so reconciliation does strictly less work.
- **Auth / secrets.** Authorization and download routes are unchanged.
- **Concurrency.** Locking and atomic writes are unchanged. The grow-during-read race keeps today's 413 (D4).
