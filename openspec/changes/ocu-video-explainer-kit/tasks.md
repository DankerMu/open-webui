# Tasks

## 1. Pin the workspace base image (OCU)

- [ ] 1.1 Change the root `Dockerfile` line `FROM ubuntu:24.04` to `FROM ubuntu:24.04@sha256:78d4744ead1f5b19b04d0df558ab182a5300903900755e515b2ca4d10eb2044d`, the linux/amd64 image manifest of `noble-20261024.1`. Verify on the release host:
  - `docker buildx imagetools inspect` of the pinned reference shows root layer `bec87777bc2fb2edcdf9af11df1531469e7df911309c1413082b18fcb8610278`;
  - a cached rebuild of the workspace role yields configuration digest `3d0ceae2b7d5a6af582662a8de61c6bbf4791daf383d6ba42cd1141b208844b5`.

  A no-cache rebuild is not expected to reproduce it.

- [ ] 1.2 Make `deploy/release.py` read the root recipe's `FROM` digest and record the workspace material `{"name": "base", "kind": "base-image", "requested": "ubuntu@sha256:<digest>"}`; a recipe without a digest fails the build before any image is built. Update the release-test fixture root recipes (`tests/deploy/test_offline_release.py`, now `FROM scratch`) to carry a digest. Verify with release tests:
  - a new inventory carries the material and passes `verify`;
  - an undigested root recipe fails the build naming the line, and writes no inventory;
  - an existing version-2 fixture inventory without the material still passes `verify` and import.
- [ ] 1.3 Add a static test that fails, naming the line, when the root `Dockerfile`'s `FROM` has no `@sha256:`. Verify it fails on the old line and passes on the new one. Other Dockerfiles are out of scope.

Suggested fixture level: expanded - it changes the release inventory written by `release.py` and production build inputs.
Minimal mergeable slice: atomic - the pin, its inventory record and its guard prove one invariant together, and a pin without the record leaves provenance incomplete.

## 2. Evaluation stack and baseline (OCU tooling)

- [ ] 2.1 Write the `ocu-eval` compose definition and the start script. The stack:
  - uses release images loaded from a package under `/home/nwm/ocu-eval/`, unmodified;
  - binds ports to 127.0.0.1;
  - sets `ENABLE_NETWORK=false`;
  - runs neither DocumentServer nor retention-guard;
  - reads the key from a 0600 file;
  - refuses to start below 15 GB free on Docker's root.

  Verify on 210.77.77.27:
  - `docker ps` shows only loopback ports for the project;
  - an inspected sandbox satisfies OCU's disabled-network predicate (`Config.NetworkDisabled` true or `HostConfig.NetworkMode` `none`), publishes no port, and an outbound connection attempt from inside it fails;
  - the start script, the image-load step and the driver's per-run check each refuse when the free-space check is pointed at a fake low value.

- [ ] 2.2 Write the evaluation adapter with two routes:
  - **speech:** accepts OCU's request with `mp3`/`wav`, `voice` and `instructions`, calls dmxapi `chat/completions` with `mimo-v2.5-tts`, and returns 502 without the key on upstream failure;
  - **images:** accepts WebUI's `openai`-engine generation request (JSON `/images/generations`) and edit request (multipart `/images/edits`, files as `image` or `image[]`). It forwards both to dmxapi `/v1/responses` with `prompt` as `input`, edit files as `data:` URLs in `image`, without `n` and with `watermark` false. It rejects `n` other than 1 with 400, returns the OpenAI images shape, and returns 502 without the key on upstream failure.

  Verify each route with:
  - unit tests on recorded responses: success (both audio formats with the content types `speech.py` accepts; image `b64_json` and `url`), an upstream error, a timeout and a wrong-type response;
  - one live call in the stack (`generate_speech`; one WebUI image generation and one WebUI image edit).

- [ ] 2.3 Write the driver and the cleanup script. The driver:
  - opens an SSH tunnel;
  - creates a chat with `qwen3.8-27b`, the video switch and image generation on;
  - sends one request with a 60-minute limit;
  - collects the transcript, the MP4 and a run manifest with every field the spec names.

  The stack keeps the orchestrator data directory under `/home/nwm/ocu-eval/`. Cleanup removes only project-loaded images, compose containers and networks, and the recorded chat ids' sandbox containers, volumes and data directories. Verify:
  - one explainer request end to end;
  - the container, image, network and volume lists of other projects are identical before and after cleanup;
  - a key search that never prints the key finds nothing under `/home/nwm/ocu-eval/` and in the project's container logs.

