# Spec Delta

## Purpose

A repeatable evaluation of video quality with the production model on an isolated stack on a shared host. Acceptance is judged blind by the user.

## ADDED Requirements

### Requirement: The evaluation stack is isolated on the shared host

The evaluation stack SHALL run on 210.77.77.27 as one compose project named `ocu-eval`, from the release images under test. It SHALL NOT modify the code in any of them.

The stack SHALL:
- bind every published port to 127.0.0.1;
- run sandboxes with networking disabled (`ENABLE_NETWORK=false`), so they publish no port and reach no address;
- keep the orchestrator's data directory, which holds per-chat outputs, under `/home/nwm/ocu-eval/`;
- omit DocumentServer and retention-guard;
- leave the host firewall, host networks and Docker daemon configuration unchanged.

Packages, run outputs and collected MP4 files SHALL live under `/home/nwm/ocu-eval/`. Chat workspaces are Docker volumes on Docker's root filesystem.

Before loading images and before every run, the tooling SHALL refuse to proceed when Docker's root filesystem has less than 15 GB free.

Cleanup SHALL remove only:
- the images this project loaded;
- the compose containers and networks;
- the sandbox containers, `chat-<id>-workspace` volumes and orchestrator data directories of the chat ids recorded in this evaluation's run manifests.

It SHALL NOT prune.

The model key SHALL be read from a 0600 file by variable name. It SHALL NOT appear in logs, transcripts, outputs or manifests.

#### Scenario: Other projects are untouched

- **WHEN** the stack is started, used and cleaned up
- **THEN** the lists of containers, images, networks and volumes that the project did not create are identical before and after
- **AND** no port of the project listens on a non-loopback address

#### Scenario: Sandbox stays offline

- **WHEN** a sandbox in the evaluation stack is inspected
- **THEN** OCU's own disabled-network predicate holds for it (`Config.NetworkDisabled` is true, or `HostConfig.NetworkMode` is `none`), and it publishes no port
- **AND** a connection attempt from inside the sandbox to an external address fails

#### Scenario: Low disk

- **WHEN** Docker's root filesystem has 10 GB free before a run
- **THEN** the run does not start and the tooling reports the free space and the 15 GB floor

#### Scenario: No key leak

- **WHEN** a search runs over every file under `/home/nwm/ocu-eval/` and every container log of the project, by a method that never prints the key
- **THEN** the search finds no occurrence of the key value

### Requirement: The evaluation uses the production model through WebUI

The evaluation driver SHALL send each request through WebUI's chat API, with:
- the chat model `qwen3.8-27b`;
- the video switch and image generation on;
- image generation configured field by field as in production, with `doubao-seedream-5-0-flash-260915`;
- speech from `mimo-v2.5-tts` through an evaluation-only adapter.

The adapter SHALL accept OCU's speech request (`model`, `input`, `response_format` of `mp3` or `wav`, and optional `voice` and `instructions`). It SHALL return audio in the requested format, with the content type OCU expects. When the upstream call fails, times out or returns non-audio, it SHALL return HTTP 502 with an error body that holds no key.

Both runs SHALL use the same WebUI image digest and the same model, image and speech settings. Only the OCU images differ.

Each run SHALL have a 60-minute limit. The driver SHALL collect the MP4 and the transcript, and record a run manifest:
- release identities and the WebUI image digest;
- model names;
- request id and repetition;
- chat id;
- outcome: succeeded, or failed with a class of `infra` (model API, adapter, image API), `kit` or `model`;
- check outcome;
- counts of tool calls, image calls and speech calls;
- elapsed time.

An `infra` failure MAY be rerun at most twice. Every attempt is recorded.

#### Scenario: One request end to end

- **WHEN** the driver runs one explainer request
- **THEN** the run directory holds the transcript, the run manifest and the MP4, or a recorded failure with its class

#### Scenario: Adapter upstream failure

- **WHEN** dmxapi returns an error for a speech call
- **THEN** `generate_speech` returns an error text to the model
- **AND** the adapter's response and logs contain no key

### Requirement: Baseline and after runs with blind acceptance

The request set SHALL be committed before the baseline run starts. It holds five science-explainer requests run twice each, plus one course, one promo and one report request.

The baseline SHALL run on release `01b7ef7a64a5` with WebUI `6b95a4995e91`, the production release, before any OCU slice of this change is released. Its package SHALL be kept under `/home/nwm/ocu-eval/` until acceptance ends. The after run SHALL use the release candidate with this change.

Before the after run, the thresholds SHALL be recorded in the change and confirmed by the user:
- the render success rate, set from the baseline;
- the kit check pass rate, set a priori. It is the share of after-run explainer runs in which a check passed and the final render succeeded.

The user SHALL judge the ten science-explainer pairs blind. A pair is the same request and repetition. Order within and across pairs is randomized, and the mapping is kept in a sealed key that is opened only after all votes are recorded. Every pair needs a choice, so there are no ties.

A pair missing the new video counts as a loss for the new version. A pair missing only the baseline video counts as a win. A pair missing both is rerun once and is void if both are still missing.

The change SHALL be accepted only when:
- the new version wins at least eight of the ten pairs, with void pairs counted as losses;
- both thresholds are met.

#### Scenario: Blind pairs

- **WHEN** the judging page is generated
- **THEN** each pair shows two videos labelled only A and B
- **AND** the mapping to before and after is stored separately and revealed only after all ten votes are recorded

#### Scenario: Thresholds precede the after run

- **WHEN** the after run starts
- **THEN** the change already records both thresholds and the user's confirmation

#### Scenario: Acceptance fails

- **WHEN** the new version wins fewer than eight pairs, or either threshold is not met
- **THEN** the change is not accepted, the votes and the result are recorded in the change, and the skill routing is not merged
