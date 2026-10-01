# Tasks

## 1. Release preparation and import

- [x] 1.1 Implement the six-role release inventory and build/export path from committed sources; parent verifies role/platform/provenance completeness and dirty/untracked input boundaries using real Git plus the Docker fake.
- [x] 1.2 Implement checksum/path-safe import and exclusive publication; parent proves corrupt/missing/unsafe archives, undeclared archive-internal tags, configuration-digest conflicts, concurrent publication and interrupted import fail before load or without partial installation/destructive rollback. A stateful fake image store must retain unrelated mappings; bypassing the reference check must make the negative control fail.

## 2. Deployment consumers

- [x] 2.1 Bind bootstrap and startup to the release inventory, both SHAs and six local image identities; parent verifies missing/mismatched source/images and modified tracked initializer bytes at unchanged HEAD fail before network/firewall/container mutation. Frozen startup forbids build/pull without losing existing topology/secret invariants; unrelated untracked files remain allowed.
- [x] 2.2 Extend the canonical version record and runtime offline switches; parent verifies secret-free provenance, preserved LAN model/RAG configuration, existing deploy regressions and documented build/import/start commands.

## 3. Source integration

- [x] 3.1 Complete independent cross-review, Docker-free counterexamples/restoration, affected native/proxy checks, matching source CI and decision/docs synchronization; merge source without claiming deferred release acceptance.

## 4. Deferred final engine acceptance

- [ ] 4.1 After all development, execute real build/export/clean-store import on linux/amd64, verify all six identities and sandbox entrypoint/user/workdir, reject missing/replaced images, and prove required surfaces restart without WAN/build/pull on fresh and preserved configuration; record A-T14 in issue36, then close issue33 and archive this fixture.

## Risk mapping and protected evidence

- Script entry/config, file IO/path safety, errors/concurrency: tasks1.1–1.2; malformed inventory, path traversal/symlink, wrong checksum, existing destination, interruption, competing publisher.
- Trust/release/dependency identity: tasks1.1,2.1,4.1; exact six-role set, both SHAs, content digests and platform, no secrets/untracked build context, preflight before mutations.
- Order/legacy compatibility: task2.1; retained literal-dollar snapshots, proxy-only ports, distinct sandbox network, cleanup disabled, no orphan removal, init image reuse, root-only/no-overwrite bootstrap.
- Documentation: tasks2.2–3.1; one canonical machine inventory and rendered deployment record, explicit local-content versus registry-digest distinction.
- Not selected schema/columns/units: no application persistence migration.

Construction, critical integrity/operating boundary. Parent owns expected invariants and executes acceptance outside candidate write authority. Implementer edits source/tests only and skips validation while working. Qualify new fake behaviors with observable state changes and negative controls, not argv echoes alone. Use the existing deploy suite and a throwaway consumer scenario; real Git/archive operations stay real. No Docker binary, daemon, Compose config, firewall or host networking command is permitted before task4.1. Fake evidence cannot satisfy task4.1; all results and deferred gaps remain explicit.
