# Design

## Context

See proposal.md (Why) and the source plan `docs/plans/2026-11-16-ocu-video-explainer-kit.md` (What Already Exists, Decision Ledger). The constraints that shape the approach:

- **Sandbox runtime.**
  - No network, 2 CPUs, 4 GB of memory, software WebGL only. `npm install` is not allowed.
  - The Remotion template is shared read-only at `/opt/remotion-template`. Projects copy it and symlink `node_modules`.
  - ffmpeg, ffprobe and `Noto Sans CJK SC` are in the image.
  - The template has no TypeScript compiler and no test runner. Node is 22.
  - Tool commands are killed after `COMMAND_TIMEOUT` (120 s).
- **Model.** `qwen3.8-27b` can read images and follows long instructions poorly. Every image it `view`s stays in context.
- **Fixed interfaces we build on.**
  - `generate_speech` writes one file per call into `/mnt/user-data/files/` and suffixes an existing name (`mcp_tools.py:866-867`).
  - Generated images land in `/mnt/user-data/files/` through the existing sync.
  - Both, together with the image-generation code and the video switch, stay untouched.
- **Captions.** `@remotion/captions` 4.0.537 starts a page only before a token that begins with a space, so Chinese narration becomes one page unless `pageBreakAfter` is set.
- **Community components.** Most of them:
  - split words on whitespace;
  - set `nowrap` on user strings;
  - estimate widths with ASCII tables;
  - use negative letter spacing or tight masked line heights;
  - format numbers in K/M.
- **Evaluation network.** OCU refuses an `internal` sandbox network (`docker_manager.py:821-828`). It supports `ENABLE_NETWORK=false`, which creates sandboxes with `network_disabled=True` and publishes no port.

## Goals / Non-Goals

**Goals:**

- `qwen3.8-27b` can produce a science explainer by writing one JSON file and running the kit's commands. The result does not depend on the model's sense of layout, type or motion.
- Inputs fail loud. Every error names the scene, the field and the fix.
- The improvement is measurable: the blind-judged pairs in `ocu-video-evaluation`.

**Non-Goals:**

- Course, promo and report presets, and any use of the kit's theme or check by them. They keep the current workflow; only baselines are recorded.
- 9:16 output, 3D scenes, a sound-effects library, Remotion Studio.
- Any change to `generate_speech`, `speech.py`, the video switch, skill gating or image-generation code.
- Production support for the mimo chat-completions speech protocol. The adapter exists only in the evaluation stack.
- New npm dependencies, a TypeScript compiler, or a second template directory.
- Pinning the base images of the repository's other Dockerfiles.
- Copying the PolyForm projects' code wholesale. Only the formats and numbers named in Decision 7 are taken.

## Decisions

1. **The kit lives inside the existing template.** It is `remotion-template/src/kit/` (components, theme, renderer) and `remotion-template/bin/` (the command and its plain `.mjs` modules).
   - One template keeps one Dockerfile install step, one lockfile and one test module.
   - Alternative rejected: a separate `/opt/video-kit`, which needs a second `node_modules` or a cross-directory import.

2. **One command, two call forms.**
   - `node /opt/remotion-template/bin/kit.mjs new <name>` creates `/home/assistant/videos/<name>` from the template.
   - Inside the project, `node bin/kit.mjs <subcommand>` runs `voice`, `voice-import`, `image`, `timeline`, `check`, `render` and `status`.
   - `check` and `render` start in the background and return at once. `status` reports running, passed or succeeded, failed with reasons, or died without an exit code, using a pid and a log. Neither step can then hit the 120 s limit.
   - No MCP tool and no server change, because the model already has a shell.
   - No `package.json` scripts. The existing guard `test_remotion_image.py:127-129` asserts there are none.
   - Alternative rejected: an MCP tool per step, which changes `computer-use-server`, the tool wrapper and the init flow.

