## Why

(#657.) `deploy/release.py build` names each built image `ocu-build-{role}-{pid}` (`release.py:2309`) and the digest-upstream export alias the same way (`:2334`). After a successful build `export_built_image` tags the content reference (`:2375`) but never removes the scratch tag; a failed build leaves it too. Only the digest-upstream export alias is retired (`:2347-2361`).

A later build in a fresh `docker:…-cli` container often gets the same small pid, so `reject_occupied_reference(temp_tag)` (`:2323` → `:1123-1125`) aborts with `release: existing image ocu-build-workspace-20 conflicts with the release`. Observed 2026-10-27 while building the WebUI 47c2ae7 / OCU 5fbb2dd release; every successful build leaves six `ocu-build-*` tags.

## What Changes

In `open-computer-use`, `deploy/release.py` only:

- One module-level helper names build scratch references `ocu-build-{role}-{pid}-{random}`, where `{random}` is a fresh 12-hex-character token per call (`secrets.token_hex(6)`). Both call sites (`:2309`, `:2334`) look it up by name, so tests can patch it. The pre-build `reject_occupied_reference` stays, so a genuinely occupied name still aborts before building.
- For built roles (`image_kind != "pull"`), `export_built_image` retires its scratch tag once `reject_occupied_reference(temp_tag)` has passed. Cleanup never starts before that check, so an occupied name that aborted the build is never touched.
  - The cleanup is a `finally` that catches `BaseException` and runs inside `_blocked_signals()`, the same structure as the export-alias cleanup at `:2347-2361`. SIGTERM reaches the build as `SystemExit` (`release.py:3021-3024`), and that exit must still clean up.
  - It decides by name: if `existing_reference(temp_tag)` is not `None`, it runs `docker image rm --no-prune temp_tag`. Name-only is safe because the name is unique to this call and was checked unoccupied before the build. Identity cannot be checked the way the alias cleanup does, because a failed build or inspect leaves no `image_id`.
  - On success it runs after the final archive is verified. The content reference keeps the image, so the rm only untags. On failure, the untag leaves layers to ordinary engine pruning.
- Pulled roles never remove their `temp_tag`, which is the upstream reference. The digest-upstream export-alias retirement changes only the name it uses.
- If the cleanup fails on the success path, the build fails with a message naming the scratch reference. On a failure path it is best effort: a "may remain" warning goes to stderr and the original error propagates, the same as the alias cleanup.
- Non-goal: a SIGTERM during `docker build` may not reach the docker CLI child, which could still tag after cleanup has checked. The unique name means such a leftover can never collide with a later build.

## Capabilities

### Modified Capabilities

- `ocu-offline-image-delivery`: adds the requirement that build scratch references are unique per build and retired.

## Impact

- `deploy/release.py` (`export_built_image`, the build plan, one helper); `tests/deploy/test_offline_release.py`.
- Existing tests that seed `ocu-build-postgres-{pid}` to simulate an occupied export alias (`test_offline_release.py:683`) must get the name from the helper (for example by patching it), not by recomputing the format.
- No change to release.json, the inventory, verify, import or deploy.

## Fixture

```text
Issue type: bugfix
Fixture level: compact (override)
Upstream suggested level: absent
Override reason: the only delete is `docker image rm --no-prune` of a name this process generated, checked unoccupied before building, and owns; it mirrors the existing export-alias cleanup (`release.py:2347-2361`). No shared state other than this process's own scratch tag is changed.
design.md: omitted; the mechanics fit in this proposal and touch one function.
Blast radius: release builds on the operator workstation; a wrong cleanup could untag an unrelated image or the content reference
Must preserve: pulled upstream references are never removed; the content reference and archives are unchanged; a genuinely occupied scratch name still aborts before building and is left untouched; the digest-upstream export alias tests keep passing
Evidence floor: tests in test_offline_release.py for evidence a–e; the OCU unit command for tests/deploy/test_offline_release.py; one real build on the workstation leaves no ocu-build-* tag
```
