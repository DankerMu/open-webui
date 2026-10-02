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
- the behaviour at the 20-connection cap and whether current usage can be queried by the broker;
- the measured delay between the last editor closing and the status-2 callback;
- the origin of the download address in status-2 callbacks and in status-6 callbacks: the browser-facing DocumentServer origin or the server-to-server one;
- the editor event that signals the connection cap to the page hosting the editor;
- the memory and swap actually present on the acceptance machine;
- whether the image's shutdown-preparation command saves and closes every open document, the command's name, and whether a restart clears the shutdown-preparation mode;
- whether the editor works when the proxy withholds the WebUI session cookie from DocumentServer;
- whether a `forcesave` command echoes its `userdata` in the callback;
- whether the editor's own save command produces a callback with user-initiated force save off;
- the minimal iframe sandbox token list and permission-policy feature list the editor needs;
- the fonts loaded, each with its source and its stated licence holder.

The acceptance machine being below the official minimum SHALL be recorded as a deviation that states both figures and that the machine is an acceptance environment, not a capacity proof. The memory and swap present SHALL be recorded as found; whether swap is configured is the operator's choice, and no amount of swap SHALL be a condition of the verdict or of the acceptance run. Fonts supplied by the deploying organisation SHALL be recorded with the licence holder as stated by that organisation; the record and the repository SHALL contain no font file. Substituted fonts and the substitution effects observed SHALL be noted.

Nine items are consumed by later tasks of this change. Each SHALL be present in the record as a concrete value, never "not measured", before a "go" verdict is given and before the task that consumes it starts:

- the iframe sandbox token list and the permission-policy feature list;
- how the connection cap is detected, both parts: the broker-side usage query, or the statement that none exists, and the editor event;
- the close-to-status-2 delay;
- the shutdown-preparation command: its name and whether it saves and closes every open document;
- whether a restart clears the shutdown-preparation mode;
- whether `forcesave` echoes `userdata`;
- whether the editor's own save command produces a callback with user-initiated force save off;
- the origin of the download address in status-2 and status-6 callbacks;
- whether the editor works without the WebUI session cookie.

Five of these values are assumptions the design is built on: `forcesave` echoes `userdata`; a shutdown-preparation command exists that saves and closes every open document; a restart clears the shutdown-preparation mode; the editor's own save command produces no callback; the editor works without the WebUI session cookie. The record SHALL state for each whether the observation matches the assumption.

#### Scenario: Record is complete

- **WHEN** the B1 record is reviewed
- **THEN** each of the fifteen items is present and is either filled with an observed result or marked "not measured" with a reason
- **AND** `make doc-gate` passes with the record in the tree

#### Scenario: Memory and swap are recorded, not gated

- **WHEN** the record's memory item is read on a machine with no swap configured
- **THEN** it states the memory and the swap found, including that swap is absent, and neither the verdict nor the acceptance run is refused for that reason

#### Scenario: Capacity deviation is stated

- **WHEN** the record's capacity item is read
- **THEN** it gives the official minimum with its source and the measured headroom side by side, names the shortfall as a deviation and does not claim production capacity

#### Scenario: Fonts carry source and licence holder

- **WHEN** the record's font item is read
- **THEN** every loaded font is listed with whether it comes from the release or from the operator-supplied directory and with its stated licence holder, and no font file is added to the repository

#### Scenario: Consumed values are concrete

- **WHEN** a later task reads one of the nine consumed items — the editor frame task the sandbox and permission lists, the session and host-page tasks the cap query and the editor event, the guard task the close-to-status-2 delay, the backup task the shutdown-preparation command and whether a restart clears its mode, the client and callback tasks the `userdata` echo and the download-address origin, the save task and the user notes the editor's own save command, the proxy listener task the cookie result
- **THEN** the record holds a concrete value for it, not "not measured"

### Requirement: Go or no-go gates every later Office task

