# Spec Delta

## Purpose

The evidence that gates and closes Office editing: the B1 release verification record with its go/no-go decision, the local real-editor target `make verify-office`, the limits of PR CI evidence, and the B-T01–B-T16 acceptance run. Source: Plan 2 § 编辑器选型与机器, § 实施顺序 and § 验收矩阵; design D4, D20, D21.

## ADDED Requirements

### Requirement: B1 release verification record

B1 SHALL produce a dated Markdown record under `docs/` in this repository, written from a run of the pinned, unmodified ONLYOFFICE Docs Community image in isolation. The record SHALL contain every item below, each either filled with the observed result or explicitly marked "not measured" with the reason:

- image identity (reference and digest) of the verified image;
- the licence terms read and whether they fit the deployment;
- DocumentServer's official minimum requirements with their source, next to the measured headroom on the acceptance machine;
- the result of opening, editing and exporting deterministic DOCX, XLSX and PPTX samples;
- the behaviour at the 20-connection cap and whether current usage can be queried;
- the measured delay between the last editor closing and the status-2 callback;
- whether a `forcesave` command echoes its `userdata` in the callback;
- that the editor's own save command produces no callback with user-initiated force save off;
- whether the image's shutdown-preparation command saves and closes every open document, and the command's name;
- whether the editor works when the proxy withholds the WebUI session cookie from DocumentServer;
- the minimal iframe sandbox token list and permission-policy feature list the editor needs;
- the fonts loaded, each with its source and its stated licence holder.

The acceptance machine being below the official minimum SHALL be recorded as a deviation that states both figures and that the machine is an acceptance environment, not a capacity proof. Fonts supplied by the deploying organisation SHALL be recorded with the licence holder as stated by that organisation; the record and the repository SHALL contain no font file. Substituted fonts and the substitution effects observed SHALL be noted. A value that another requirement of this change takes from "the B1 verification record" — the iframe sandbox and permission lists, how the connection cap is detected, the close-to-status-2 delay, the shutdown-preparation command — SHALL be present in the record as a concrete value before the task that consumes it starts.

#### Scenario: Record is complete

- **WHEN** the B1 record is reviewed
- **THEN** each of the twelve items is present and is either filled with an observed result or marked "not measured" with a reason
- **AND** `make doc-gate` passes with the record in the tree

#### Scenario: Capacity deviation is stated

- **WHEN** the record's capacity item is read
- **THEN** it gives the official minimum with its source and the measured headroom side by side, names the shortfall as a deviation and does not claim production capacity

#### Scenario: Fonts carry source and licence holder

- **WHEN** the record's font item is read
- **THEN** every loaded font is listed with whether it comes from the release or from the operator-supplied directory and with its stated licence holder, and no font file is added to the repository

#### Scenario: Consumed values are concrete

- **WHEN** the editor frame task reads the sandbox token list, or the session task reads the cap-detection method
- **THEN** the record holds a concrete value for it, not "not measured"

### Requirement: Go or no-go gates every later Office task

The B1 result SHALL be stated as exactly one verdict, "go" or "no-go", in a decision record under `docs/decisions/` that links the B1 record with a relative link and passes `make decisions-verify` and `make doc-gate`. "go" SHALL require that the image identity is recorded, the licence terms fit, and all three formats opened, were edited and were exported; an item marked "not measured" among these SHALL prevent "go". No B2, B3, B4 or B5 work SHALL start without a recorded "go". A "no-go" SHALL stop the Office work and return it to the plan for revision; it SHALL NOT switch to another editor automatically. B0 work SHALL NOT depend on the verdict.

#### Scenario: Work starts only after go

- **WHEN** a pull request implementing a B2–B5 task is opened
- **THEN** the decision record with verdict "go" and the B1 record it links already exist on the target branch

#### Scenario: No-go stops the work

- **WHEN** the verdict is "no-go"
- **THEN** no B2–B5 task is started, the decision record states that the work returns to the plan, and it names no replacement editor as adopted

#### Scenario: Incomplete evidence cannot be go

- **WHEN** one of the three formats could not be opened, edited or exported, or that result is marked "not measured"
- **THEN** the verdict is not "go"

#### Scenario: Decision record is machine-checked

- **WHEN** `make decisions-verify` and `make doc-gate` run
- **THEN** both pass, and removing the B1 record makes `make doc-gate` fail on the decision record's link

### Requirement: Local real-editor verification target

