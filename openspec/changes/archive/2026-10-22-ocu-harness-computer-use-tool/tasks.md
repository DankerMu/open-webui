## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-harness-computer-use-tool --strict --no-interactive`.

## 2. OCU PR

- [x] 2.1 Tests first: evidence (a) and (b). Record red on `origin/main`.
- [x] 2.2 D1: the filter inlet with the saved-chat predicate, shared with the system-prompt branch.
- [x] 2.3 D2: init.sh and run-init.sh, with the `PRIMARY_CHAT_MODEL` validation spliced through the surviving `marker_section` anchor. D3: the compose env line with its inline comment naming the failure mode.
- [x] 2.4 D4: the removal script and evidence (b2); the upgrade procedure in the deploy docs; the release manifest entry if `deploy/release.py:87` requires one.
- [x] 2.5 Docs per the proposal; evidence (e).
- [x] 2.6 Green in the CI-shaped container: `pytest tests/test_filter.py tests/deploy -q`, plus the suite once.

## 3. Fork

- [x] 3.1 Decision record `docs/decisions/implemented/architecture/<date>-ocu-harness-computer-use-tool.md`. It covers D1 and D3 with the alternatives, the blast radius of `BYPASS_MODEL_ACCESS_CONTROL`, and D4. `make decisions-verify` and `make doc-gate` must pass. The fork code is unchanged.

## 4. Host

- [x] 4.1 Evidence (d) on the current VPS state (the upgrade procedure), then a fresh production-like bootstrap of the merged OCU SHA and evidence (c). Record image digests, SHAs and the regenerated release manifest.

## Risk packs

Selected:

- **Auth / permissions:** the visibility flag and its blast radius (D3, evidence (c), decision record).
- **Public API / contract:** the inlet mutates `tool_ids` (D1, evidence (a), (c)).
- **Config / project setup:** init.sh, run-init.sh and the compose env (D2, D3, evidence (b), (c)).
- **Data migration:** the one-off wrapper removal (D4, evidence (d)).
- **Compatibility:** existing wrapper chats (D4, evidence (d)).
- **Documentation:** the docs and the decision record (2.5, 3.1).

Not selected:

- **Schema:** no schema change.
- **Performance:** one extra tool per request, accepted by owner decision 1.
- **Concurrency:** none.
