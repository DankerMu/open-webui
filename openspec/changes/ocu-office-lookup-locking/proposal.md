# Proposal

## Why

A DocumentServer `info` request can wait for an authenticated callback that needs the same chat lock held by its caller. Real close evidence in [issue #425](https://github.com/DankerMu/open-webui/issues/425) shows a ten-second lock cycle followed by an earlier-arriving status 1 voiding the newly reserved close sequence; this blocks the real-editor verifier in #172.

## What Changes

- Replace lock-across-lookup with locked preparation, unlocked remote I/O and locked authoritative revalidation for join/reopen, close, session sweep and history restore.
- Preserve each caller's known/unknown/unreachable outcomes, legitimate remaining-participant handling, sequence allocation and publication/recovery obligations.
- Keep callback-bearing transaction waits independent of callback admission and DNS workers, reusing the existing lifespan-owned transaction execution mechanism.
- Explicitly supersede the incompatible lock clause in `ocu-command-deadline` and the command ownership decision; retain the ten-second command budget and existing cancellation/shutdown guarantees.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-command-deadline`: callback progress during key lookup, identity-bound revalidation, caller-specific outcomes and transaction execution ownership.

## Impact

OCU production changes belong in a separate PR on `DankerMu/open-computer-use`: `office/sessions.py`, `sweep.py`, `restore.py`, the existing transaction owner and its lifecycle/callers if needed, paired tests and the changelog. The fixture, shared specification and decision correction belong in the WebUI control-plane repository. #172 consumes the merged OCU SHA and reruns its real target plus shared proxy/UI evidence; its current scripts are not part of this corrective PR.

No dependency, schema, callback authentication, editor UI, gateway, LAN deployment or #197 acceptance change is authorized. The standalone XLSX terminal hang remains a required actual-runtime check, not a cause already proven by the minimized DOCX trace.

## Fixture and risk triage

Issue type: bugfix.
Fixture level: **expanded**.
Upstream suggested level: absent; expanded is required by shared state, callback ordering and publication responsibility.
Blast radius: session admission, close/save sequence ownership, restore authority and lifecycle cleanup across four lookup callers.
Selected risk packs: Public API; Config; File IO; Auth; Concurrency; Resource limits; Legacy compatibility; Error handling; Release/packaging; Documentation. No persisted schema or dependency change.
Evidence floor: callback-progress RED/GREEN, controlled concurrent-authority cases, owning/lifecycle/package regressions, actual B1 DOCX and fresh-XLSX close, independent cleanup and high-risk cross-review.
