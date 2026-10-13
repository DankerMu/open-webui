# ocu-stub Specification

## Purpose

Deterministic OCU HTTP stub and fail-loud proxy-dev launcher so later proxy smoke can run without a real OCU.

## Requirements

### Requirement: Stub serves fixture states and files

`scripts/ocu-stub.py` SHALL serve describe/launch/outputs/files/preview/heartbeat/static fixtures. Launch SHALL flip `stopped` to `running` and SHALL 409 `never_created`. Received `Authorization` and `X-Requested-With` SHALL be echoed as `X-Echo-*`. The stub SHALL NOT start containers. Describe `views` follow the parent sandbox-lifecycle rule: `["files"]`, plus `browser` and `terminal` when running.

#### Scenario: Launch flips stopped

- **WHEN** describe of the stopped fixture is `stopped` and launch is POSTed
- **THEN** the next describe is `running`

#### Scenario: Never created stays 409

- **WHEN** launch is POSTed for the never_created fixture
- **THEN** the response is 409 with `reason: never_created`

### Requirement: Launcher names missing prerequisites

`scripts/proxy-dev.sh` SHALL exit non-zero and name the missing checkout, `deploy/proxy/` config, or proxy binary. It SHALL NOT skip.

#### Scenario: Missing checkout

- **WHEN** `OCU_CHECKOUT` points at a path with no `deploy/proxy/`
- **THEN** the script exits non-zero and the message contains that path

### Requirement: Upload allocation preserves synthetic backend errors

The stub SHALL reserve the exact names `backend403` and `backend409` during upload allocation. Accepted bytes SHALL remain accessible under the returned deduplicated name and appear in that chat's outputs listing, while the bare synthetic paths retain their original errors. Existing HTML error fixture behavior SHALL remain unchanged.

#### Scenario: Synthetic errors survive same-chat uploads

- **WHEN** valid multipart uploads named `backend403` and `backend409` are submitted in a chat with no previous uploads under those names
- **THEN** the returned names are `backend403 (2)` and `backend409 (2)`
- **AND** GETs of the bare names return 403 with `backend 403` and 409 with `backend 409`
- **AND** GETs of the returned names return 200 with the exact uploaded bytes and both returned paths appear in that chat's outputs listing

#### Scenario: Existing HTML error remains reserved

- **WHEN** a valid multipart upload uses `backend-html403.html`
- **THEN** it is retrievable as `backend-html403 (2).html` without changing the bare fixture's HTML403 response

### Requirement: Upload filenames exclude HTTP control characters

The stub SHALL reject upload names containing decoded U+0000–U+001F or U+007F with its existing 400 invalid-filename response before storage. Rejection SHALL leave the chat outputs listing unchanged. Supported ordinary names SHALL retain inline and attachment disposition behavior, without raw control characters inside disposition header values.

#### Scenario: Encoded controls never enter upload state

- **WHEN** valid multipart requests use each URL-encoded control in U+0000–U+001F and U+007F, including CR, LF and NUL, in the upload name
- **THEN** each request returns 400 and the complete chat outputs listing remains unchanged
- **AND** GET of the rejected path in inline and `download=1` modes returns 404 without a disposition header or malformed/injected header lines

#### Scenario: Ordinary uploaded file preserves both disposition modes

- **WHEN** a supported ordinary filename is uploaded and retrieved with and without `download=1`
- **THEN** both GETs return 200 and the exact uploaded bytes
- **AND** each raw response has exactly one correctly framed disposition field with the basename, inline without the flag and attachment with the flag

#### Scenario: Existing traversal rejection remains unchanged

- **WHEN** a matched upload route decodes its filename to a leading slash or a path with an empty, dot or dot-dot component
- **THEN** the stub retains 400 rejection without storing the upload

### Requirement: Upload smoke distinguishes complete and partial listings

The stub smoke SHALL compose uploads with the existing 101-entry `large` and `partial_after` fixtures. It SHALL preserve their ordering and intentional failure behavior, verifying file-byte retrieval independently of successful listing visibility.

#### Scenario: Uploaded file appears only on the successful later page

- **WHEN** a unique upload is accepted in the `large` scenario
- **THEN** the first response contains the same 100 fixture paths, no uploaded path and cursor 100
- **AND** the successful cursor-100 response contains the uploaded path exactly once after the remaining fixture path
- **AND** retrieving the uploaded file returns 200 with the exact uploaded bytes

#### Scenario: Accepted bytes remain readable after the intentional listing failure

- **WHEN** a unique upload is accepted in `partial_after`
- **THEN** the first response preserves the 100 fixture paths, excludes the uploaded path and advertises cursor 100
- **AND** cursor 100 returns 503 with `listing_incomplete`, without a successful uploaded-file listing assertion
- **AND** file retrieval after that listing failure returns 200 with the exact uploaded bytes

### Requirement: Configured Office lifecycle scenarios serve renderable versions

When a valid DOCX fixture is configured, the `office_unpublished` and `office_stale` scenarios SHALL preserve that file as their workspace version and provide a distinct renderable autosave version. Version and listing SHA-256 and size metadata SHALL describe the actual bytes. The browser evidence SHALL show recognizable read-only document content rather than an invalid-document preview error. The existing unconfigured route-only and intentionally corrupt-document behavior SHALL remain unchanged.

#### Scenario: Both configured versions contain readable document content

- **WHEN** either specialized scenario is initialized with the browser harness's valid DOCX input
- **THEN** its workspace bytes match that input and its autosave bytes are distinct valid DOCX content
- **AND** independent byte hashes and lengths match version metadata and the published listing
- **AND** identical fixture inputs produce deterministic version bytes

#### Scenario: Restore publishes the captured autosave without rewriting history

- **WHEN** the unpublished scenario restores its captured version2
- **THEN** the selected autosave bytes become the served workspace bytes and version3 is a published restore copy
- **AND** versions1 and2, their parent/source/published fields and file identity remain unchanged while workspace revision advances
- **AND** subsequent session creation succeeds

#### Scenario: Stale refusal preserves current content and permits the existing retry

- **WHEN** the stale scenario receives its first session-create request
- **THEN** it returns409 with unpublished_version, retires the old session and leaves version history and current workspace bytes unchanged
- **AND** the next create succeeds with a new session identity without restoring or publishing the autosave

#### Scenario: Browser prompts retain ordering with recognizable previews

- **WHEN** the browser walks the unpublished restore and stale start-current choices
- **THEN** read-only workspace previews display recognizable configured document content before evidence capture
- **AND** the restored autosave can be rendered read-only with its distinct content
- **AND** existing prompt, request-order, history and diagnostic assertions remain satisfied without implying real DocumentServer behavior

#### Scenario: Route-only and corrupt fixtures retain their contracts

- **WHEN** no DOCX input is configured, or the intentional corrupt-document scenario is selected
- **THEN** existing synthetic scenario bytes and lifecycle behavior, or the intentional preview failure respectively, remain unchanged