`make verify-office` SHALL be a Makefile target that calls a script under `scripts/`. The script SHALL start a real DocumentServer locally from the image identity recorded by B1, run open → edit → save → reopen through the real Office broker for a deterministic DOCX, XLSX and PPTX sample, and exit 0 only when, for all three formats, the edit is present in the workspace file that the save published and in the document when it is opened again. The script SHALL additionally reopen each saved file with a second implementation — LibreOffice in headless mode — and SHALL fail when a file does not open there; a round trip checked only inside DocumentServer SHALL NOT be reported as verified. Reopening with desktop Office MAY be added as evidence but SHALL NOT replace that step. When Docker, the image, the second implementation or another prerequisite is missing the script SHALL exit non-zero naming it; it SHALL NOT skip and SHALL NOT report success. It SHALL stop every container and process it started on success, on failure and on interruption, and SHALL leave unrelated services and data untouched. The target SHALL NOT be part of PR CI; its output SHALL be pasted into the Runtime evidence of pull requests that rely on it. `AGENTS.md` SHALL gain a Verification Matrix row for the target in the same change that adds the target, not before.

#### Scenario: Three-format round trip (B-T01, B-T02, B-T03)

- **WHEN** `make verify-office` runs with Docker and the pinned image available
- **THEN** it edits and saves the DOCX, XLSX and PPTX samples through the broker, finds each edit in the published workspace file and on reopening, and exits 0

#### Scenario: One format fails

- **WHEN** the edit is missing from the published file of any one format
- **THEN** the command exits non-zero naming the format, even when the other two passed

#### Scenario: Missing Docker, image or second implementation

- **WHEN** Docker is not running, the pinned DocumentServer image is not present or LibreOffice is not installed
- **THEN** the command exits non-zero naming the missing prerequisite and prints no skip or pass line

#### Scenario: Cleanup of owned services

- **WHEN** the run ends by success, failure or interruption
- **THEN** no container or process started by the script remains, and containers that existed before the run are unchanged

#### Scenario: Second implementation reopens the files

- **WHEN** the three saved files are reopened with LibreOffice in headless mode
- **THEN** the run passes only when all three open, and its output states the result per format
- **AND** a saved file that LibreOffice cannot open makes the command exit non-zero naming the format

#### Scenario: Target and matrix row land together

- **WHEN** the change adding `make verify-office` is reviewed
- **THEN** the Makefile target, its script and the `AGENTS.md` Verification Matrix row are in the same change, `make doc-gate` passes, and no PR CI job invokes the target

### Requirement: PR CI evidence is fixture-level

PR CI evidence for Office editing SHALL consist of broker tests against recorded DocumentServer callback fixtures and a fake Docker client, proxy renderer tests, and frontend state tests (Vitest component tests and Playwright against the deterministic stub). PR CI SHALL NOT start a DocumentServer. A result obtained only from a mock, a fixture or the stub SHALL NOT be reported as proof that a save succeeds: a claim that saving works with the real editor SHALL cite fresh `make verify-office` output or acceptance-run evidence, and a pull request without such evidence SHALL state that the real-editor path is untested.

#### Scenario: CI stays fixture-level

- **WHEN** PR CI runs on an Office change
- **THEN** the callback-protocol fixture tests and the frontend state tests run, and no job pulls or starts a DocumentServer image

#### Scenario: Mock alone is not proof of a save

- **WHEN** a pull request changes the save path, the editor host page or the editor frame and reports only fixture or stub results
- **THEN** its Runtime evidence either includes `make verify-office` output from the current branch or states that the real save was not verified

### Requirement: Acceptance run on the acceptance machine

The acceptance matrix B-T01 through B-T16 of the plan SHALL be executed on the acceptance machine of design D20 (4 vCPU, 7.4 GiB RAM, 33 GiB disk, 4 GB swap, at most one sandbox running during the run) with Office editing enabled. Evidence SHALL be retained for every executed row, and one result table SHALL record each of the sixteen rows as passed, failed or untested together with where its evidence is kept. A row that was not executed, or only partly executed, SHALL be recorded as untested with what was left out; it SHALL NOT be implied to pass. A failed row SHALL be recorded as failed. The run SHALL NOT be presented as a capacity proof. The change that closes this work SHALL synchronise `AGENTS.md` (Verification Matrix, Critical Paths) and `CONTEXT.md` with what was delivered in that same change.

#### Scenario: Every row has a recorded result (B-T01–B-T16)

- **WHEN** the acceptance run is reported
- **THEN** the result table has sixteen rows, B-T01 to B-T16, each marked passed, failed or untested with an evidence location for every executed row

#### Scenario: Untested is stated as untested

- **WHEN** a row or a part of a row, such as a second browser in B-T15, was not executed
- **THEN** the table marks it untested and names the missing part, and no summary counts it as passed

#### Scenario: Failure is not reported as success

- **WHEN** a row's pass criterion is not met
- **THEN** the row is recorded as failed with its evidence, and the run is not summarised as fully passed

#### Scenario: Documents are synchronised at closure

- **WHEN** the closing change is reviewed
- **THEN** `AGENTS.md` and `CONTEXT.md` describe the delivered Office surfaces and checks in that same change, and `make doc-gate` and `make decisions-verify` pass