3. **`script.json` and its schema.**
   - The schema is zod 4 in a plain `.mjs` module. The CLI imports it directly; the TSX renderer imports it through the Remotion bundle.
   - Scene shapes are a discriminated union on `kind`. `z.toJSONSchema()` exports the JSON Schema the skill shows the model.
   - The script structure is `hook`, then 3–5 chapters of 1–4 body scenes, then `summary` and `end-card`.
   - A scene has 1–4 sentences, and a sentence has caption blocks of at most 16 characters. `end-card` may have none.
   - Output is fixed at 1920×1080, 30 fps.
   - Validation runs before any bundling and refuses to render on any error. This deliberately departs from Onda's in-video `ErrorPlaceholder`.
   - Component prop schemas keep Onda's `kind: z.literal(...).default(...)` pattern. Defaults must already be valid output values, because zod 4 does not parse defaults. The `script.json` scene kinds use plain `z.literal`: in a `discriminatedUnion` of two or more options, a defaulted discriminator throws `Duplicate discriminator value "undefined"` in zod 4.5.4, and the model must write the kind anyway.

4. **Narration is bound to its text and drives the timeline.**
   - `kit voice` prints one `generate_speech` call per block. Each call names a WAV file whose stem carries an 8-character hash of the block text, the voice and the voice instructions.
   - `kit voice-import` finds, for each stem, a file in `/mnt/user-data/files/` with that stem or a numbered suffix of it, and copies it to `public/voice/<stem>.wav`. Any suffix holds the same content, because the stem binds the content. The model never deals with renamed paths.
   - Every scene boundary carries one 15-frame theme transition. It occupies the last 15 frames of the post-narration gap (20 or 45 frames) and is drawn as the outgoing scene's exit plus the incoming scene's entrance on adjacent frames, not as a `TransitionSeries` overlap, so it never overlaps narration and never changes the total length.
   - The 90-frame tail is the end card's closing part. An end card with narration lasts its narration plus the 90-frame tail. The end-card component's declared minimum is at most 90 frames.
   - `kit timeline` does the following:
     - trims silence with ffmpeg;
     - measures durations from decoded PCM, not the MP3 header;
     - places blocks with the gaps from anything2explainer: 0.06 s between blocks of one sentence, 10 frames between sentences, 20 frames at scene end, 45 frames before a chapter, a 40-frame lead-in and a 90-frame tail;
     - concatenates the narration and normalizes it to -16 LUFS;
     - records each block's hash;
     - enforces the 60–180 s window.
   - A scene lasts as long as its narration plus gaps, or its component's declared minimum (entrance plus required rest), whichever is longer.
   - Alternative rejected: one call per scene with estimated word timings, which makes caption timing a guess.

5. **Chinese captions page by block.** The kit builds `@remotion/captions` tokens from the blocks and sets `pageBreakAfter` on every block's last token. One block is one page.

6. **Images enter through one command.** `kit image "<path>"` copies a file from `/mnt/user-data/files/`, such as a generated image with spaces or a suffix in its name, into `public/images/` under a sanitized name. It prints the name to write in `script.json`. The schema accepts only plain names that resolve inside `public/images/`.

7. **Component sources and porting rules.**
   - **Sources:**
     - Onda `lib/` is vendored once. The zod v3 call at `lib/composition.ts:18` is fixed, and `adaptive-player.tsx`, `composition-json-schema.ts` and `registry-summary.ts` are dropped.
     - Candidate components come from Onda, RenderComp and Remocn, per the shortlist in the source plan. remotion-bits supplies primitives only, with `interpolateColors` in place of `culori`.
     - The scenes the libraries lack are written on Onda primitives: cause and effect, concept card, timeline with descriptions, comparison with points, and Ken Burns with callouts that track the zoom.
   - **Porting rules, for every component:**
     - colours, sizes, spacing and springs read from the theme;
     - text rendered through the Chinese text helper;
     - no system font stack and no network fetch;
     - no `nowrap` on user strings and no `toUpperCase`;
     - Han text line height at least 1.25;
     - numbers in 万 and 亿;
     - a declared minimum length.
   - **Taken from the PolyForm projects, with their Required Notice kept:**
     - anything2explainer's narration shape (short chapter names, short caption blocks, a few sentences per scene) and its gap numbers;
     - talkcraft's idea of a typed parameter table per component with frozen timing constants.
   - The notice entry for a source lands in the same task that brings the source in: Onda in 3.2, the PolyForm projects in 3.4, remotion-bits and the other component sources in 4.2–4.4, video-shotcraft in 5.2.

