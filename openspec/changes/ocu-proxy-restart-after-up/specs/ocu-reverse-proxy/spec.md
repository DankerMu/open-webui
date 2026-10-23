## ADDED Requirements

### Requirement: Every deployment start restarts the proxy last

After `deploy/up.sh` has started the core, WebUI and proxy snapshots successfully, it SHALL restart the proxy service with the same Compose project, project directory, env file and snapshot, so that nginx resolves its upstreams against the backend containers of this run. It SHALL log `deploy: proxy restarted for` and the proxy snapshot path on stderr. A failed restart SHALL end `up.sh` with a non-zero exit and a message naming the proxy snapshot. A failed core or WebUI start SHALL neither start nor restart the proxy.

#### Scenario: Upgrade recreates the backends

- **WHEN** `deploy/up.sh` runs and the core and WebUI starts recreate `computer-use-server`, `documentserver` and `open-webui` while the proxy container is unchanged
- **THEN** after the proxy `up`, `up.sh` restarts the proxy, logs `deploy: proxy restarted for` with the proxy snapshot path, and exits 0

#### Scenario: Proxy restart fails

- **WHEN** the proxy restart exits non-zero
- **THEN** `up.sh` exits non-zero with `deploy: proxy restart failed for` and the proxy snapshot path, and removes its temporary configs
