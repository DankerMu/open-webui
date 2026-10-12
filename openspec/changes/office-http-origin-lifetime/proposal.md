# Proposal

## Why

Office test origins join their accept-loop thread but not active daemon request handlers. A real HTTP counterexample at OCU `43fccbd9552933193721a4c8c30f857aec119046` observes `stop()` return while the held handler remains alive; a failed responder can escape its owning test.

## What Changes

- Give the four Office origin families one test-local owner for accepted sockets, request workers, release signals and handler errors.
- Complete bounded teardown on success, client timeout/cancellation and exceptional test-body exit; surface unexpected handler failures in that test.
- Migrate held-response callers and remove redundant early error collectors without weakening outcome, secrecy or concurrency assertions.

## Capabilities

### New Capabilities

- `ocu-http-test-origins`: bounded Office fake-origin handler and socket ownership with test-local failure attribution.

### Modified Capabilities

None. Application isolation and callback DNS evidence remain governed by their existing capabilities.

## Impact

Source repository: `DankerMu/open-computer-use`; implementation and test changes stay under `tests/orchestrator/`. `_CommandOrigin`, `_RecordingOrigin`, `_ContentOrigin` (including `EncodingOrigin`) and `_DownloadOrigin` retain their response/recording contracts. Held command wrappers and callers are migrated where release or error ownership requires it. No production command behavior, dependency, global warning filter or deployed service changes.

Tracking issue: `DankerMu/open-webui#235`. The historical trailing exception banner remains unattributed; this change does not claim to explain it.

## Fixture level and risk packs

Expanded: thread/socket lifetime, cancellation, failure attribution and multiple test consumers. Selected: script/test entry, file/resource IO, concurrency/ordering, bounded resources, compatibility, error cleanup, documentation. Not selected: config/setup, schema, auth policy, release/packaging; none changes. Secret assertions remain compatibility constraints, not a new authentication design.