8. **The `custom` scene.**
   - It names `src/custom/<File>.tsx`, which default-exports a component. The component receives the scene's timing (duration and sentence and block frames) and the theme.
   - `kit check` and `kit render` write `src/custom/index.ts`, which statically imports the named file, so the Remotion bundle can resolve it.
   - The custom scene is probed and checked like any other scene.

9. **Shared probe measurement.**
   - A probe composition renders the probe frames: each scene's entrance end, midpoint and pre-exit frame.
   - In the DOM it records every text element's bounding box, `scrollWidth`/`clientWidth`, computed font size, rendered text, line-start characters and mask boxes, and writes them to JSON.
   - The gallery and `kit check` both use this probe.

10. **Kit check, two stages.**
    - **Stage 1 (mechanical)** covers the rules in the spec: schema, probe frames, rest after reveals, unnarrated stretches outside lead-in/tail/end card, timeline agreement, assets, track length, and the custom count.
    - **Stage 2** writes a 2×2 contact sheet and prints a fixed yes/no checklist of about ten questions, taken from shotcraft's human-judgement rules that apply to explainers.
    - The checklist is advisory in this change. The skill tells the model to fix and re-check on any "no".
    - A passing check records a hash of `script.json`, `timeline.json`, `src/` and the files under `public/` it references. The generated `src/custom/index.ts` is written deterministically before hashing. `render` refuses to start when the current hash differs.

11. **Render publishes atomically.** The video renders into the project, at `.kit/render/<token>.mp4` (amended by task 5.3 from `out/`: each run gets its own name, and the next start sweeps it). It is verified with ffprobe (codec, pixel format, AAC, duration). Only then is it copied to `.<name>.mp4.<token>.partial` in `/mnt/user-data/files/` and renamed to `<name>.mp4`; the files directory is a separate filesystem in production, so a direct rename would fail with `EXDEV`. A failed or killed render leaves the target as it was.

12. **Gallery approval.**
    - The gallery renders every candidate in both theme candidates inside the workspace image built from the PR branch. That image is built with the release builder on the Mac, loaded on 210.77.77.27 under the `ocu-eval` label, and removed by the evaluation cleanup. The output is one static page.
    - The page exports the user's decisions as a JSON file. Components are reviewed in three batches, and the theme is picked last.
    - Each batch's export is committed into `remotion-template/gallery/approvals.json`, linking the export, in the PR that merges that batch. The orchestrator never writes decisions itself.
    - A static test asserts that the schema kinds, the registry, the JSON Schema, the example script and the skill's kind list all equal the approved set, and that the required kinds are approved.

13. **The music library is image content.**
    - Audio binaries are not committed: OCU's pre-commit refuses files over 500 KB. This follows the font bundle (`deploy/fonts/fonts.json`, "pinned fonts without committing font binaries").
    - The repository tracks a source manifest: per track, the source URL, `source_sha256`, licence evidence, mood, loop flag and approval link.
    - The workspace image build downloads each source, refuses a digest mismatch, normalizes it with the image's ffmpeg (MP3 for non-loop tracks, WAV for loop tracks, -16 LUFS / -1.5 dBTP), and writes `/opt/video-music/manifest.json` with `shipped_sha256` computed from the built files. Normalization need not be bit-reproducible across builds, because the shipped digests are recorded per image.
    - A source URL that has gone away fails the build loudly. The release builder's cache keeps the layer for rebuilds of the same commit.
    - The render worker writes the selected track into the project at render time as `public/music.wav`: decoded, looped when it is a loop track, ducked and faded, at its final level. The Explainer plays it at volume 1 beside the narration only when the render passes `music: true`. Remotion's own `<Audio loop>` repeats on frame-quantized iterations and so cannot keep a loop seamless; its mix is a plain sum, so the premixed stem keeps its levels. (Amended for task 6.5, 2026-11-20.)
    - A project that names a track hashes the track file's bytes, so a passing check does not carry over to a different library after an image upgrade. A `none` project never reads the library.
    - Ducking is relative to the normalized narration: -15 dB under voice and -6 dB without voice, with 0.5 s ramps. Loop tracks repeat. A non-loop track shorter than the video fails the check.
    - Approval comes from a tracked approval file exported by the listening page. Gallery approvals work the same way, one export per reviewed batch.
    - Alternative rejected: tracks under `remotion-template/public/`, which every project copy would duplicate.

