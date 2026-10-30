## Why

(#683.) The Office editor (ONLYOFFICE DocumentServer 9.4) opens in English. OCU's `_signed_editor_config` (`computer-use-server/office/sessions.py:658-680` at `origin/main` `b42edfc`) sets no `editorConfig.lang`, so DocumentServer falls back to English. The image ships a Simplified Chinese locale (`web-apps/apps/*/main/locale/zh.json`). The owner chose one fixed language for every user: Simplified Chinese.

## What Changes

- **OCU.** `_signed_editor_config` adds `"lang": "zh"` and `"region": "zh-CN"` to `editorConfig` before signing, so the signed token and the returned configuration agree. Create and join both build their configuration with this function (`sessions.py:241, 270`).
  - `lang` is `zh`, the exact locale file name, so nothing depends on DocumentServer mapping `zh-CN` to `zh`.
  - `region` sets the default date, number and currency formats.
  - `CHANGELOG.md` gets an Unreleased entry.
- **WebUI.**
  - `scripts/verify-office-browser.mjs` drops its two English DocumentServer labels:
    - `dismissSynchronizationTip` (`:216-218`) matches the button text "Got it", which becomes 「知道了」. It clicks the tip's button by structure instead: `.synch-tip-root:visible .btn-div`, from DocumentServer's `SynchronizeTip.js` template.
    - The PPTX check (`:246-247`) compares `#status-label-pages` with `'Slide 1 of 3'`, which becomes 「幻灯片第1张，共3张」. It compares the numbers in the label instead: exactly `1` and `3`, in that order.
  - `docs/office-editing.md:3` separates the two interfaces: the editor's own interface is Simplified Chinese, while the bold English names in the guide are WebUI buttons and status labels that are not yet translated.

Why not the alternatives: following each user's language, or a deployment setting, were both offered; the owner chose the fixed language (#683).

## Capabilities

### Modified Capabilities

- `ocu-office-workspace-ui`: the editor opens in Simplified Chinese.

## Impact

- OCU: `computer-use-server/office/sessions.py`, `tests/orchestrator/test_office_sessions.py`, `tests/orchestrator/test_office_session_lifecycle.py`, `CHANGELOG.md`.
- WebUI: `scripts/verify-office-browser.mjs`, `docs/office-editing.md`.
- Non-goals:
  - per-user language;
  - the WebUI Office stub (`scripts/ocu_stub_office.py:376-390`), which serves no real editor;
  - bumping the OCU pin in `constraints.yaml`.

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent; expanded: the signed editor configuration is a contract with DocumentServer (public API), and the real-editor harness depends on today's English labels (legacy compatibility)
Blast radius: the editor fails to load or rejects the token; the editor opens in English; once the OCU pin passes this change, make verify-office stops dismissing the tip and fails every PPTX run on the slide label
Selected risk packs: Public API (signed editorConfig); Legacy compatibility (verify-office label); Documentation (user guide)
Not selected: Auth / secrets (same signing, new fields only); Config (no setting); Schema, File IO, Concurrency, Resource limits, Error handling, Release packaging (no change)
Evidence floor: OCU Office session tests with the new assertions red on origin/main; deployed check on the acceptance VPS (Chinese UI screenshot, editor loads and saves); docs-lint and doc-gate
design.md: present
```
