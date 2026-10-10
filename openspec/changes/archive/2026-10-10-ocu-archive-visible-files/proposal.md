## Why

The output ZIP reader includes dot-prefixed files and files beneath hidden directories. Current uploads stage privately under `.ocu`, but historical `.upload-*` residue and other hidden output entries remain visible through this separate reader. Issue [#188](https://github.com/DankerMu/open-webui/issues/188) selects the archive-only fix.

## What Changes

Omit any output-relative path containing a dot-prefixed component from ZIP membership; retain complete visible files and existing archive response/error behavior. Upload publication remains untouched.

## Capabilities

### New Capabilities

- `ocu-output-archives`: visible output ZIP membership and completed-upload compatibility. Existing file-header and link-decoration specs do not own archive membership.

### Modified Capabilities

None.

## Impact

OCU `computer-use-server/app.py` archive enumeration, existing archive/upload tests, source changelog and central workspace-files decision. No dependency, writer, index, schema, image or deployment change.

## Risk triage

Issue type: bugfix. Fixture level: expanded; upstream suggested level absent. Trigger: public file reader. Blast radius: archive membership only. Selected packs: public API, file IO, legacy compatibility, error handling, documentation. Evidence floor: semantic ZIP-membership RED/GREEN, owning archive/upload/auth regressions and native HTTP upload/archive smoke. Existing resource/concurrency semantics are non-goals.
