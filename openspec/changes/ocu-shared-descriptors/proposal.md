# Proposal

## Why

[Issue202](https://github.com/DankerMu/open-webui/issues/202) identifies duplicated security-sensitive read/directory flags, errno classifiers and verified-descriptor acquisition in uploads and the outputs broker. The implementations are correct today; consolidation prevents future divergence without changing caller policy.

## What Changes

- Extract one small low-level read/directory acquisition implementation and use it from both existing owners.
- Keep HTTP/missing-file versus broker unsafe/unstable/resource-limit translation at each caller, including distinctions between open and subsequent type/stat failures.
- Remove superseded duplicate definitions atomically; keep staging/write behavior local.

## Capabilities

### Modified Capabilities

- `ocu-outputs-broker`: make boundary-specific failure and descriptor-ownership preservation explicit alongside existing confinement guarantees; no new runtime behavior.

## Impact

OCU uploads/broker read seams, one small shared module with paired behavioral tests, explicit server COPY packaging and any affected test-module lifetime lists. File/archive routes remain existing consumers through the uploads owner, not route implementation scope. The issue's historical future-consumer wording predates their completed fixes.

## Risk classification

Issue type: refactor
Fixture level: expanded
Upstream suggested level: absent; expanded for shared filesystem security primitives.
Blast radius: weakened confinement, changed HTTP/broker failures, leaked/closed borrowed descriptors or changed discovery policy.
Selected risk packs: public API; file IO/path safety; auth/secrets; concurrency; resource bounds; legacy compatibility; error handling; packaging; documentation.
Evidence floor: Equivalence mode — accepted baseline GREEN plus discriminating unsafe mutation rejection, identical consumer outcomes after extraction, actual filesystem/HTTP smoke and three-seat review. Do not invent a bugfix RED for a behavior-preserving change.
