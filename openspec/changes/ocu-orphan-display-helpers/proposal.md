## Why

[#195](https://github.com/DankerMu/open-webui/issues/195) identifies two display definitions without repository consumers: `app.format_size` and `_FILE_ICONS`. Their removal is separate from the completed upload-route cleanup; OCU PR34 is merged.

## What Changes

Delete only those definitions and adjacent excess whitespace. Preserve `classify_file`, its `_listing_files` caller, all imports, route registrations and response behavior. No replacement helper, compatibility alias or new test of source text.

## Capabilities

None. `skip_specs: true`: dead-code removal changes no supported runtime behavior or canonical production requirement. No design document is needed for the named two-definition deletion.

## Impact

OCU `computer-use-server/app.py` only. Existing output-endpoint tests cover the retained classifier/listing consumer. This fixture records the maintenance boundary; no endpoint contract or source dependency changes.

## Risk triage

Issue type: refactor. Fixture level: compact; upstream suggested level absent. Although the definitions share the app module, neither is an entrypoint or referenced consumer; all live code must remain AST-identical. Selected packs: canonicality/dead-code ownership and legacy compatibility. Evidence floor: reference inventory, exact two-node AST removal, before/after owning tests and native HTTP listing/download smoke. No failing production behavior or invented RED is claimed.
