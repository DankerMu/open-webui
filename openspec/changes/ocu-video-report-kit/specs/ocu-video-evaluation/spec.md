# Spec Delta

## MODIFIED Requirements

### Requirement: The evaluation uses the production model through WebUI

The evaluation driver SHALL send each request through WebUI's chat API, with:

- the chat model `qwen3.8-27b`;
- the video switch and image generation on;
- image generation on WebUI's `openai` engine, as in production (where it serves vllm-omni), with production's image settings copied field by field except three: the base URL points at the evaluation-only adapter, the key is the adapter's token (the adapter holds the dmxapi key), and the model is `doubao-seedream-5-0-flash-260915`;
- speech from `mimo-v2.5-tts` through the same adapter.

The adapter SHALL accept OCU's speech request (`model`, `input`, `response_format` of `mp3` or `wav`, and optional `voice` and `instructions`). It SHALL return audio in the requested format, with the content type OCU expects. When the upstream call fails, times out or returns non-audio, it SHALL return HTTP 502 with an error body that holds no key.

The adapter SHALL also accept WebUI's image request: `POST /images/generations` with `model`, `prompt`, `n`, `size`, `response_format` and any configured extra parameters other than the fields the adapter sets (`input`, `image`, `watermark`), which it SHALL refuse with HTTP 400. It SHALL forward it to dmxapi `POST /v1/responses`, the only route that serves `doubao-seedream-5-0-flash-260915`, with these changes:

- `prompt` is sent as `input`;
- `n` is dropped, and a request with `n` other than 1 fails with HTTP 400;
- `watermark` is false.

It SHALL return the OpenAI images response shape with `data[].b64_json`, never `data[].url`: WebUI fetches a returned URL with its image `Authorization` header, which would send the adapter token to the image host. Upstream failures SHALL return HTTP 502 with no key.

The adapter SHALL also accept WebUI's image-edit request: multipart `POST /images/edits` with `model`, `prompt`, `size`, `response_format`, optional `n` and `background`, and one or more files under `image` or `image[]`. It SHALL forward the request to the same `/v1/responses` route, sending the files as `data:` URLs in `image` and applying the same `prompt`, `n` and `watermark` rules, and SHALL return the same response shape.

Production's image settings (user, 2026-11-16) are default size 2048×2048, an aspect-ratio table with at least 16:9, 9:16, 1:1, 4:3 and 3:4, and image editing on. The user left the exact pixel sizes open, so the evaluation uses this fixed table, every entry within Seedream's 921600–4624220 pixels: 1:1 2048×2048, 16:9 2560×1440, 9:16 1440×2560, 4:3 2304×1728, 3:4 1728×2304, 3:2 2496×1664, 2:3 1664×2496. The edit engine is configured like the generation engine.

The two runs of a comparison (`baseline` and `after`, or `report-before` and `report-after`) SHALL use the same WebUI image digest and the same model, image and speech settings. Only the OCU images differ.

Each run SHALL have a 60-minute limit. The driver SHALL collect the MP4, any `<name>.figures.json` published beside it, and the transcript, and record a run manifest:

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

#### Scenario: Image through the adapter

- **WHEN** WebUI generates an image in the evaluation stack
- **THEN** the adapter's upstream request goes to `/v1/responses` with `input` and without `n`
- **AND** WebUI stores the returned image without any change to its image-generation code

#### Scenario: Image edit through the adapter

- **WHEN** WebUI edits an image in the evaluation stack
- **THEN** the adapter's upstream request goes to `/v1/responses` with the image as a `data:` URL, `input`, and no `n`
- **AND** WebUI stores the edited image

#### Scenario: Adapter upstream failure

- **WHEN** dmxapi returns an error for a speech call
- **THEN** `generate_speech` returns an error text to the model
- **AND** the adapter's response and logs contain no key

### Requirement: Baseline and after runs with blind acceptance

This requirement governs the explainer comparison, the phases `baseline` and `after`. The request set for those phases SHALL be committed before the baseline run starts. It holds five science-explainer requests run twice each, plus one course, one promo and one report request. Entries added later for the report comparison carry `set` and are not part of it. `report-sales-q3` keeps its baseline and after runs; it changed only its `repetitions` and gained `set` after the explainer acceptance closed.

The baseline SHALL run on release `01b7ef7a64a5` with WebUI `6b95a4995e91`, the production release, before any OCU slice of this change is released. A package rebuilt from a later commit counts as that release when its image references all equal production's and the tool, filter, init and compose sources are unchanged from `01b7ef7a64a5`. Its package SHALL be kept under `/home/nwm/ocu-eval/` until acceptance ends. The after run SHALL use the release candidate with this change.

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

## ADDED Requirements

### Requirement: Report requests may carry attachments

`requests.json` SHALL hold these report entries, each with kind `report`:

- five judged requests, each with `set: "report"` and `repetitions: 2`:
  - the existing `report-sales-q3`, whose id, kind and prompt stay unchanged;
  - four new `report-*` requests;
- one `report-unclear` request with `set: "report-smoke"`, whose material lacks the period and the figures' units.

Two of the new judged requests SHALL carry an attachment, one `.csv` and one `.xlsx`. Every entry without `set` SHALL stay byte-identical to OCU `e3be359`.

The user SHALL confirm the text of the five new requests and the attachments before the first `report-before` run.

Every judged report request SHALL give enough material that the video needs no question to the user: the department or subject, the period, and every figure with its unit.

A request MAY list `attachments`, as file names under `deploy/eval/fixtures/`. The driver SHALL do the following:

