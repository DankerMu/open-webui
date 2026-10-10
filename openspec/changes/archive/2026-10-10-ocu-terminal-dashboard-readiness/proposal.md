## Why

The embedded post-upload browser test observes the server's status GET before asserting dashboard controls, but request arrival does not prove the response/body/render settled. [#193](https://github.com/DankerMu/open-webui/issues/193) identifies a static false-failure window; no reproduced production defect or observed flake is claimed.

## What Changes

Add the existing standalone pattern's `.dash-btn-secondary` readiness wait after the recorded status GET and before both exact post-upload button/card assertions. Keep the assertions, timeout, request checks and production source unchanged. No sleeps, retry loops or extra absence tests.

## Capabilities

None. `skip_specs: true` because only test synchronization changes; production behavior and existing preview requirements remain unchanged. No design document is needed for this one-line correction.

## Impact

Only OCU `tests/orchestrator/preview_embedding_browser.cjs` changes. This central fixture documents the test boundary; production documentation and changelog stay intentionally unchanged.

## Risk triage

Issue type: test. Fixture level: compact; upstream suggested level absent. Blast radius: embedded post-upload test observation only. Selected packs: test async ordering and legacy assertion compatibility. Evidence floor: exact one-line diff, preserved assertions/production identity, real Chromium harness success. Current-session source baseline passed during #192; no fabricated flaky RED is required to claim this static ordering repair.
