# Proposal

## Why

Issue89 is the user-approved OCU prerequisite for issue30. Existing Browser/Terminal clients are reusable, but the preview shell accepts only Files embedding, so WebUI cannot select an isolated runtime view without duplicating clients or displaying competing nested navigation.

## What Changes

- Add framed `embed=browser` and `embed=terminal` modes to the existing preview page; preserve standalone and Files-only contracts.
- Mount only the selected runtime client, with owned status polling/heartbeat and deterministic teardown.
- Deliver a dedicated same-origin CSP on runtime embed documents and bind the shell configuration script to a nonce.
- Verify actual browser lifecycle with recording protocol fixtures, not mock DOM clients; deployment interaction remains issue36.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-preview-spa`: selected runtime embedding, runtime shell policy and explicit Files-only lifecycle wording.

## Impact

OCU `computer-use-server/static/preview.js`, existing browser/terminal lifecycle seams if evidence requires fixes, `computer-use-server/app.py` preview response, and paired tests/browser harness. No proxy route additions, dependencies, WebUI production changes or Docker operations. WebUI carries this fixture and decision record; issue30 later consumes the reviewed OCU pin.

## Fixture and Evidence

Expanded fixture. Risk packs: lifecycle/order (late status/connect completion and owned timers), trust (CSP and fixed sandbox), compatibility (standalone and Files embedding), integration (real browser/protocol fixtures). Construction evidence is parent-run regression RED before implementation, GREEN afterward, semantic mutation rejection and restored GREEN, browser screenshots/connection accounting and source/control exact-head CI. Candidate agents cannot run acceptance commands.
