## ADDED Requirements

### Requirement: Auth-guard fixture owns the server's local import closure

The auth-guard app fixture SHALL own, by name or prefix, every module whose file lives under `computer-use-server/` that a fresh server import can load, eagerly or lazily, so that each fixture generation binds only modules of its own generation. A regression in the auth-guard test module SHALL assert that every module present inside the owner's scope whose file lives under `computer-use-server/`, excluding the standalone `drawio/` script directory that the server never imports, is owned, so the owned set cannot drift silently behind the server's import graph. Auth-guard assertions, the shared module-ownership helper and the other owners' sets SHALL remain unchanged.

#### Scenario: Closure is covered

- **WHEN** a test imports the server through the auth-guard owner, with any server-local modules cached from earlier tests in the same process, including the `drawio/` script loaded by its own test
- **THEN** every `sys.modules` entry whose file resolves under `computer-use-server/` outside `drawio/`, and every Python module file on disk under `computer-use-server/` outside `drawio/`, is matched by the owner's names or prefixes
- **AND** adding a server-local module file without owning it fails that regression with the module named, whether or not any test has imported it yet

#### Scenario: Second generation binds current modules

- **WHEN** the server is imported inside the auth-guard owner's scope twice in sequence
- **THEN** the second scope's `docker_manager` is a different object from the first scope's
- **AND** inside the second scope the Office lookup-admission module binds the current `docker_manager` module and the current `StateCorruptError` class, and the CLI runtime binds the current `docker_manager` capture function
