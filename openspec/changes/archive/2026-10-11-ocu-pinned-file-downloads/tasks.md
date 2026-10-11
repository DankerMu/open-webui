# Tasks

## 1. Fixture and baseline

- [x] 1.1 Expanded fixture review and `openspec validate ocu-pinned-file-downloads --strict --no-interactive` pass before production edits; record pinned framework method/range semantics. Actual HTTP on Starlette0.38.6 returns HEAD405 and ignores satisfiable/unsatisfiable Range with full-body200 in both modes; characterization is not containment acceptance.
- [x] 1.2 Author public-route temporary-canary race tests for inline/download, capture semantic RED on unchanged production code before the fix, and retain ordinary byte/header positive controls. Write paired tests before any new production response module.

## 2. Descriptor cutover and ownership

- [x] 2.1 Reuse one workspace descriptor acquisition path for single-file streaming and the existing bytes reader; unchanged pre-fix race assertions become GREEN. Preserve MCP/archive/upload contracts and do not consolidate broker primitives.
- [x] 2.2 Prove post-acquisition leaf/ancestor swaps retain original bytes and fstat-derived length/ETag/Last-Modified in both modes; also deterministically replace chat-root and outputs-root at their acquisition boundaries, with real opens and an asserted swap, accepting only403/404 or pinned original bytes. Record honest baseline outcomes for these distinct root cases. Cover empty/multi-chunk files, in-root aliases, outside and sibling-root links, missing/non-file errors, Unicode/quoted names and isolated MIME policies.
- [x] 2.3 Exercise guarded response lifecycle success, unexecuted construction, setup/read/send errors, disconnect/cancellation before first body and during a real bounded read; prove closure without abandoned-worker or double-close races. Qualify fault oracles with semantic negative controls and restored passes, recording their actual chronology rather than calling late controls original RED.

## 3. Acceptance and lifecycle

- [x] 3.1 Parent runs owning file-response/header tests plus `tests/test_upload_claim.py`, `tests/security/test_path_traversal_app.py`, `tests/test_auth_guard.py`, `tests/orchestrator/test_mcp_resources.py` under Python3.12/current requirements, recording commands, versions, collection/pass/skip counts and exits; affected static/documentation gates and an isolated import from declared Dockerfile Python COPY inputs pass.
- [x] 3.2 Independent actual Uvicorn HTTP verifies both modes' bytes, descriptor metadata, MIME/disposition/isolation/no-store, current HEAD/Range behavior, safe alias behavior and a bounded client disconnect; benign temporary trees and all owned services are cleaned, inputs and source identities retained.
- [x] 3.3 Update source docs/changelog and the owning decision after smoke; strict fixture, central doc-gate and decisions-verify pass. Complete three-seat independent review, approved local CI on frozen paired heads, merge/closure and fixture archive.

## 4. Risk-pack map

- Selected — Public API: 1.2/2.2/3.2 preserve both response modes, headers and current protocol behavior.
- Not selected — Config/project setup: no config/dependency changes.
- Selected — File IO/path safety/overwrite: 1.2/2.1/2.2 prove confinement, original identity and no source mutation.
- Not selected — Schema/columns/units/field names: no persisted schema change; metadata headers covered by public API.
- Selected — Auth/permissions/secrets: 2.2/3.1 preserve auth and deny external/sibling canaries, with no real secret reads.
- Selected — Concurrency/shared state/ordering: 1.2/2.2/2.3 cover validation/open, post-open replacements and cancellation/read ownership.
- Selected — Resource limits/large input/discovery: 2.3/3.2 cover bounded chunks and descriptor lifetime; no new capacity or discovery policy.
- Selected — Legacy compatibility/examples: 2.2/3.1 preserve reader callers and ordinary in-root behavior, including existing headers/errors.
- Selected — Error handling/rollback/partial outputs: 2.3 distinguishes pre-header denial from post-header stream abort and proves cleanup.
- Selected — Release/packaging/dependency compatibility: 3.1 verifies the new response seam is present in explicit server COPY inputs and the isolated app imports; pinned dependencies unchanged and image/LAN certification excluded.
- Selected — Documentation/migration notes: 3.3 records ownership/limits in the existing decision and canonical capability.