- [ ] 2.4 Configure WebUI image generation and image editing in the stack on the `openai` engine with production's settings, except base URL (the adapter), key and model (`doubao-seedream-5-0-flash-260915`). Production uses default size 2048×2048, an aspect-ratio table (16:9, 9:16, 1:1, 4:3, 3:4 and more) and editing on. The exact table is copied from production's admin page; no code changes. Verify:
  - the stored settings equal production's field by field, apart from those three;
  - every table size lies within 921600–4624220 pixels;
  - the end-to-end smoke shows speech, a generated image and an MP4 output all working with sandbox networking disabled.

  If any of them fails, stop and ask the user.

- [ ] 2.5 Commit the request set: five science-explainer requests, plus one course, one promo and one report. Verify the commit precedes the first baseline manifest.
- [ ] 2.6 Run the baseline on release `01b7ef7a64a5` with WebUI `6b95a4995e91`: each explainer twice, the others once, `infra` failures rerun at most twice. Keep that package under `/home/nwm/ocu-eval/`. Verify that 13 final-outcome manifests, one per request and repetition, plus a manifest for every rerun attempt, record that release identity, the WebUI image digest and an outcome.
- [ ] 2.7 Record the render success-rate threshold, set from the baseline, and the a-priori kit check pass-rate threshold in this change, and get the user's confirmation. Verify that the change holds both values and a link to the confirmation, dated before any after-run manifest.

Suggested fixture level: expanded - it starts services on a shared host, handles a secret, and adds a network adapter.
Minimal mergeable slice: tasks 2.1–2.3, a working isolated stack with one request end to end. The rest uses that stack.

## 3. Kit core (OCU `remotion-template`)

- [ ] 3.1 Add the test runner: `node --test` over `remotion-template/tests/*.test.mjs`, plus a new OCU CI job that runs `npm ci` in the template and then the tests. Flag the CI change in the PR. Verify that the job runs a trivial test green on the PR.
- [ ] 3.2 Vendor Onda `lib/` into `src/kit/`, with its MIT header and its NOTICE entry in the same task:
  - fix the zod 4 call (`composition.ts:18`);
  - drop `adaptive-player.tsx`, `composition-json-schema.ts` and `registry-summary.ts`.

  Verify that `npx --no-install remotion bundle` of the template succeeds and the notice-coverage test passes.

- [ ] 3.3 Add the theme token module and the Chinese text helper:
  - punctuation and character-count segmentation;
  - no closing punctuation at line start;
  - letter spacing 0 and line height ≥1.25;
  - 万/亿 formatting.

  Probe `Intl.Segmenter('zh')` in the image's headless shell and record the result. Verify with `node --test` cases on long Chinese strings, line-start punctuation, and 9999, 12345 and 123456789.

- [ ] 3.4 Define the `script.json` schema in a `.mjs` module:
  - 1920×1080 at 30 fps;
  - the hook / 3–5 chapters / summary / end-card skeleton;
  - 1–4 scenes per chapter, 1–4 sentences per scene, 1–4 blocks per sentence, blocks ≤16 characters, chapter names ≤6;
  - the candidate kinds;
  - `custom` limited to one;
  - plain image names;
  - a music id or `none`.

  Export the JSON Schema. Add the PolyForm NC notice entries (anything2explainer, video-talkcraft) in this task. Verify with `node --test` fixtures that every invalid case in the spec fails with a message naming chapter, scene, field and limit.

- [ ] 3.5 Implement `kit new <name>`, `kit voice`, `kit voice-import` and `kit image`. Verify with `node --test`:
  - `new` refuses a non-empty directory;
  - `voice` stems carry the hash of text, voice and instructions, and change when any of them changes;
  - `voice-import` places a suffixed file under its stem;
  - `image` sanitizes a name with spaces and parentheses.
