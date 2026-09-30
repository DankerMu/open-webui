# Design

## Context

`deploy/up.sh` resolves three Compose documents, checks topology, freezes literal-dollar-safe snapshots and starts a shared project with cleanup profiles disabled. Its `--build` conflicts with offline delivery. Bootstrap requires `$DEPLOY_ROOT/source` at `SOURCE_SHA`, refuses existing credentials and supplies named image references. Workspace image naming selects its production entrypoint/user/workdir. The existing record is `DEPLOYED_VERSION.md`.

## Goals / Non-Goals

Deliver one self-contained release and reject drift before deployment mutation. Preserve frozen snapshots, proxy-only publication, sandbox egress/DNS, initializer bind mounts and private bootstrap. Do not introduce a registry, promise reproducible/offline builds, migrate application data, adopt untracked scripts, or disable user-selected external features. Backup/rollback orchestration belongs to issue34.

## Decisions

### Identity and release inventory

One machine-readable release inventory is authoritative for six exact roles: workspace, computer-use-server, retention-guard, proxy, open-webui and postgres. `DEPLOYED_VERSION.md` renders its provenance alongside current runtime policy; it is not a second independently maintained inventory.

Record a format version, linux/amd64 platform, OCU/WebUI full source SHAs, each named reference and configuration digest, image-archive path/checksum, source-bundle path/checksum, non-secret build arguments, source Dockerfile/input manifest hashes and material versions. Registry RepoDigests, if captured, are provenance only. Never construct a registry digest reference from a configuration digest. Content-derived tags retain `open-computer-use` for the workspace and avoid collisions between releases built from the same source with different material resolutions.

### Online preparation and offline import

Use the current Dockerfiles from clean committed source snapshots, not mutable worktrees or ignored generated files. Build workspace/server/retention/proxy from OCU and WebUI from the explicit fork checkout. Build-time npm/Python/Pyodide/Draw.io materialization is preserved. PostgreSQL uses an explicit upstream reference; its observed image identity is frozen into the release. Build every image for linux/amd64 and verify inspected platform/identity before export.

Export named images with all required tags and a Git bundle of the OCU source commit. The Git bundle supplies existing deployment and initializer bind paths plus the checkout identity expected by bootstrap; no build dependency on a sibling checkout remains on the destination. Include recorded WebUI source identity and input manifests; running the image does not require a WebUI source checkout.

Publish a complete release under an exclusive destination reservation using a sibling staging directory; refuse an existing destination and remove incomplete staging on error. Import validates schema, the exact role set, safe confined regular-file paths, all file checksums and source identity before image loading. It loads images, verifies every named reference resolves to the declared configuration digest/platform, and publishes an install root containing `source/` and the inventory only after success. Reject conflicting existing named references rather than overwrite them. A failed load may leave verified image cache entries; never delete unrelated images as rollback. No partial install root or success record is published.

Before loading, inspect every image archive's import metadata and configuration bytes. The complete set of imported references must equal its declared inventory references; reject undeclared tags, duplicate/conflicting mappings, unsupported import metadata and mismatched configuration digests. Check every existing local reference for conflicts. Bind inspection and loading to the same verified private staged archive bytes, not a mutable original path. This protects unrelated mappings even when the archive checksum itself is valid.

### Startup and bootstrap

A required `OCU_RELEASE_MANIFEST` identifies the imported inventory. Bootstrap binds both source SHAs and all six references to it while retaining its root-only/no-overwrite/0600 secret contract. Do not execute a generated shell fragment or mutate an existing runtime.env to inject image values.

Before any network/firewall/container mutation, startup checks the source SHA, release identity and all six local images. It also verifies tracked deployment and initializer content against the bundled commit: an unchanged HEAD with modified tracked files is a mismatch. Unrelated untracked files alone are not a rejection reason. Validate the resolved service-to-image mapping, including open-webui-init reusing open-webui. Freeze and execute those checked documents with `up --no-build --pull never`; retain disabled cleanup profiles and `COMPOSE_REMOVE_ORPHANS=false`. Missing images cannot trigger a build or registry request. Preserve named references for the per-chat sandbox consumer.

### Runtime policy and record

Set existing OFFLINE_MODE/update-check/automatic model-update switches in the deployment overlay. Preserve LAN OpenAI/RAG endpoints and existing local previews. Record source Dockerfile defaults and explicit build-argument overrides separately from observed image IDs; input hashes are not claims about installed package versions. Extend the existing version-record script to cover six images, both source identities and material/build provenance, never credentials.

An existing persistent WebUI configuration can override some environment defaults. Final acceptance must inspect effective settings on both fresh and preserved data. Arbitrary user-authored network requests, unbundled Python packages and opt-in external integrations are outside the bundled-material guarantee; they are not silently disabled or claimed WAN-free.

## Risks / Trade-offs

- Mutable tags or wrong archives → checksums plus mandatory name-to-configuration-digest verification at import/start; trusted host administrators remain outside this integrity threat model.
- Import has daemon side effects → validate all bytes before loading, retain harmless cache on failure, never delete existing images or publish a partial installation.
- Large Git/image archives → accepted portability cost; tracked source only, no credentials, caches or user-owned untracked files.
- Platform or Compose/save-load differences → actual engine acceptance is a separate mandatory gate in issue36.
- Source/fake checks are weaker than engine execution → label evidence accordingly; do not close issue33 or archive this fixture before deferred criteria pass.

## Migration Plan

New installations import a verified release before bootstrap. Existing installations require an explicit operator migration to the release inventory; bootstrap refuses overwrite and startup refuses the old unverified configuration. Preserve the previous complete release and data; issue34 supplies consistent backup and one-version rollback without restoring direct unauthenticated publication.

## References and implementer prompt

Implement only the release build/import/verification seam and its bootstrap/startup/record consumers. Reuse `deploy/up.sh`, `write-deployed-version.sh`, `tests/deploy/{support.py,fakebin/docker,test_deploy_entry.py,test_bootstrap_runtime.py}` and the staged-publication failure semantics of the Draw.io preparer. Do not edit the user-owned RESTORE.md, backup-test.sh, resolve-image-references.sh or OCU docs/decisions. Preserve all named deployment invariants. Parent owns the fixture/oracles and executes only fake-boundary checks during source development; actual Docker acceptance is deferred, never mocked into completion.