14. **Base-image pin.**
    - `FROM ubuntu:24.04@sha256:78d4744ead1f5b19b04d0df558ab182a5300903900755e515b2ca4d10eb2044d` is the linux/amd64 image manifest of `noble-20261024.1` that production's workspace image `open-computer-use:3d0ceae2b7d5…` was built on. OCU CI and releases build linux/amd64 only; an arm64 local build would run this base under emulation.
    - `release.py` reads the digest from the recipe's `FROM` and records `{"name": "base", "kind": "base-image", "requested": "ubuntu@sha256:…"}` for the workspace role. A recipe without a digest fails the build before any image is built.
    - Inventories without the material keep verifying, so rollback still works.
    - A static test rejects an undigested root `FROM`.
    - A no-cache rebuild is not expected to reproduce the configuration digest, because apt and other installs are not pinned. A cached rebuild on the release host is.

15. **Evaluation stack on 210.77.77.27.**
    - A compose project `ocu-eval` runs the release images unmodified, with these deviations from bootstrap:
      - ports on 127.0.0.1;
      - `ENABLE_NETWORK=false` for sandboxes, verified with OCU's own disabled-network predicate and a failing outbound connection;
      - the orchestrator data directory under `/home/nwm/ocu-eval/`;
      - no DocumentServer and no retention-guard;
      - no host firewall or network provisioning;
      - a 15 GB free-space floor on Docker's root.
    - The tooling lives in OCU `deploy/eval/`, beside `deploy/production-like-test/`, and is not part of any release.
    - The speech adapter is a small service in the stack. It accepts OCU's speech request, calls dmxapi `chat/completions` with `mimo-v2.5-tts` audio output, which arrives in the requested `mp3` or `wav` format, so nothing is transcoded (measured 2026-11-17). It returns 502 without the key on any upstream failure. OCU's `TTS_BASE_URL` points at it, and callers authenticate with a stack-generated adapter token; only the adapter holds the dmxapi key besides `open-webui`.
    - The same adapter serves image generation. Production runs WebUI's `openai` image engine against vllm-omni. WebUI always sends `n`, while dmxapi serves `doubao-seedream-5-0-flash-260915` only on `/v1/responses`, where the prompt field is `input`.
    - Measured on 2026-11-16, with a 1920×1080 PNG at about ¥0.12 and 18 s per image:
      - `/api/v3/images/generations` refuses the flash model ("not allowed on this route");
      - `/v1/images/generations` answers 404;
      - `/v1/responses` without `n` works.
    - The adapter renames `prompt` to `input`, drops `n`, sets `watermark` false, and returns the OpenAI images shape. WebUI's image base URL points at it, so the image-generation code stays untouched.
    - Image editing is on in production. WebUI sends edits as multipart `/images/edits`, and the adapter forwards them to the same `/v1/responses` with the files as `data:` URLs in `image`. Measured 2026-11-16: an edit at 2048×2048 took 21 s and cost about ¥0.12.
    - Production uses 2048×2048 by default, with an aspect-ratio table of 16:9, 9:16, 1:1, 4:3, 3:4 and more. The user left exact pixels open (2026-11-16), so the evaluation fixes: 1:1 2048×2048, 16:9 2560×1440, 9:16 1440×2560, 4:3 2304×1728, 3:4 1728×2304, 3:2 2496×1664, 2:3 1664×2496.
    - The driver runs on the evaluation host, started detached over SSH, so a 60-minute run survives a dropped SSH session and the admin credentials stay on the host (amended 2026-11-17; the plan said the Mac through an SSH tunnel):
      - it turns on the video switch and image generation;
      - it posts each request to WebUI's chat completions API;
      - it records chat ids for cleanup and the tool, image and speech call counts;
      - it collects the MP4 from the workspace.
    - Before the baseline, a smoke run confirms that speech, image sync and outputs work with networking disabled. If they do not, evaluation stops and the user is asked. No release code is changed.
    - Alternative rejected: a hand-written model and tool loop, which bypasses WebUI's tool loop.

16. **Merge order protects acceptance.** The kit, components, check and music slices merge to OCU `main` as they are completed. They are inert until the skill routes to them. The skill-routing slice is built into the release candidate from an integration branch, and merges only after blind acceptance passes. If acceptance fails, it is not merged.

## Risks / Trade-offs