- [ ] 3.6 Implement `kit timeline`: silence trim, decoded durations, the gaps (0.06 s within a sentence, 10/20/45 frames, 40 lead-in, 90-frame tail as the end card's closing part), the 15-frame transition slots inside the post-narration gaps, narration normalized to -16 LUFS, recorded hashes, and the 60–180 s window. Verify with fixture audio:
  - block frames are within one frame;
  - every transition slot lies inside its gap, and an end card without narration lasts 90 frames;
  - a missing block fails, naming it;
  - an edited block's stale hash fails;
  - a 200-second fixture fails, stating its length.
- [ ] 3.7 Implement the shared probe composition, which records text boxes, overflow, font size, rendered text, line-start characters and mask boxes as JSON. Verify that a deliberately overflowing fixture scene is reported, and a fitting one is not.
- [ ] 3.8 Implement the renderer over the validated script and timeline, with captions paged per block and the `custom` loader (`src/custom/<File>.tsx` through a generated `src/custom/index.ts`). Verify with short fixture renders:
  - three blocks give three caption pages;
  - a fixture custom scene renders;
  - a missing custom file fails, naming the scene.

Suggested fixture level: expanded - it defines new file formats (`script.json`, `timeline.json`) and a CLI.
Minimal mergeable slice: tasks 3.1–3.4, the runner, vendored lib, text helper and schema, with their tests. No command consumes them yet, so they stay green on their own.

## 4. Scene components and the gallery (OCU `remotion-template`)

- [ ] 4.1 Build the gallery generator. It renders every registered candidate in both theme candidates inside the PR's workspace image on 210.77.77.27 (image labelled `ocu-eval`), probes every sample with 3.7, writes one static page, and lets the page export the user's decisions as JSON. Verify that one placeholder component renders with its probe result and that the export downloads.
- [ ] 4.2 Port the hook, question, concept card, definition, summary and end-card scenes, each with its NOTICE entry and a declared minimum length. The first remotion-bits primitive ported carries the remotion-bits notice. The user reviews this batch in the gallery and exports decisions; the export is committed into `gallery/approvals.json`, linking it, in the same PR, and only approved components of the batch are merged. Verify that every gallery sample at maximum text length has a clean probe, and that every merged component has an `approve` entry.
- [ ] 4.3 Port or write the process steps (with arrows), cause and effect, comparison and timeline scenes, with notices and minimum lengths. The user reviews this batch in the gallery and exports decisions; the export is committed into `gallery/approvals.json`, linking it, in the same PR, and only approved components of the batch are merged. Verify with the same probe and the same approval check.
- [ ] 4.4 Port or write the key number, chart (bar/line) and image-with-callouts scenes (callouts tracking the zoom), with notices and minimum lengths. The user reviews this batch in the gallery and exports decisions; the export is committed into `gallery/approvals.json`, linking it, in the same PR, and only approved components of the batch are merged. Verify with the same probe and the same approval check.
- [ ] 4.5 Add the 15-frame theme transitions into the timeline's transition slots. Verify with a fixture render that every transition's frames fall inside the gap after the outgoing scene's last block, and that the rendered length equals the timeline's total length.
- [ ] 4.6 The user picks the theme in the gallery and exports the pick; commit it into `gallery/approvals.json`, linking it. A `redo` component from 4.2–4.4 is redone and re-reviewed, or stays unshipped. Remove the unpicked theme and every candidate kind without an `approve` entry. Verify with a static test that the schema kinds, registry, JSON Schema and example script equal the approved set, and that hook, summary and end card are approved. Task 7.2 extends the test to the skill's kind list.

Suggested fixture level: expanded - it adds the components that the schema's kinds bind to, and a user approval gate.
Minimal mergeable slice: task 4.1 with a placeholder component only. No real component merges before its own approval entry, recorded in the same PR.

## 5. Kit check and render (OCU `remotion-template`)

- [ ] 5.1 Implement the mechanical stage of `kit check` as a background job reported by `kit status`. It covers the schema, the probe rules from 3.7, rest after reveals, unnarrated stretches outside lead-in, tail and end card, timeline agreement, image, font and voice assets, and the custom count. The music rules (unknown id, track length) are added in 6.5. Verify:
  - each rule has a failing and a passing fixture;
  - `check` returns at once;
  - `status` reports running, passed and failed with reasons.
- [ ] 5.2 Add the contact sheet and the fixed yes/no checklist after a passing mechanical stage, with the video-shotcraft (Apache-2.0) NOTICE entry, plus the passing-check hash over `script.json`, `timeline.json`, `src/` and the referenced `public/` files. Verify that a passing check writes exactly one four-tile sheet and prints the questions, that editing `src/` or a referenced `public/` file invalidates the hash, and that regenerating `src/custom/index.ts` without changes does not.
- [ ] 5.3 Implement `kit render`:
  - background launch;
  - render into `out/`, verify with ffprobe (H.264, yuv420p, AAC, duration), then move atomically to `/mnt/user-data/files/<name>.mp4`;
  - `status` distinguishes died-without-exit;
  - refuses to start after an unchecked edit.

  Verify the refusal, a successful fixture render, and a killed render that leaves the previous target intact.

- [ ] 5.4 Time `kit check` on the maximum-size fixture script in the workspace image with `--cpus=2 --memory=4g`, and record the time in the PR. Verify that it completes, and that `status` stays responsive throughout.

Suggested fixture level: expanded - it adds a CLI gate and publishes the user's output files.
Minimal mergeable slice: task 5.1 with its fixtures. It reads the script, timeline and probe output, and is testable without a final render.

## 6. CC0 music library (OCU)

- [ ] 6.1 Collect per-track evidence for the candidates: a live CC0 statement, or an archived statement whose digest matches `source_sha256`, plus a search for other licences. Build the listening page, which exports the user's decisions as JSON. Verify that every candidate on the page links its evidence snapshot and its re-release search note.
- [ ] 6.2 The user listens and exports decisions. Commit the export as the tracked approval file, linking it. Verify that the file holds one decision per candidate, with the user as approver.
- [ ] 6.3 Write the tracked source manifest for the approved tracks (URL, `source_sha256`, evidence, mood, loop flag, approval link; no audio binaries) and the normalization script (MP3 for non-loop, WAV for loop, -16 LUFS / -1.5 dBTP) that writes the shipped manifest with `shipped_sha256`. Verify with a static test and fixture tracks:
  - approvers match the approval file;
  - the per-mood counts are reported against the target of four;
  - on short fixture tracks, the script's outputs measure within 0.5 LU of -16 LUFS and below -1.5 dBTP with `ffmpeg ebur128`, and a fixture with a wrong `source_sha256` fails naming the track.
- [ ] 6.4 Add the workspace `Dockerfile` step that downloads the sources, verifies `source_sha256`, runs the normalization script and installs the library and shipped manifest at `/opt/video-music/`. Verify in `tests/test-docker-image.sh` that every file exists and matches its manifest `shipped_sha256`, that every file measures within 0.5 LU of -16 LUFS, and that the manifest is readable by the sandbox user.
- [ ] 6.5 Add ducking, looping, the track-length rule and the unknown-id rule to the renderer and `kit check`, reading the manifest from `/opt/video-music/` and, in tests, from a fixture library of short normalized tracks. Verify with fixture renders and `node --test`:
  - narrated windows sit 15 ± 3 dB below the narration, with ramps of 0.5 ± 0.1 s;
  - music `none` gives narration only;
  - a short non-loop track fails the check, naming both lengths;
  - an unknown id fails, listing the valid ids.

Suggested fixture level: expanded - it changes the workspace `Dockerfile`, adds a build-time download, and adds `manifest.json`, a file format read by `kit check` and the renderer.
Minimal mergeable slice: task 6.1, the evidence tooling and the listening page. It ships nothing into the image.

## 7. Image end-to-end test and skill routing (OCU)

- [ ] 7.1 Extend `tests/test-docker-image.sh` with an offline `new` → `voice-import` (fixture audio) → `timeline` → `check` → `status` → `render` inside the built image, on a fixture script at the timeline's 60-second minimum. Verify that it passes in CI's sandbox-image smoke step on the PR's image.
- [ ] 7.2 On an integration branch, not merged before acceptance, rewrite `skills/public/remotion/SKILL.md` as a router of at most 80 lines:
  - explainers follow the kit steps in order, including image import and "fix and re-check on any no";
  - other types keep the existing workflow;
  - the vendored guidance is read only for `custom`.

  Move the render mechanics into a reference file. Update `tests/test_remotion_image.py` to pin the steps and the 80-line limit, and extend 4.6's static test so the skill's kind list equals the approved set. Verify with the updated test on the integration branch.

Suggested fixture level: compact - task 7.1 adds a test, and task 7.2 changes skill text that a static test pins; the runtime behavior is covered by groups 3–6.
Minimal mergeable slice: task 7.1 merges on its own. Task 7.2 merges only after task 8.2 passes.

## 8. After run and acceptance

- [ ] 8.1 Build the release candidate from `main` plus the integration branch, with the WebUI image unchanged. Run the request set on the evaluation stack, including 7.1's checks on the candidate image. Verify that 13 final-outcome manifests, one per request and repetition, are recorded with the same WebUI digest as the baseline.
- [ ] 8.2 Generate the blind judging page for the ten explainer pairs, with a sealed key, and collect the user's votes. Apply the missing-side rules, open the key, and compare against both thresholds. Record the votes and the result in this change. Verify the outcome:
  - acceptance: ≥8/10 wins, with void pairs counted as losses, and both thresholds met. Merge task 7.2.
  - otherwise: record the failure, and leave task 7.2 unmerged.
- [ ] 8.3 After acceptance, pin the merged OCU commit in WebUI `constraints.yaml` and add the decision record. Verify `make doc-gate` and `make decisions-verify`.

Suggested fixture level: compact - evaluation execution, a pin bump and a decision record.
Minimal mergeable slice: atomic - the pin bump is the only code change, and it lands only after acceptance passes.
