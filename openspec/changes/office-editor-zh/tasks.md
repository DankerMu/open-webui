## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review (revise once, then pass); `openspec validate office-editor-zh --strict --no-interactive`.

## 2. Risk packs

- **Public API (signed editorConfig)** — selected: the two new fields are signed and returned on create and join; no other field changes. Evidence a, c.
- **Legacy compatibility** — selected: verify-office dismisses the tip by structure and checks the PPTX slide label by its numbers, not by English text. Evidence d (static), e.
- **Documentation** — selected: the user guide separates the Chinese editor interface from the untranslated WebUI labels; OCU CHANGELOG entry. Evidence b, e.
- **Auth / secrets, Config, Schema, File IO, Concurrency, Resource limits, Error handling, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Implement

- [ ] 3.1 OCU tests first (evidence a); record red on `origin/main`.
- [ ] 3.2 OCU `sessions.py` and `CHANGELOG.md`; evidence b.
- [ ] 3.3 WebUI `verify-office-browser.mjs` (tip locator, PPTX slide-label check) and `docs/office-editing.md:3`; evidence e.
- [ ] 3.4 Deployed check on the acceptance VPS (evidence c), after the upgrade.
