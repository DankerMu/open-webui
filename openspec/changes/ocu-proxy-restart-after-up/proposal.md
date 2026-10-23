## Why

#612, found during the #590 (d) upgrade on the acceptance VPS (2026-10-23, OCU `34dc83c` → `bff4f29`). `deploy/up.sh` recreated `computer-use-server`, `documentserver` and `open-webui`, but not the unchanged `proxy`. nginx resolves the three upstream names once at startup (`deploy/proxy/nginx.conf.in:7-9`, no `resolver`), so it kept the old container addresses. Every `:8082` OCU request returned 502 until `docker restart ocu-test-proxy`. The old OCU address had been reassigned to `documentserver`, so a listener on the same port would have received the wrong traffic instead of failing.

Paths are in the sibling `open-computer-use` checkout at `origin/main` `bff4f29`:

- `deploy/up.sh:286-300` `start_stack` runs `up -d --no-build --pull never` once per snapshot: core, WebUI, then proxy. The proxy snapshot is a separate Compose file with no `depends_on`, so a backend recreation never touches the proxy.
- `deploy/production-like-test/NETWORK-HARDENING.md:206` documents that nginx resolves `open-webui:8080`, `computer-use-server:8081` and `documentserver:80` while validating its config, so the three upstreams must exist first. The #590 upgrade section (`:220-272`) runs `up.sh` and never mentions the proxy.

## What Changes

Owner decision on #612 (2026-10-23): direction 1.

- After `start_stack` for the proxy snapshot succeeds, `up.sh` restarts the proxy service with the same project, project directory, env file and snapshot (`docker compose … restart proxy`) through `run_owned`. It does this on every run, whether or not a backend was recreated. The proxy entrypoint re-renders and re-validates its config, and nginx resolves the three upstreams against the containers that now exist.
- `up.sh` prints one line naming the restart, so the deploy log shows it.
- A failed restart prints `deploy: proxy restart failed for <snapshot>` and exits non-zero, like a failed `up`.
- `NETWORK-HARDENING.md` `:206` and the #590 upgrade section describe the restart. The "three upstreams must exist first" rule still holds. A backend recreated outside `up.sh` still needs a proxy restart, and the doc says so.

No proxy config, render, or route change.

## Capabilities

### Modified Capabilities

- `ocu-reverse-proxy`: new requirement "Every deployment start restarts the proxy last".

## Impact

- An upgrade through `up.sh` no longer leaves `:8082` and `:8083` pointing at stale addresses.
- Every `up.sh` run, including a no-op rerun, has a short `:8082`/`:8083` outage while nginx restarts (about 1–2 s).

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent (issue says S for direction 1); expanded because up.sh is the deployment entrypoint
Blast radius: every deployment start; a wrong restart breaks the only published surface, a missing one keeps the 502 outage
Selected risk packs: Public API / CLI / script entry; Error handling / partial outputs; Concurrency / ordering; Documentation
Evidence floor: tests/deploy/test_deploy_entry.py (fake docker harness) red before / green after; the OCU unit suite in the CI-shaped container; ./tests/test-project-structure.sh
Host acceptance: the issue's first criterion needs a real upgrade through up.sh; it is recorded as pending the next release upgrade on the acceptance VPS, not claimed from the fake harness
```
