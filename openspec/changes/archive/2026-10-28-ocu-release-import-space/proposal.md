## Why

(#663.) Upgrading the acceptance VPS to OCU `8da37a4` (2026-10-27/28) failed three times with `no space left on device`. Each time it happened while `release.py import` loaded `postgres.tar`. On the third attempt nothing else was running on the host.

A 5-second disk log showed two phases:

- the stage copy took free space from 5.3G to 2.1G;
- the load phase then took it to 0. Every new `open-webui` layer, everything but the base layer, was unpacked during `docker load`, about 5.3G.

The owner approved stopping the WebUI and deleting the old image to finish, which cost about 3.5 minutes of downtime.

At OCU `main` `058dd36`, `import_release` (`deploy/release.py:2678-`):

- copies every role's archive into the stage (`copy_regular`);
- checksums and inspects every staged archive (`verify_archive_set`, `:2594`);
- `docker load`s every role (`load_image`, `:1938`), even when the role's exact image is already present;
- runs `verify_loaded_images` (`:2664`) as the final identity gate.

There is no free-space check. Usually 4 of 7 roles are unchanged between releases; `workspace` alone is 3.5G. The disk need is described in one phrase in `deploy/production-like-test/NETWORK-HARDENING.md:258` ("about twice the delivery plus the loaded images"), which does not mention that new images are unpacked during load.

## What Changes

**Verify the whole delivery once, then skip present roles.**

- Import first acquires the publication session (which writes only its lock file), then pins the local Docker host (`pin_local_docker_host`).
- It then runs `verify_archive_set(delivery, payload)` over the delivery in place, before any copy. Recovery (`recovery_resources.py:1212`, `:1311`) and `cmd_verify` (`:3003`) already verify a delivery this way.
  - Every role's archive is checksummed and inspected exactly once by the existing function. The "verify all archive checksums … before loading images" requirement stays.
  - The returned `imported` map covers all seven roles and still feeds `reject_existing_conflicts` under `ImageStoreLock`, as today.
  - A corrupt archive fails with the existing `"{role}: archive checksum mismatch"` before anything is copied.
- A role is **present** when its `reference` resolves locally to an identity accepted for it by `accepted_image_identities(record["configuration_digest"], record.get("descriptor_digests", []))`. This is the rule `verify_loaded_images` applies, through `inspect_image` and `image_identity`, platform included.
  - The present-role helper treats exactly two errors as "not present": `inspect_image`'s missing-image error and `image_identity`'s platform error.
  - Any other inspect failure (a non-"no such image" daemon error, malformed JSON) is raised as today.
- Present roles are neither copied into the stage nor loaded. Roles to load are copied, their staged copy re-checksummed (today's `"{role}: staged archive checksum mismatch"`), and loaded in `ROLE_ORDER`, as today.
- `reject_existing_conflicts(imported)` (all roles) and `verify_loaded_images` (all seven roles) run unchanged.
  - A present image retagged to a foreign identity before the lock is taken is refused by the conflict check.
  - A present image removed before the end fails the final verification.
  - Either way nothing is published.
- A reference present with a foreign identity is not present, and the existing conflict refusal fires.
- A reference with an accepted identity on the wrong platform is also not present. `reject_existing_conflicts` → `existing_reference` → `image_identity` then refuses with today's platform message, before any load.
- `import_release` writes one summary line to **stderr**, naming the present roles and the roles to load. stdout is unchanged, because `recovery.py restore` prints a JSON contract on stdout (`deploy/recovery.py:809`).

**Check free space before copying anything** (after `acquire` and the host pin, before the first copy). Sizes are `stat` sizes of the delivery files; the inventory has no size field. Definitions:

- `load_bytes` = the sum of the archive sizes of the roles to load.
- `bundle_bytes` = the sizes of `source.bundle` + `fonts.tar`.
- `staged_bytes` = `load_bytes + 2 × bundle_bytes`. The stage holds a copy of each bundle, the `git clone` of the source bundle and the extracted `fonts/`. The clone's uncompressed working tree is about 34 MiB for OCU, which the headroom absorbs.
- `H` = 1 GiB headroom.

Rules:

- The stage filesystem (the install root's parent, which exists after `acquire`) must have `staged_bytes + H` free.
- Docker's data root must have `3 × load_bytes + H` free. The data root is `DockerRootDir` from `docker info --format '{{json .}}'`, read the way `local_daemon_identity` and `image_platform_options` read it. The factor 3 comes from the observation above: a 1.8G archive unpacked to about 5.3G.
- When both paths are on one filesystem (same `st_dev`), it must have `staged_bytes + 3 × load_bytes + H` free, with the headroom counted once.
- A data root that is missing or cannot be `stat`ed refuses the import.
- When short, import refuses before copying or loading anything. The message names each needed and available byte count and the filesystem path. Nothing is staged.
- Whole-archive counting overstates the need when layers are shared, and there is no override. The doc says to free space or delete old images.

**Docs.** `NETWORK-HARDENING.md` ("Upgrading an existing deployment", step 3) states:

- the disk need and that import checks it;
- that present roles are skipped;
- that containerd's own root is assumed to be on the Docker data root's filesystem (usual for `/var/lib/containerd`);
- to keep the build host's BuildKit cache, because without it every `open-webui` layer is rebuilt and none is shared with the previous release.

**Rollout note.** Import runs from the installed release's source (`NETWORK-HARDENING.md` step 3), so the first upgrade after this change still uses the old import. Every upgrade after that benefits.

## Capabilities

### Modified Capabilities

- `ocu-offline-image-delivery`: one added requirement, for skipping present roles and the free-space precheck.

## Impact

- OCU:
  - `deploy/release.py` (`import_release`, a precheck helper, a present-role helper reusing `inspect_image` / `image_identity` / `accepted_image_identities`);
  - `deploy/production-like-test/NETWORK-HARDENING.md`;
  - tests: `tests/deploy/test_offline_release.py` and the recovery tests. Import tests run `release.py` as a subprocess against `tests/deploy/fakebin/docker`. They use the existing `patched_release(...)` source substitution to stub `shutil.disk_usage` / `os.stat`, and `ops.log` / `FAKE_DOCKER_HOLD_LOAD` to observe loads and the stage.
- Callers of `import_release`: `release.py cmd_import` and recovery (`recovery_resources.py:1229` activate, `:1331` restore).
  - Restore calls import whenever `verify_local_images` fails (`:1328-1336`), which includes a daemon missing only some roles. So restore and activate also skip present roles. This is intended.
  - Recovery holds `ImageStoreLock(recovery_lock_path)`, a different path from import's own lock, so there is no deadlock.
  - Existing restore tests with a retained delivery guard this (task 3.4).
  - Activate and restore already run `verify_archive_set` on the delivery before calling import (`recovery_resources.py:1212`, `:1311`), so on those paths each archive is hashed twice. That costs read time only and does not affect correctness.
- Non-goals:
  - changing archive verification or the inventory format;
  - garbage-collecting old images;
  - making builds layer-reproducible;
  - measuring containerd's own root when it differs from Docker's data root (documented assumption).

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent; expanded: release import is a publish path with fail-closed and rollback guarantees, shared by recovery
Blast radius: every upgrade, activate and restore; a wrong "present" decision publishes a release whose image was never verified; a wrong precheck refuses a valid upgrade or lets one fill the disk
Selected risk packs: Public API / CLI / script entry (release.py import and recovery callers); File IO / path safety (stage copies skipped, delivery archives read in place); Resource limits / large input (free-space precheck); Error handling / rollback / partial outputs (refusal before any copy; failure paths unchanged); Legacy compatibility (nothing present → today's path); Documentation
Not selected: Auth / secrets (none); Schema (inventory unchanged); Concurrency (ImageStoreLock and PublicationSession unchanged); Release packaging (no image recipe change)
Evidence floor: OCU unit command (AGENTS.md) for tests/deploy/test_offline_release.py and the recovery test modules; new import and recovery tests (design evidence a–i); scripts/docs-lint gates for the NETWORK-HARDENING.md change
design.md: present
```