- [Software rendering of 1–3 minute videos on 2 CPUs may exceed the idle stop.] → Check and render run in the background, with a status command, and a killed render is relaunched from the last passing check. The evaluation records render time, and the thresholds are set after the baseline.
- [The headless shell may lack ICU word-break data for Chinese.] → The text helper segments by punctuation and character count. It uses `Intl.Segmenter` only if the probe in task 3.3 shows it works.
- [Community components may not compile on 4.0.537.] → Each port is bundled and rendered in the gallery before it is accepted. Remocn pins 4.0.542, but uses only APIs older than 4.0.537.
- [The model may still pick a poor scene sequence.] → The schema fixes the skeleton and its counts.
- [A 3-minute video needs 50–75 speech calls.] → They fit under WebUI's 256 tool-call iterations. The evaluation records the counts.
- [CC0 claims may be wrong.] → Evidence is collected per track, with a search for re-releases, and every track needs a user-approved file.
- [The shared host has 28 GB free on Docker's root.] → The 15 GB floor applies, only evaluation images are loaded, and cleanup works by recorded chat ids. There is no prune and no daemon reconfiguration.
- [The evaluation speech differs from production speech.] → The judgement is about visuals and pacing. The voice model is recorded in every manifest, and narration is loudness-normalized either way.
- [The kit's uniform style could make the new version recognizable in a blind pair.] → This is accepted. The question is whether the user prefers it, not whether they can tell.

## Migration Plan

1. Merge the OCU slices in order: base pin and evaluation tooling (independent), then kit core, components and check, then music. They stay inert without the router. The schema slice may list candidate kinds before approval; the equality with the approved set is enforced from task 4.6, before the router can merge.
2. Build the release candidate from an integration branch that adds the router.
3. Run the after evaluation and pass blind acceptance.
4. Merge the router. Pin the merged OCU commit in WebUI `constraints.yaml`.
5. Build a release, and deliver an upgrade package that carries the workspace tar.
6. The LAN operator imports, retargets, runs `up.sh`, and removes sandbox containers so they are recreated on the new image. No re-init and no database change are needed.
7. Rollback is a retarget to the previous release followed by `up.sh`. The old inventory has no base material, and it still verifies.

## Open Questions

- Settled 2026-11-16: the evaluation's image settings are fixed in Decision 15 (the user left the exact pixel table open).
- Settled 2026-11-17: the render success-rate threshold is at least 12 of 13 final outcomes, and the kit check pass-rate threshold is at least 8 of 10 explainer runs. The user confirmed both after the baseline and before the after run (task 2.7, #822).

## Not yet specified

- How the course, promo and report presets differ from the explainer skeleton, and whether they reuse the theme or the check. Their baselines come from this change's evaluation.
- Whether the yes/no checklist answers should be enforced mechanically, for example by refusing `kit render` until an answer file exists. This depends on the model's behaviour in the first evaluation.

## Sibling surfaces

- `skills/public/remotion/SKILL.md`: the never-archived local draft `openspec/changes/ocu-video-production` requires renders through `npx --no-install`. This change's routing requirement supersedes that rule for explainers. The draft is untracked and unarchived, so there is no main spec to modify.
- `tests/test_remotion_image.py`: pins the template's dependencies, the absence of scripts, the Dockerfile order and the skill rules. It is extended, not bypassed.
- `computer-use-server/docker_manager.py`: its network modes constrain the evaluation, and it is not modified.
- `deploy/release.py`: the existing DocumentServer base-material check stays strict. The workspace material is new and optional when reading older inventories.

## Sketch seams under test

- **The kit command line in a project directory** (`node bin/kit.mjs …` on fixture scripts and fixture audio).
  - It is the highest seam the model touches. It covers schema failures, voice binding, the timeline, the check rules and the status reporting.
  - Pure modules run with `node --test` in a new OCU CI job that runs `npm ci` in the template.
  - Bundling and rendering run in the built image.
- **The built workspace image** (`tests/test-docker-image.sh`): an offline `new` → `voice-import` (fixture audio) → `timeline` → `check` → `render` of a 60-second fixture script inside the real image, with the music library and manifest present.
- **The evaluation driver against the `ocu-eval` stack**: one request end to end through WebUI's chat API, producing an MP4 in the workspace. It is the only seam that exercises the model.