- check every attachment when it builds the run plan, and refuse the whole run before any chat when one is missing or unreadable;
- upload each attachment through WebUI's files API as the evaluation admin;
- send the returned file ids with the chat message, as WebUI's own client does;
- record each attachment's name and sha256 in the run manifest.

#### Scenario: Attachment reaches the sandbox

- **WHEN** the driver runs a request whose attachment is `q3-regions.xlsx`
- **THEN** the chat message carries that file, and the file is present under `/mnt/user-data/files/` when the model's first tool call runs its command
- **AND** the run manifest records the attachment's sha256

#### Scenario: Missing attachment

- **WHEN** a request names an attachment that is not in `deploy/eval/fixtures/`
- **THEN** the driver refuses before creating any chat, naming the file

#### Scenario: Existing entries untouched

- **WHEN** the new requests are added
- **THEN** every entry without `set` is byte-identical to `e3be359`, and `report-sales-q3` differs only by `repetitions` and `set`

### Requirement: Report runs are kept apart from explainer runs

The driver SHALL accept the phases `report-before` and `report-after`, writing under `runs/report-before/` and `runs/report-after/`. A report phase SHALL never write under another phase's directory.

Request selection:

- With no `--request`, a report phase SHALL run the entries with `set: "report"`.
- With no `--request`, `baseline`, `after` and `smoke` SHALL run the entries without `set`.
- A named entry with `set` SHALL be refused in `baseline`, `after` and `smoke`.
- A named entry without `set` SHALL be refused in a report phase.
- `report-unclear` SHALL run only when named, in a report phase.

The `report-before` run SHALL use the stack as deployed before any OCU slice of this change is released: package `ocu-e3be359-webui-71b4f18` (OCU `e3be359`, WebUI `d24c866` with the local branding). That package and its WebUI image SHALL stay on the host until acceptance ends.

The `report-after` run SHALL use a release candidate built from OCU `main` plus the held report-routing branch, with both commits recorded, and the same WebUI image digest. Every judged `report-after` attempt whose transcript shows no `--preset report` project SHALL be recorded as a `kit` failure.

The driver SHALL record `asked_user` in every report manifest. It is true when no MP4 was published and the final assistant message contains `？` or `?`.

#### Scenario: Phase isolation

- **WHEN** `run.sh --phase report-before` runs with no `--request`
- **THEN** every `set: "report"` request and repetition has at least one attempt directory under `runs/report-before/`, and nothing under `runs/baseline/`, `runs/after/` or `runs/smoke/` changes

#### Scenario: Explainer request in a report phase

- **WHEN** `run.sh --phase report-before --request explainer-sky-blue` is run
- **THEN** the driver refuses, stating that report phases run only `set` entries

#### Scenario: Report request in an explainer phase

- **WHEN** `run.sh --phase after --request report-sales-q3` is run
- **THEN** the driver refuses, stating that `set` entries run only in report phases

### Requirement: Report acceptance by blind pairs and a material check

Before the `report-after` run, the change SHALL record two thresholds, each confirmed by the user:

- the render-success threshold, set from the `report-before` run. It is the share of judged attempts that published a valid MP4.
- the check-pass threshold, set a priori. It is the share of judged `report-after` request-repetitions in which a check passed and the final render succeeded.

The user SHALL judge the ten report pairs blind, using the explainer acceptance's pairing, randomization, sealed key and missing-video rules. A void pair counts as a loss.

A judged `report-after` attempt with `asked_user` true is a `model` failure. It is counted as a missing new video and is not rerun.

A material check SHALL run on every `report-after` video, in two parts.

**Figures.** Each figure in the video's figures file SHALL equal, as number text plus unit, one of:

- a figure in the request text;
- an attachment cell's display text;
- one of the derivations listed in that figures file.

The check also treats as figures, and reviews by hand:

- Chinese-numeral quantities (such as 一半, 两成, 三倍) in narration and on-screen text;
- figures that key frames show outside the figures file.

**Statements.** Every qualitative statement SHALL be reviewed by hand and recorded as backed, unbacked or slogan. A slogan is an opening or closing line with no figure and no factual claim.

The same check SHALL be recorded for the `report-before` videos, from key frames and audio, for comparison only.

The change SHALL be accepted only when all of the following hold:

- the new version wins at least eight of ten pairs, with void pairs counted as losses;
- the material check finds zero unmatched figures and zero unbacked statements across the `report-after` videos;
- both thresholds are met.

Until then, the report routing SHALL NOT merge.

#### Scenario: One untraceable figure

- **WHEN** a `report-after` video shows 「去年同期1068万」 for a request that gives no prior-year figure, and its figures file lists no derivation giving `1068万`
- **THEN** the material check records the figure, its run and its frame, and acceptance fails

#### Scenario: Unit mismatch

- **WHEN** a figures file lists `1260亿元` for a request that says 1260万元
- **THEN** the material check reports it as unmatched

#### Scenario: Slogan is not a finding

- **WHEN** a `report-after` video closes with 「乘胜追击，再创佳绩」
- **THEN** the statement is recorded as a slogan, and it does not fail acceptance

#### Scenario: Acceptance passes

- **WHEN** the new version wins nine pairs, the material check finds nothing, and both thresholds are met
- **THEN** the votes, the material check results and the decision are recorded in the change, and the routing PR may merge

### Requirement: An incomplete-material request shows whether the model asks

`report-unclear` SHALL run once in `report-before` and once in `report-after`. It is never judged or counted toward the thresholds. Its manifest's `asked_user` and its published files SHALL be written into the change beside the acceptance results.

#### Scenario: After-change behavior recorded

- **WHEN** `report-unclear` runs in `report-after`
- **THEN** the change records whether `asked_user` was true and whether a video was produced, beside the same record from `report-before`
