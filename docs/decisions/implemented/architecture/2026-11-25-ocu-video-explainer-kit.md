---
id: 2026-11-25-ocu-video-explainer-kit
title: Science explainer videos are a script.json rendered by a sandbox kit, and the remotion skill routes them to it
kind: architecture
status: implemented
date: 2026-11-25
supersedes: none
references: docs/plans/2026-11-16-ocu-video-explainer-kit.md, ocu-video-explainer-kit, 2026-11-02-ocu-video-production, DankerMu/open-webui#814, DankerMu/open-webui#849, DankerMu/open-webui#850, DankerMu/open-webui#851, DankerMu/open-webui#914, DankerMu/open-computer-use#267
---

# Science explainer videos are a script.json rendered by a sandbox kit, and the remotion skill routes them to it

## Problem

Production video quality is poor. The production chat model is fixed at `qwen3.8-27b`, which can read images and has the `generate_image` and `generate_speech` tools, and no stronger model is available. It wrote every Remotion composition from scratch: layout, colour, type sizes, pacing and motion. The sandbox template was one fading title, and the `remotion` skill held run mechanics with no design guidance. The source plan is [视频制作质量：科普讲解工具箱](../../../plans/2026-11-16-ocu-video-explainer-kit.md); the OpenSpec change is `ocu-video-explainer-kit`, and its `design.md` holds the detailed decisions this record summarizes.

## Decision

The details are in `openspec/changes/ocu-video-explainer-kit/design.md`; this section names the choices and does not restate them.

- **The sandbox explainer kit** (design Decisions 1–8 and 11). The model writes one `script.json`, validated by a zod 4 schema: a hook, 3–5 chapters, a summary and an end card, at 1920×1080 and 30 fps. Fixed scene components render it. The kit lives in the existing template at `/opt/remotion-template` (`src/kit/`, `bin/`) and runs as `node bin/kit.mjs <subcommand>` in the sandbox. Narration drives the timeline, and at most one `custom` scene holds model-written TSX. Only components the user approved in the rendered gallery are in the kit (Decision 12). `kit render` publishes the MP4 into `/mnt/user-data/files/` atomically.
- **A mechanical `kit check` and a contact-sheet checklist** (Decisions 9–10). Stage 1 fails the check on mechanical rules measured by a shared probe composition. Stage 2 writes a 2×2 contact sheet and prints a yes/no checklist that the model answers from the image; the checklist is advisory. `render` refuses unless the current project matches the hash of a passing check.
- **Bundled music** (Decision 13). A CC0 background-music library, approved track by track by the user, is built into the workspace image from a tracked source manifest. Audio binaries are not committed. The render ducks the track under narration.
- **The `remotion` skill is a router** (Decision 16 and the skill-routing requirement). `skills/public/remotion/SKILL.md` sends science explainers to the kit and its reference `explainer-kit.md`, and every other video to `free-form.md`, which keeps the earlier workflow on the official skill. The router merged as OCU PR DankerMu/open-computer-use#267 only after the acceptance ruling below; the kit slices merged before it were inert.
- **Also in the change:** the workspace base image is pinned by digest and recorded as a release build material (Decision 14), and an evaluation stack and driver live in OCU `deploy/eval/`, outside every release (Decision 15).
- **WebUI.** `constraints.yaml` `ocu_checkout.sha` pins OCU `32b2704eb716dcf00620459a3532fff3901f8e07`, the merge commit of DankerMu/open-computer-use#267. Its tree equals the evaluated `ab3e0fe`. WebUI adds no production code.

**Refines [2026-11-02-ocu-video-production](2026-11-02-ocu-video-production.md).** That record rejected writing an own Remotion guide, because the official `remotion-best-practices` skill was maintained and proven. The official skill stays vendored unchanged, and `free-form.md` still sends every non-explainer video to it. The router adds the kit's own reference, `explainer-kit.md`, for science explainers, which read the official skill only to write a `custom` scene. The switch, the feature header, the speech contract, the sandbox resources and the Remotion licensing of that record are unchanged.

**Third-party material added since that record**, as OCU `NOTICE` (section 6) and `THIRD-PARTY-LICENSES.md` list it:

- **Vendored, MIT:** Onda `lib/` (`degueba/onda`, commit `3c814051`), in `remotion-template/src/kit/onda/` with its licence text. It is the only vendored component source. RenderComp, Remocn and remotion-bits, named in the plan, were not used.
- **Borrowed format or idea, no code, PolyForm-Noncommercial-1.0.0**, approved by the user for this non-profit project, with their Required Notices kept:
  - anything2explainer: the narration shape and the gap numbers;
  - video-talkcraft: a typed parameter table per scene kind.
- **Adapted text, Apache-2.0:** video-shotcraft. The checklist questions are rewritten from its self-check questions.

## Acceptance

The acceptance record is task 8.2's "User ruling (2026-11-25)" in the change's `tasks.md`, posted to DankerMu/open-webui#849. The thresholds were set before the after run: at least 8 of 10 blind-judged pairs won by the new version, render success at least 12 of 13 final outcomes, and a kit check pass rate of at least 8 of 10 explainer runs.

- **The a-priori result fails both of the first two thresholds.**
  - Votes: the new version won 7 of 10 pairs, below ≥ 8/10. The two pairs with no new video count as losses. Pair 02's vote stays B, and the recorded count stays 7/10.
  - Render success: 11/13, below ≥ 12/13.
