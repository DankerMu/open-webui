## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-listing-storage-low --strict --no-interactive`.

## 2. Implement (in open-computer-use, from `main` after #638 or `1dba74e`)

- [x] 2.1 Tests first in `tests/orchestrator/test_outputs_endpoint.py`, next to `:465`:
  - `loaded.recover_publications` (imported by name at `app.py:99`) raising `OSError(errno.ENOSPC, ...)` answers 503 with `Retry-After: 1`; after `monkeypatch.undo()` the next listing answers 200 (pattern `:486-489`). This is the path B-T11 hit;
  - reconcile raising `OSError(errno.ENOSPC, ...)` answers 503 with `Retry-After: 1`;
  - publish recovery raising `StorageLowError` answers 503 with `Retry-After: 1`. On `1dba74e` this row goes red as an exception raised by `http.get`, because `_client` uses `raise_server_exceptions=True` (`:142`), so do not rewrite it to assert 500;
  - a generic `OSError` still answers 500;
  - no host path appears in any detail.
  - Record red on `1dba74e`.
- [x] 2.2 `computer-use-server/app.py`: ENOSPC and `StorageLowError` map to the transient 503 in `_outputs_http_error` and the listing's except arms.
- [x] 2.3 Green: the outputs test modules on macOS and in the CI-shaped container; `./tests/test-project-structure.sh`. The PR states that client behaviour is unchanged.

## Risk packs

Selected:

- **Error handling:** only ENOSPC and `StorageLowError` become transient, 2.1.

Not selected:

- **State / invariants:** reconcile and recovery semantics are unchanged.
- **Security:** details stay path-free, 2.1.
- **Documentation:** no operator procedure changes.
