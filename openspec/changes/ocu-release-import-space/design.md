## Design

Change surface:

- `deploy/release.py`:
  - `import_release`, reordered: `acquire` → pin host → `verify_archive_set(delivery)` → present roles → precheck → stage to-load copies → lock → conflicts → load → verify → publish;
  - a private present-role helper;
  - a private free-space helper;
  - the stderr summary line.
- `deploy/production-like-test/NETWORK-HARDENING.md`, upgrade step 3.

Must preserve:

- When nothing is present, the loads (same `ROLE_ORDER`, same archives) and the published installation are byte-identical to today. The only additions are the earlier delivery verification and the precheck.
- Every role's archive is verified by `verify_archive_set`, the one existing function, before any copy or load.
- Each to-load staged copy keeps its `staged archive checksum mismatch` re-check.
- `reject_existing_conflicts(imported)` covers all roles under `ImageStoreLock`.
- `verify_loaded_images` checks all seven roles.
- Failure paths are unchanged: no partial installation is published; `PublicationSession.cleanup` removes the stage; the "image cache entries may remain" messaging stays.
- stdout of `release.py import` and of `recovery.py restore` / `activate` is unchanged. The summary line goes to stderr.
- Recovery callers' signatures are unchanged.

Must add/change:

- the reordering above;
- the present-role skip;
- the precheck;
- the summary line;
- docs.

Governing invariant: a release is published only after every role's reference resolves to an identity the inventory accepts, on the expected platform. A present role meets this before import starts; a loaded role meets it after load. The conflict check under the lock and `verify_loaded_images` confirm both, unchanged.

Sibling surfaces:

- **Identity:**
  - `verify_loaded_images` (final gate);
  - `existing_reference` / `reject_existing_conflicts` (all aliases, under the lock);
  - the new present-role test.

  They share one rule: `inspect_image` + `image_identity` + `accepted_image_identities`. The platform check lives inside `image_identity` (`:1866-1868`), and there is no second rule.
- **Archive verification:** `verify_archive_set`, now on the delivery root, once. The intersection of `descriptor_digests` across roles that share a reference, and the `imported references do not equal the inventory` check, are unchanged.
- **Callers:**
  - `cmd_import`;
  - recovery `activate` (`recovery_resources.py:1229`) and `restore` (`:1331`). Restore also runs import when only some roles are missing (`:1328-1336`) and holds its own lock path.
- **Stage cleanup:** `PublicationSession`.
- **Docs:** `NETWORK-HARDENING.md:258` and step 3. `deploy/BACKUP-RESTORE.md` states no import disk need, so it stays unchanged.

Seams under test: `tests/deploy/test_offline_release.py` import tests:

- `release.py` runs as a subprocess against `tests/deploy/fakebin/docker`;
- `ops.log` gives load and inspect argv;
- `FAKE_DOCKER_HOLD_LOAD` freezes a load so the stage can be inspected;
- `patched_release(...)` source substitution stubs `shutil.disk_usage` and `os.stat` for the precheck;
- the fake `docker info` (`{{json .}}`) reports `DockerRootDir`, and tests create that directory;
- a recovery test checks stdout.

Required evidence:

- a. **Partial import.** `workspace` and `documentserver` are present with accepted identities.
  - `ops.log` shows `load` for exactly the other five, in `ROLE_ORDER`.
  - A held load shows that the stage has no `images/workspace.tar` or `images/documentserver.tar`.
  - stderr has the summary line naming both groups.
  - The published tree equals a full import's published tree: `release.json` bytes, `source/` and `fonts/` contents, and no `images/` or `source.bundle`.
  - `ops.log` shows `image inspect` for all seven references after the last `load`, which is `verify_loaded_images`.
- b. **Corrupt archive.** A corrupt present-role archive (`workspace.tar` with one byte flipped) fails with `workspace: archive checksum mismatch` before any copy or `load`. Nothing is published.
- c. **Nothing present.** All seven roles are staged and loaded in today's order. The load argv sequence and published tree match today's.
- d. **Foreign identity.** A present reference with a foreign identity is not skipped, and the existing conflict refusal fires (`existing image … conflicts with the release`) before any load.
- e. **Wrong platform.** A present reference with an accepted identity on the wrong platform is not skipped. `reject_existing_conflicts` refuses with `image platform is …, expected linux/amd64` before any load. Nothing is published.
- f. **Precheck refuses.**
  - On separate filesystems:
    - stage free = `staged_bytes + H − 1` → refusal naming the stage path, needed and available bytes;
    - Docker root free = `3 × load_bytes + H − 1` → refusal naming the root path.
  - On a shared filesystem (equal `st_dev`), free = `staged_bytes + 3 × load_bytes + H − 1` → refusal. Each requirement alone would fit, so this shows the sum is used.
  - Every refusal happens before any copy or `load` (no `load` in `ops.log`, no stage files).
  - A missing `DockerRootDir` path → refusal.
- g. **Precheck boundary.** Free exactly equal to the requirement passes, in both the separate and shared layouts.
- h. **All present** (on `release.py import`).
  - No copy and no `load`.
  - Docker root requirement is `H`.
  - The installation is published and `verify_loaded_images` ran.
- i. **Recovery stdout.** `recovery.py restore --retained-delivery`, using `_write_retained_delivery` in `tests/deploy/test_recovery.py:511`, over a daemon where at least one role is missing and at least one is present. Without a missing role, `verify_local_images` passes and import is skipped, so the check would be vacuous.
  - stdout is exactly the `{"owned_resources": ...}` JSON from `deploy/recovery.py:809`.
  - stderr carries the summary line naming the present and to-load roles.
  - `activate` prints nothing on stdout (`deploy/recovery.py:813-826`), so an activate case only asserts that stdout stays empty.

Non-goals: see proposal Impact.

Review focus:

- One identity rule, with the platform check inside `image_identity`. Only the missing-image and platform errors mean "not present".
- `verify_archive_set` runs once over the delivery, before any copy, and `imported` covers all roles.
- The precheck runs after `acquire` and the host pin, before the first copy, with the exact formula.
- The nothing-present path is equivalent to today's.
- stdout contracts are unchanged.
