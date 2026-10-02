# Spec Delta

## ADDED Requirements

### Requirement: Office gateway rows are judged

`make smoke-proxy` SHALL exercise each of the seven Office rows through the gateway against real WebUI auth and the stub's Office fixtures: `POST /ocu/api/office/{chat}/documents/{file}/sessions`, `GET /ocu/api/office/{chat}/sessions/{session}`, `POST /ocu/api/office/{chat}/sessions/{session}/save`, `POST /ocu/api/office/{chat}/sessions/{session}/close`, `POST /ocu/api/office/{chat}/sessions/{session}/resolve`, `GET /ocu/api/office/{chat}/documents/{file}/versions` and `POST /ocu/api/office/{chat}/documents/{file}/restore`. For every row the judge SHALL assert owner success with the prefix stripped, the server-derived identity and the internal credential observed at the stub; anonymous 401; and valid-session non-owner 404. For each of the five POST rows it SHALL additionally assert 403 for `Origin: null` and for a missing `X-Requested-With` header. Every denial SHALL be proven to cause no arrival at the stub. Office-shaped requests that match no row — another method on a listed path, or a path with an extra or missing segment — SHALL return 404 without arrival. Office responses SHALL be subject to the existing credential-containment assertions.

#### Scenario: Owner reaches every Office row

- **WHEN** the owner session requests each of the seven rows, with valid mutation headers on the POST rows and against a fixture state that admits the call (resolve against the stub's conflict fixture)
- **THEN** each returns the stub's 2xx response unchanged, and the stub's private record shows one arrival per request at the unprefixed path with the owner's identity, the route's chat and the correct internal credential

#### Scenario: Anonymous and non-owner are denied

- **WHEN** each row is requested without a session and with a valid non-owner session
- **THEN** the responses are 401 and 404 respectively and the stub records no arrival

#### Scenario: Mutation guard on the POST rows

- **WHEN** the owner sends each of the five POST rows with `Origin: null`, and again without `X-Requested-With`
- **THEN** each response is 403 and the stub records no arrival
- **AND** the two GET rows succeed for the owner without mutation headers

#### Scenario: Unlisted Office shapes are denied by default

- **WHEN** the owner requests `GET` on the save path, `POST` on the versions path, or an Office path with an additional segment
- **THEN** each response is 404 and the stub records no arrival

### Requirement: Control-plane and removed routes are unreachable through the gateway

The smoke SHALL prove that the DocumentServer-facing control-plane routes are not reachable through the gateway: `GET /ocu/office/source/{ticket}` and `POST /ocu/office/callback/{chat}/{session}`, requested by the owner with valid mutation headers, SHALL return 404 and cause no arrival at the stub. It SHALL also prove that the removed upload read rows are gone: `GET /ocu/api/uploads/{chat}/manifest` and `GET /ocu/api/uploads/{chat}/list` SHALL return 404 for the owner without arrival, while `POST /ocu/api/uploads/{chat}/{path}` still reaches the stub with byte fidelity and the uploaded name then appears in the proxied outputs listing.

#### Scenario: Control-plane routes are not proxied

- **WHEN** the owner requests `/ocu/office/source/any-ticket` and POSTs to `/ocu/office/callback/{chat}/any-session`
- **THEN** both responses are 404 and the stub records no arrival for either

#### Scenario: Removed upload read rows

- **WHEN** the owner requests `GET /ocu/api/uploads/{chat}/manifest` and `GET /ocu/api/uploads/{chat}/list`
- **THEN** both responses are 404 and the stub records no arrival

#### Scenario: Upload still forwarded

- **WHEN** the owner POSTs a file to the upload row with valid mutation headers
- **THEN** the stub records the arrival with the matching body digest and the next `GET /ocu/api/outputs/{chat}` lists the stored name

### Requirement: Smoke runs against the pinned table that carries the change

The smoke SHALL run against the OCU commit pinned in `constraints.yaml` (`ocu_checkout.sha`). The pin SHALL be bumped in the same change that makes the smoke require a different route table: once to a commit whose reviewed table lacks the two upload read rows, and once to a commit whose table carries the seven Office rows. When the pinned checkout's table does not match what the matrix asserts, the command SHALL fail naming the mismatch; it SHALL NOT pass by skipping the Office, control-plane or removed-row assertions. The Office assertions SHALL be in the explicit list of hurl files the command runs, and the command's output SHALL name every hurl file it ran, on success as well as on failure, so that a passing run shows that the Office file was among them. CI layer3 SHALL consume the same pin.

#### Scenario: Pin and matrix move together

- **WHEN** the change that adds the Office assertions is reviewed
- **THEN** the same change sets `ocu_checkout.sha` to a full SHA of an OCU commit whose route table contains the seven Office rows and no upload read row, and `make smoke-proxy` exits 0 against it

#### Scenario: A passing run names the Office file

- **WHEN** `make smoke-proxy` exits 0
- **THEN** its output lists each hurl file that ran, the Office file among them
- **AND** when the Office file is removed from the list the command's output no longer names it, and a missing listed file makes the command exit non-zero

#### Scenario: Stale pin fails instead of skipping

- **WHEN** the Office assertions run against a checkout whose table has no Office rows
- **THEN** the command exits non-zero naming the failed rows and reports no skipped assertion as passed
