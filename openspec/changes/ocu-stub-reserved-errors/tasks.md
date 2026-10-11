# Tasks

## 1. Contract and semantic regression

- [x] 1.1 Independent expanded-fixture review and strict OpenSpec validation pass before implementation.
- [x] 1.2 Add mixed upload/error HTTP regression to existing stub smoke; parent captures semantic RED on the unchanged stub, identifying returned-name failure rather than setup error.

## 2. Repair and verification

- [x] 2.1 Reserve both exact names in the shared occupied-name source; unchanged smoke passes with bare error status/body, deduplicated bytes/listing and HTML403 preservation assertions.
- [x] 2.2 Run applicable scoped static/harness checks; preserve existing Office, concurrent upload, chat-isolation and partial-page behavior without edits to unrelated fixtures.
- [ ] 2.3 After runtime smoke, update owning documentation; strict fixture/doc-gate/decisions-verify pass. Freeze evidence, complete three-seat review and approved local CI, merge and archive.

## 3. Risk-pack map

- Selected — Public API/CLI/script entry:1.2/2.1 real HTTP through `make smoke-stub`.
- Not selected — Config/project setup:no configuration or dependency change.
- Selected — File IO/path safety/overwrite:1.2/2.1 reserve fixture names without making accepted bytes inaccessible; no physical file write change.
- Not selected — Schema/columns/units/field names:existing response shape unchanged.
- Not selected — Auth/permissions/secrets:synthetic status names are fixtures, not an auth change; generated local credentials only.
- Selected — Concurrency/shared state/ordering:2.1/2.2 keep shared occupied source and lock, existing concurrent/Office smoke.
- Not selected — Resource limits/large input/discovery:no new loops or bounds.
- Selected — Legacy compatibility/examples:2.1/2.2 HTML403 and partial-page controls unchanged.
- Selected — Error handling/rollback/partial outputs:1.2/2.1 both bare error bodies/statuses survive accepted uploads.
- Not selected — Release/packaging/dependency compatibility:no packaging changes; no image/LAN claim.
- Selected — Documentation/migration notes:2.3 describes reserved fixture behavior at its existing owner.
