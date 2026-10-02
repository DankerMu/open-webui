# Recovery fixture

Issue34; expanded fixture. User decisions: full cold backup, including sandbox workspace volumes; restore only to a distinct empty host/daemon. Real A-T14/A-T15 remain final issue36 work.

## Action-changing blind spots

- Sandbox `/home/assistant` is a separate `chat-<id>-workspace` volume, not outputs (`docker_manager.py` volume mounts). Include detached/stopped volumes or fail ambiguity; running-container enumeration is insufficient.
- Fixed `ocu-test-*` and `owui-chat-*` names defeat Compose-project isolation (deployment overlays and `_container_name`). Refuse same-daemon recovery; never remove existing containers to make room.
- WebUI cursor only advances while broker state owns revisions (`models/ocu_chat_state.py`, `outputs_broker.py`). Stop all writers before capture; reject skew rather than reset revisions.
- Installed releases omit image archives (`release.import_release`); installed inventory is not a delivery directory. Reuse installed/startup verification, retain offline delivery separately.
- Old images may not recognize the current Alembic revision (`backend/open_webui/config.py`). Consumer contract alone is insufficient; inspect actual target compatibility and never downgrade.
- Initializer posts configuration when its volume marker is absent (`openwebui/init.sh`). Preserve and require the marker with restored DB state, rather than silently reseed.
- Fake resource discovery lacks recovery operations and can return misleading empty results for unsupported filters (`tests/deploy/fakebin/docker`). Add stateful semantics and negative controls before claiming quiescence.

## Implementer handoff

Implement this fixture in the existing OCU deploy seam with one recovery entrypoint and bounded helpers. Reuse the canonical release identity/startup APIs, not a second image inventory or parallel port policy. Treat captured config as inert sensitive data, restore only into empty owned resources, preserve workspace bytes/identity/permissions, and keep writers stopped on failure. Extend existing fake boundaries to defend observable data/resource states. Do not edit or adopt the user-owned RESTORE.md, backup-test.sh, resolve-image-references.sh or OCU docs/decisions. Do not run validation, Docker or nested agents; parent owns execution and acceptance.

References and executable evidence mapping are in design.md and tasks.md. No source success closes the deferred engine acceptance.

## Source milestone evidence

OCU [PR26](https://github.com/DankerMu/open-computer-use/pull/26) merged as `7d6e06ff6f603cff704d1455c995ab9acf46acbb`; reviewed candidate `5941dad09a3a15b5ae97e228e80dc524921cf462`. Five recorded review rounds preserve four rejected candidates and a clean fifth round. The candidate passed 311 deployment tests, source lint, exact-head identity CI and parent CLI counterexamples with real Git/files/archive/process execution and a stateful fake engine/database.

The parent additionally exercised handled mid-import failure after partial image-cache mutation, preserved target identity and unrelated data, then activated the same delivery successfully. This is not SIGKILL, power-loss or real-engine proof. [Source merge evidence](https://github.com/DankerMu/open-computer-use/pull/26#issuecomment-5924209968) records limitations and negative controls. Task 5.1 stays unchecked; do not archive this fixture or close issue34 before final engine acceptance.

## Closure

Archived on 2026-10-01 by user decision (Plan 2 Stage 1) with task 5.1 still open: two-host backup/restore and previous-release startup on a real engine was never run and is not claimed as tested. The sentences above that tie archiving to that evidence are superseded by the umbrella closure contract of 2026-10-01. The capability spec is published so that later changes can modify it.
