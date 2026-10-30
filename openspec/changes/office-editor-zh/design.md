## Governing invariant

The configuration returned to the browser equals the signed token's payload, as today (`test_editor_config_and_ticket_verify_independently`). Only two new fields are added, `editorConfig.lang = "zh"` and `editorConfig.region = "zh-CN"`, on create and on join. Every other field is unchanged.

## Sibling surfaces

- **Create and join** both call `_signed_editor_config` (`sessions.py:241` join, `:270` create). Tests cover both.
- **The SPA** (`static/office-editor.js:514`) passes `editor_config` through to `new DocEditor` unchanged. The README says so (`computer-use-server/README.md:384-385`). No SPA change.
- **The WebUI stub** (`scripts/ocu_stub_office.py:376-390`) builds its own configuration for fixture tests and loads no real editor. It is left alone.
- **`make verify-office`** loads the real editor through the production broker, taken from the OCU commit pinned in `constraints.yaml` `ocu_checkout.sha`. Today that is `32b96c0` (2026-10-16), which predates this change, so verify-office keeps running the English UI for now. Only that old pin keeps the merge order harmless. The first pin bump past the OCU merge switches verify-office to Chinese, so its two English-label checks must change in this same change:
  - The structural locator works in both languages: `SynchronizeTip.js` renders `<div class="btn-div"><%= scope.textButton %></div>` inside `.synch-tip-root`, and binds the click on `.btn-div` to `buttonclick`.
  - The locale key `Common.UI.SynchronizeTip.textGotIt` is "Got it" in `en.json` and 「知道了」 in `zh.json`.
  - Clicking `.btn-div` only closes the tip. In `TooltipManager._showTip`, `buttonclick` calls `props.tip.close()` for every tip with a button, including the `licenseError` tip whose button reads `textContinue` (`spreadsheeteditor/main/app/controller/Main.js:1285-1286`). Tips created directly default to `showButton: false`. The locator therefore cannot trigger a save, a reload or a disconnect. If two tips with buttons are visible at once, it fails on multiple matches, as `getByText('Got it')` did.
  - The PPTX slide label comes from `PE.Views.Statusbar.pageIndexText`: "Slide {0} of {1}" in `presentationeditor/main/locale/en.json`, 「幻灯片第{0}张，共{1}张」 in `zh.json`. The check takes the label's digit runs and requires exactly `["1", "3"]`, which holds in both languages.
  - The other verify-office checks are language-independent: the search counter (`0/0`, then `1/1`) is numeric. `verify-office-diagnostics.mjs`, the WebUI e2e tests and the stub carry no DocumentServer labels.

## Evidence

- **a. Unit (OCU)**, red on `origin/main`:
  - create: `editor_config["editorConfig"]` and the decoded token both have `lang == "zh"` and `region == "zh-CN"`;
  - join: the same, through `_verify_config` in `test_office_session_lifecycle.py`.
- **b. Green (OCU):** the Office session test modules; docs-lint gates; `./tests/test-project-structure.sh`.
- **c. Deployed (acceptance VPS, after the owner finishes testing and the upgrade).** Open an XLSX in the editor through the tunnel:
  - the editor loads and its menus are Chinese (screenshot);
  - typing `2026-10-30` into an empty cell displays it in the `zh-CN` short date format, `2026/10/30` (under `en-US` it would be `10/30/2026`); the displayed value is recorded;
  - a status-bar save completes.
    If the date does not display as `2026/10/30`, the spec's region claim is narrowed to what was observed before archiving.
- **d. Not run:** `make verify-office`. LibreOffice is not installed on this machine, and the pinned OCU predates the change. Both harness changes are checked statically against the DocumentServer 9.4 sources above: the `SynchronizeTip.js` template and `buttonclick` handler, the `textGotIt` key, and the `pageIndexText` key in both locales.
- **e. WebUI:** `make doc-gate`; `npx prettier --check` on the changed files.
