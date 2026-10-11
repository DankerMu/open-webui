# Proposal

## Why

[Issue201](https://github.com/DankerMu/open-webui/issues/201) identifies a race between pathname validation and the later file-response open. A workspace writer can replace a validated ancestor and redirect server-readable bytes into either inline or forced-download responses.

## What Changes

- Pin single-file payload and metadata to one securely acquired regular-file descriptor through response completion or cancellation.
- Preserve ordinary and safely resolved in-root alias behavior, inline/download MIME and encoded disposition, isolation headers, no-store and metadata validators.
- Reuse the existing workspace descriptor traversal rather than create another containment implementation; retain current bytes-returning reader consumers.

## Capabilities

### Modified Capabilities

- `ocu-file-headers`: add descriptor-bound file bytes, metadata and ownership lifecycle.

## Impact

OCU single-file route, a narrow descriptor-backed response seam and existing workspace-reader support, with paired behavioral tests. No archive rewrite, upload publication, broker primitive consolidation, dependency upgrade or WebUI runtime change.

## Risk classification

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded for a public security-sensitive streamed filesystem reader.
Blast radius: cross-chat/server-readable disclosure, wrong metadata or leaked descriptors on incomplete responses.
Selected risk packs: public API; file IO/path safety; auth/secrets; concurrency; resource ownership; legacy compatibility; errors/partial outputs; documentation.
Evidence floor: benign deterministic public-route semantic RED before fix for both modes; unchanged header/consumer controls; descriptor cleanup fault cases; actual HTTP body/metadata and disconnect probe; three-seat review and approved local CI.
