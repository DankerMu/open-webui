## ADDED Requirements

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
