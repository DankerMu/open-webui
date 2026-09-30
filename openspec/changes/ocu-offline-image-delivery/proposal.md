# Proposal

## Why

Deployment startup rebuilds images and has no verified offline release inventory. Issues96/97 supply local Pyodide and Draw.io materials; issue33 must deliver those materials inside identified images without relying on build tools or WAN access at runtime.

## What Changes

- Build five source images and capture PostgreSQL into a six-role, linux/amd64 release from committed OCU/WebUI sources.
- Export named images and tracked OCU deployment sources; record configuration digests, archive checksums, both source SHAs, build arguments and material input versions/hashes.
- **BREAKING:** import and every deployment start require the release inventory. Missing/mismatched images fail before deployment mutation; startup forbids builds and pulls.
- Extend the existing protected bootstrap and deployment-version record rather than adopting user-owned untracked scripts.
- Enable existing offline/update/download policy switches without replacing LAN model/RAG endpoints or disabling supported local previews.

## Capabilities

### New Capabilities

- `ocu-offline-image-delivery`: content-verified offline releases and fail-closed startup.

### Modified Capabilities

None. Existing bootstrap privacy, proxy topology, sandbox lifecycle and egress invariants remain mandatory.

## Impact

OCU `deploy/`, its bootstrap/version scripts and `tests/deploy/`; WebUI owns this fixture and the decision record. No application API, dependency upgrade, registry service or upstream renderer change. User-owned untracked deployment files remain untouched.

Expanded fixture; selected packs: script entry/config, file IO/path safety, error handling/concurrency, release/dependency compatibility, auth/trust, legacy/order compatibility and documentation. Image/source identity is a critical trust boundary. Schema/columns/units packs are not selected: no application database/API migration.

## Acceptance boundary

User approved local named references plus mandatory image-config digest and archive SHA-256 verification, not registry manifest digest references. Build-time network access is allowed; offline source rebuilding is not promised. Source delivery may merge after Docker-free verification and cross-review, but issue33's actual build/import/WAN-free startup criteria remain open until final issue36, after issue34 development. No Docker CLI, Compose config, engine or host-firewall action is permitted during this source phase.