The B1 result SHALL be stated as exactly one verdict, "go" or "no-go", in a decision record under `docs/decisions/` that links the B1 record with a relative link and passes `make decisions-verify` and `make doc-gate`. "go" SHALL require that the image identity is recorded, the licence terms fit, all three formats opened, were edited and were exported, every one of the nine consumed items of the B1 record holds a concrete value, and each of the five design assumptions among them was observed to hold; an item marked "not measured" among the nine, or an assumption observed not to hold, SHALL prevent "go", and a "go" recorded in either case SHALL be invalid and SHALL NOT release any later task. No B2, B3, B4 or B5 work SHALL start without a recorded "go". A "no-go" SHALL stop the Office work and return it to the plan for revision; it SHALL NOT switch to another editor automatically. B0 work SHALL NOT depend on the verdict.

#### Scenario: Work starts only after go

- **WHEN** a pull request implementing a B2–B5 task is opened
- **THEN** the decision record with verdict "go" and the B1 record it links already exist on the target branch

#### Scenario: No-go stops the work

- **WHEN** the verdict is "no-go"
- **THEN** no B2–B5 task is started, the decision record states that the work returns to the plan, and it names no replacement editor as adopted

#### Scenario: Incomplete evidence cannot be go

- **WHEN** one of the three formats could not be opened, edited or exported, or that result is marked "not measured"
- **THEN** the verdict is not "go"

#### Scenario: Go with an unmeasured consumed item is invalid

- **WHEN** the decision record states "go" while the B1 record marks one of the nine consumed items "not measured" — for example the origin of the download address, or the editor event that signals the connection cap
- **THEN** the verdict is invalid, no B2–B5 task may start on it, and the record is completed with the measured value before "go" is given again

#### Scenario: A design assumption that does not hold is no-go

- **WHEN** the B1 record shows that the editor's own save command produces a callback, that a restart does not clear the shutdown-preparation mode, that `forcesave` does not echo `userdata`, that no shutdown-preparation command saves and closes open documents, or that the editor fails without the WebUI session cookie
- **THEN** the verdict is "no-go", the decision record names the assumption that failed, and the work returns to the design

#### Scenario: Decision record is machine-checked

- **WHEN** `make decisions-verify` and `make doc-gate` run
- **THEN** both pass, and removing the B1 record makes `make doc-gate` fail on the decision record's link

### Requirement: Local real-editor verification target

`make verify-office` SHALL be a Makefile target that calls a script under `scripts/`. The script SHALL start a real DocumentServer locally from the image identity recorded by B1, run open → edit → save → reopen through the real Office broker for a deterministic DOCX, XLSX and PPTX sample, and exit 0 only when, for all three formats, the edit is present in the workspace file that the save published and in the document when it is opened again, and the content checks below pass. The script SHALL additionally reopen each saved file with a second implementation — LibreOffice in headless mode — and SHALL fail when a file does not open there; a round trip checked only inside DocumentServer SHALL NOT be reported as verified. Reopening with desktop Office MAY be added as evidence but SHALL NOT replace that step.

The samples SHALL be deterministic — the same bytes on every run — and SHALL carry what the acceptance rows B-T01, B-T02 and B-T03 judge:

| Sample | Content                                                             | Checked on the saved file, besides the edit being present                                                                                                            |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCX   | headings, a table, an image and Chinese text                        | the headings, the table, the image and the Chinese text are intact                                                                                                   |
| XLSX   | two sheets, formulas including a cross-sheet reference, and a chart | both sheets are present; every formula cell of the sample still holds a formula, not a literal value; the recalculated values match the values the edit must produce |
| PPTX   | several slides with shapes and an image                             | the slide count and slide order, the shapes and the image are intact                                                                                                 |

