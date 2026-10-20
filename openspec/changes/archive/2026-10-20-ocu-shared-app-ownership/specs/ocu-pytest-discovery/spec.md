## RENAMED Requirements

- FROM: `### Requirement: Auth-guard fixture owns the server's local import closure`
- TO: `### Requirement: App-importing fixtures own the server's local import closure`

## MODIFIED Requirements

### Requirement: App-importing fixtures own the server's local import closure

Every test fixture that imports the server (the auth-guard app fixture, the WebSocket server-reload fixture and the file-route fixtures) SHALL own one shared set, by name or prefix, of every module whose file lives under `computer-use-server/` that a fresh server import can load, eagerly or lazily, so that each fixture generation binds only modules of its own generation. A regression in the auth-guard test module SHALL assert that every module present inside the owner's scope whose file lives under `computer-use-server/`, excluding the standalone `drawio/` script directory that the server never imports, is owned, so the owned set cannot drift silently behind the server's import graph. The module-ownership regressions SHALL repeat that check, and a current-generation binding check, for every app-importing owner. Auth-guard, WebSocket and file-route assertions, the `isolated_modules` body, and the alias-runtime and startup-warning owners' sets SHALL remain unchanged.

#### Scenario: Closure is covered

- **WHEN** a test imports the server through any app-importing owner, with any server-local modules cached from earlier tests in the same process, including the `drawio/` script loaded by its own test
- **THEN** every `sys.modules` entry whose file resolves under `computer-use-server/` outside `drawio/`, and every Python module file on disk under `computer-use-server/` outside `drawio/`, is matched by the shared names or prefixes
- **AND** adding a server-local module file without owning it fails that regression with the module named, whether or not any test has imported it yet

#### Scenario: Second generation binds current modules

- **WHEN** the server is imported inside the auth-guard owner's scope twice in sequence
- **THEN** the second scope's `docker_manager` is a different object from the first scope's
- **AND** inside the second scope the Office lookup-admission module binds the current `docker_manager` module and the current `StateCorruptError` class, and the CLI runtime binds the current `docker_manager` capture function

#### Scenario: Every app-importing owner binds current modules

- **WHEN** a caller has already imported the server and then uses the WebSocket owner or either file-route owner
- **THEN** inside the owner's scope `docker_manager` is a different object from the caller's, the Office lookup-admission module binds that scope's `docker_manager` and `StateCorruptError`, and the CLI runtime binds that scope's `docker_manager` capture function
- **AND** a name dropped from the shared set fails the regressions for every app-importing owner