- **The kit check pass rate is 8/10**, which meets its threshold of ≥ 8/10.
- **The pair 02 statement came after the key was opened.** After the mapping was shown, the user said that pair 02 was also acceptable. The statement is not blind, and it does not change the recorded vote or the recorded count.
- **The ruling.** The user was told that counting pair 02 as a win would make 8/10 and that render success would still be 11/13. With that count, the user waived the render success threshold and ruled the change accepted. The user's two grounds:
  - the render shortfall and both pairs with no new video come from the same two early stops;
  - of the 8 pairs with both videos, the new version was preferred in 7, and the user accepts pair 02 too.
- **Deviations**, made by the user and not by an agent:
  - from `specs/ocu-video-evaluation/spec.md`'s acceptance rule ("The change SHALL be accepted only when …") and its scenario "Acceptance fails";
  - from design Decision 16;
  - from the Migration Plan's step 3 ("pass blind acceptance") in `design.md`.

  The spec and design are not amended. The ruling is a recorded exception to them.

- **Recorded, not part of the decision.** The user remarked that the videos look like one template with little variety, and that the image model seemed unused. `counts.image_calls` is 0 in all 10 baseline runs. It is 1–4 in 7 of the 8 successful after runs; `explainer-four-seasons` r1 has 0. Whether those images reached the final videos was not checked.

## Alternatives considered

From `design.md`:

- **A separate `/opt/video-kit`** — it needs a second `node_modules` or a cross-directory import (Decision 1).
- **An MCP tool per kit step** — it changes `computer-use-server`, the tool wrapper and the init flow, while the model already has a shell (Decision 2).
- **One speech call per scene with estimated word timings** — caption timing becomes a guess (Decision 4).
- **Music tracks under `remotion-template/public/`** — every project copy would duplicate them (Decision 13).
- **A hand-written model and tool loop for the evaluation** — it bypasses WebUI's tool loop (Decision 15).

## Consequences

- **The pin brings every OCU change merged since `01b7ef7`**, not only the kit. The non-kit ones, all OCU PRs, are the base-image pin (#233), the evaluation tooling (#235, #236, #238–#240, #268), and the init fixes (#259, #260). The consumer inputs of this repository are byte-identical between `01b7ef7` and `32b2704`: `computer-use-server/`, `deploy/proxy/`, `openwebui/functions/`, `openwebui/tools/` and `requirements.txt`. The directory names under `skills/public/` are the same at both commits. The OCU PRs in `01b7ef7..32b2704`, from `git log --merges`, all in DankerMu/open-computer-use:
  - #233: pin the workspace base image by digest and record it in the release inventory.
  - #234: CC0 music candidates with licence evidence and a listening page.
  - #235: the isolated `ocu-eval` stack for a shared Docker host.
  - #236: the evaluation speech adapter to dmxapi `mimo-v2.5-tts`.
  - #237: commit the user's music listening approval.
  - #238: image generation and edit routes in the evaluation adapter.
  - #239: commit the evaluation request set.
  - #240: the evaluation driver and its scoped cleanup.
  - #241: a CI job that runs the Remotion template's `node:test` suite.
  - #242: vendor Onda `lib/` into the kit.
  - #243: build the loudness-normalized music library.
  - #244: kit theme tokens and the Chinese text helper.
  - #245: the version-1 `script.json` schema.
  - #246: `kit new`, `voice`, `voice-import` and `image`.
  - #247: `kit timeline`.
  - #248: the shared probe composition and text rules.
  - #249: the explainer renderer with per-block captions and the custom-scene loader.
  - #250: install the music library into the workspace image.
  - #251: the gallery generator with exportable decisions.
  - #252: 15-frame theme transitions in the timeline's slots.
  - #253: `kit check` as a background job, with `kit status`.
  - #254: the contact sheet, the checklist and the passing-check hash.
  - #255: `kit render` publishes the checked project atomically.
  - #256: decode a voice block as mono 48 kHz before trimming.
  - #257: duck and loop background music in check and render.
  - #258: sweep stem partials and bound the music decode.
  - #259: keep the admin password, MCP key and token out of the init's `curl` argv.
  - #260: init docs: drop a stale reason and state the curl 7.55 minimum.
  - #261: the first explainer scene batch and its approval gate.
  - #262: the second explainer scene batch and its gate tests.
  - #263: key number, chart and image-with-callouts scenes.
  - #264: record the light theme pick and keep only the approved kit.
  - #265: time `kit check` and `kit render` on the maximum-size script.
  - #266: run the kit's offline path in the image test.
  - #267: the `remotion` skill router.
  - #268: the evaluation driver's `kit` outcome row and the manifest's `check`.
  - #269: `kit render` resolves `localhost` without the system resolver.
- **Deploy** is the Migration Plan's steps 5–7 in `design.md`: build a release, deliver an upgrade package that carries the workspace image tar, and have the LAN operator import, retarget, run `up.sh` and remove sandbox containers so they are recreated on the new image. No re-init and no database change are needed. It is manual, and agents do not do it.
- **Rollback.** Retarget to the previous release and run `up.sh` (Migration Plan step 7). The previous inventory has no base-image material and still verifies. In this repository, the pin returns to `01b7ef7`.
- **Known gap.** Until DankerMu/open-webui#914 is fixed, a free-form (non-explainer) video with audio fails to render in a network-disabled sandbox, or the model works around it. The loopback lookup of DankerMu/open-computer-use#269 covers only `kit render`, and `free-form.md` runs the plain Remotion CLI.
- **Paused.** DankerMu/open-webui#893 and DankerMu/open-webui#897 are paused by the user until the user decides the kit's direction.
