## Why

The shared terminal dashboard ignores upload HTTP status and lets network rejection escape its async event listener. Users see no failure feedback, and rejection bypasses temporary input cleanup. [#192](https://github.com/DankerMu/open-webui/issues/192) requires the same repair in standalone preview and terminal embedding.

## What Changes

Check upload responses, show a localized dashboard error for HTTP/network failure, and release the selected temporary input in guaranteed cleanup. Retain successful dashboard refresh and standalone Files refresh through the existing shared handler.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: add terminal upload failure/cleanup and successful retry behavior without changing selected runtime embedding.

### New Capabilities

None.

## Impact

OCU `static/preview.js`, existing locale/style modules as needed, and the existing mounted-browser recording harness. Source changelog and owning runtime-embedding decision update after runtime proof. No endpoint/storage, request-wrapper policy, dependency, image or source-pin change.

## Risk triage

Issue type: bugfix. Fixture level: expanded; upstream suggested level absent. Trigger: shared async UI entrypoint and two consumers. Blast radius: terminal upload feedback/cleanup and refresh. Selected packs: public entrypoint, async ordering/resource lifetime, legacy compatibility, error handling, documentation. Evidence floor: browser semantic RED, both mounted surfaces with4xx/5xx/network controls, success and retry, screenshot/zero unexpected errors, owning preview regressions and central UI baseline.
