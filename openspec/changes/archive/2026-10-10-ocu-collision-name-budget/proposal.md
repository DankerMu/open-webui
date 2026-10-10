## Why

A repeated upload at the target directory's name capacity produces an oversized numbered name and HTTP500. The native HTTP boundary reproduces this after a successful first upload. Office save-as also assembles numbered names before calling the shared no-replace claim.

## What Changes

Apply the [approved byte-budget policy](https://github.com/DankerMu/open-webui/issues/187#issuecomment-6094900445) in the existing uploads owner. Upload retries and Office candidate selection use one formatter; complete bytes still publish only through the existing no-replace hard link. Map definite filename-capacity refusal to upload HTTP400 while preserving Office failure responsibility.

## Capabilities

- New `ocu-collision-names`: shared byte-budget and refusal rules for numbered workspace names.

The existing upload and Office-copy contracts remain in the active `ocu-office-editing` change. This independent delta adds their shared naming boundary without rewriting that change or archived history.

## Impact

Issue: https://github.com/DankerMu/open-webui/issues/187

Issue type: bugfix. Fixture level: expanded. Upstream suggested level: absent.
Blast radius: `uploads.py`, upload HTTP mapping in `app.py`, and Office `save_as.py` candidate selection.
Selected risk packs: public API; file IO/no-overwrite; resource/name capacity; concurrency; legacy naming compatibility; error cleanup and persisted Office responsibility.
Evidence floor: actual-filesystem upload RED/GREEN, byte boundaries and refusal controls, atomic collision races, Office copy/recovery consumers, owning tests and real HTTP smoke.

No file-size policy, dependency change, new storage format, separate Office naming algorithm, or changes to publish fences/receipts/recovery semantics. Extend the owning workspace-files decision after behavior is verified; no new architectural subsystem.
