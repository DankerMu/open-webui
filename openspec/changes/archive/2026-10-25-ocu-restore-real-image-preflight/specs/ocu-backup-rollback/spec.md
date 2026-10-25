## ADDED Requirements

### Requirement: Restore preflight works against the shipped images

The migration-graph check used by restore and activation SHALL run the selected WebUI image with a fixed non-secret `WEBUI_SECRET_KEY` placeholder and no runtime or recovery-set value. The empty-target database check SHALL count only relations in user schemas and SHALL NOT count PostgreSQL's system schemas (those named `pg_*`, and `information_schema`). A probe that exits non-zero or reports no revisions SHALL still refuse.

#### Scenario: Restore with the shipped images

- **WHEN** a complete recovery set is restored onto a distinct empty daemon with the retained delivery of the captured release
- **THEN** the migration-graph check reports the image's revisions and the empty-target check accepts the fresh database, so restore reaches readiness

#### Scenario: Target database holds user data

- **WHEN** the isolated target database contains any user table, sequence, view or index
- **THEN** restore refuses with "target database is not empty" before loading the dump

#### Scenario: Probe cannot report a graph

- **WHEN** the migration-graph probe exits non-zero or prints no revisions
- **THEN** restore and activation refuse with "selected WebUI image did not report a migration graph"

#### Scenario: Probe receives no runtime value

- **WHEN** restore or activation runs the migration-graph probe
- **THEN** the probe run passes no environment value other than the fixed `WEBUI_SECRET_KEY` placeholder and runs with `--network none`