A failed content check SHALL fail the target naming the format and the check. The script SHALL also write a fidelity record under `.run/` and name it in its output: for each format the page count before and after the round trip and the fonts that were substituted. Differences in the fidelity record SHALL be listed and SHALL NOT be judged: they SHALL NOT change the exit code, and the record SHALL NOT call them a pass or a failure. When Docker, the image, the second implementation or another prerequisite is missing the script SHALL exit non-zero naming it; it SHALL NOT skip and SHALL NOT report success. It SHALL stop every container and process it started on success, on failure and on interruption, and SHALL leave unrelated services and data untouched. The target SHALL NOT be part of PR CI; its output SHALL be pasted into the Runtime evidence of pull requests that rely on it. `AGENTS.md` SHALL gain a Verification Matrix row for the target in the same change that adds the target, not before.

#### Scenario: Three-format round trip (B-T01, B-T02, B-T03)

- **WHEN** `make verify-office` runs with Docker, the pinned image and LibreOffice available
- **THEN** it edits and saves the DOCX, XLSX and PPTX samples through the broker, finds each edit in the published workspace file and on reopening, passes the content checks of all three formats and exits 0

#### Scenario: DOCX round trip (B-T01)

- **WHEN** the DOCX sample with headings, a table, an image and Chinese text is edited, saved and reopened
- **THEN** the edit is present, and the headings, the table, the image and the Chinese text are intact in the published file
- **AND** the fidelity record gives the page count before and after and the substituted fonts

#### Scenario: XLSX round trip keeps formulas (B-T02)

- **WHEN** a cell that formulas depend on is changed in the XLSX sample with two sheets, a cross-sheet reference and a chart, and the file is saved and reopened
- **THEN** both sheets are present, every formula cell of the sample still holds a formula, and the recalculated values, including the cross-sheet one, match the values the edit must produce

#### Scenario: Flattened formulas fail the target (B-T02)

- **WHEN** the saved XLSX holds literal values in cells that were formulas in the sample
- **THEN** the command exits non-zero naming the XLSX format and the formula check, even when the displayed values are correct and LibreOffice opens the file

#### Scenario: PPTX round trip (B-T03)

- **WHEN** the PPTX sample with several slides, shapes and an image is edited, saved and reopened
- **THEN** the edit is present, and the slide count, the slide order, the shapes and the image are intact in the published file

#### Scenario: Fidelity differences are recorded, not judged (B-T01, B-T03)

- **WHEN** the page count after the round trip differs from the count before, or a font was substituted
- **THEN** the fidelity record lists the difference with both figures or the font names, calls it neither a pass nor a failure, and the exit code is unchanged by it

#### Scenario: One format fails

- **WHEN** the edit is missing from the published file of any one format, or one of its content checks fails
- **THEN** the command exits non-zero naming the format, even when the other two passed

#### Scenario: Missing Docker or image

- **WHEN** Docker is not running or the pinned DocumentServer image is not present
- **THEN** the command exits non-zero naming the missing prerequisite and prints no skip or pass line

#### Scenario: Missing LibreOffice fails the target

- **WHEN** LibreOffice is not installed
- **THEN** the command exits non-zero naming LibreOffice and prints no skip or pass line, even when all three round trips inside DocumentServer succeeded

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

The acceptance matrix B-T01 through B-T16 of the plan SHALL be executed on the acceptance machine of design D20 (4 vCPU, 7.4 GiB RAM, 33 GiB disk, at most one sandbox running during the run) with Office editing enabled. Whether swap is configured there is the operator's choice; it SHALL NOT be a condition of the run. The pass criterion of each row SHALL be the one in the plan's matrix; this specification does not restate the rows. Evidence SHALL be retained for every executed row, and one result table SHALL record each of the sixteen rows as passed, failed or untested together with where its evidence is kept. A row that was not executed, or only partly executed, SHALL be recorded as untested with what was left out; it SHALL NOT be implied to pass. A failed row SHALL be recorded as failed. The run SHALL NOT be presented as a capacity proof. The change that closes this work SHALL synchronise `AGENTS.md` (Verification Matrix, Critical Paths) and `CONTEXT.md` with what was delivered in that same change.

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
