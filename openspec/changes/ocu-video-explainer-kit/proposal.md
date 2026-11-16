# Proposal

Source plan: `docs/plans/2026-11-16-ocu-video-explainer-kit.md`. Its Decision Ledger is the user's ruling of 2026-11-16.

## Why

Production video quality is poor. The production model is fixed at `qwen3.8-27b`, which can read images, and no stronger model is available. Today it writes a whole Remotion composition from scratch: layout, colour, type sizes, pacing and motion. The sandbox template is one fading title (`open-computer-use/remotion-template/src/Root.tsx`), and the skill is 174 lines of run mechanics with no design guidance (`skills/public/remotion/SKILL.md`).

The quality bar is the Remotion official and community examples. The approach is the one the official Prompt to Video template takes: the model fills a validated data file, and prebuilt, tested scenes render it.

## What Changes

- **Science-explainer kit in the sandbox template (OCU).**
  - `/opt/remotion-template` gains `src/kit/`: a theme, a Chinese text helper, scene components, captions, transitions, BGM ducking, and a renderer over a zod 4 `script.json` schema.
  - It also gains `bin/kit.mjs`, run in the sandbox. `node /opt/remotion-template/bin/kit.mjs new <name>` creates a project; inside it, `node bin/kit.mjs` runs `voice`, `voice-import`, `image`, `timeline`, `check`, `render` and `status`. `check` and `render` run in the background.
  - The model writes only `script.json`: a hook, 3–5 chapters, a summary and an end card, at 1920×1080 and 30 fps, 60–180 s. At most one `custom` scene per video may hold model-written TSX, and it must pass the same check.
  - Components are ported from Onda (MIT, the base), RenderComp (MIT), about 15 Remocn items (MIT) and remotion-bits primitives (MIT). They are reworked for one theme token set, Chinese typography and offline rendering on Remotion 4.0.537.
  - The narration format and timing method come from anything2explainer and video-talkcraft (PolyForm Noncommercial 1.0.0, approved by the user for this non-profit project).
  - No npm dependency is added.
  - Every component enters the kit only after the user approves its sample in a rendered gallery.
- **`kit check` (OCU).**
  - Mechanical aesthetic rules, taken from video-shotcraft's rules (Apache-2.0), fail the check: text overflow, minimum type size, rest after a key reveal, unnarrated animation length, and narration and scene length agreement.
  - It then renders a key-frame contact sheet and prints a yes/no checklist that the model answers from the image.
- **CC0 background music (OCU).** A target of sixteen tracks in four moods is baked into the workspace image, normalized to -16 LUFS (MP3, or WAV for loop tracks). A track ships only when:
  - its licence is verified track by track;
  - the user has approved it by listening;
  - it has a provenance manifest entry. Audio binaries are not committed; the image build downloads and verifies them, like the font bundle.
- **Skill routing (OCU).**
  - `skills/public/remotion/SKILL.md` becomes a short router of at most 80 lines: science explainers use the kit, and other video types keep the current workflow for now.
  - The router merges only after blind acceptance passes. The kit slices before it are inert.
  - The run mechanics move to a reference file.
  - NOTICE and THIRD-PARTY-LICENSES name every new source and its licence.
- **Pinned workspace base image (OCU).** `FROM ubuntu:24.04` becomes a digest pin of the base the production image uses today (`noble-20261024.1`). The release inventory records that digest as a workspace build material.
- **Evaluation on 210.77.77.27 (OCU tooling).**
  - A full WebUI + OCU stack runs as an isolated compose project from unmodified release images, with sandbox networking disabled (`ENABLE_NETWORK=false`). It is driven through the WebUI chat API with `qwen3.8-27b`, `doubao-seedream-5-0-flash-260915` and `mimo-v2.5-tts` on dmxapi.
  - An evaluation-only speech adapter maps `POST /audio/speech` to mimo's `chat/completions` audio protocol.
  - The request set runs before and after the change: five science-explainer requests twice each, plus one course, one promo and one report request.
  - The user blind-judges the ten science pairs. The new version must win at least eight.
- **WebUI.** The `constraints.yaml` OCU pin moves to the merged OCU commit.
- **Not changed:** image-generation code (WebUI image generation, OCU generated-image sync). Production generates images reliably, and the user ruled on 2026-11-16 that this code stays untouched. The evaluation stack copies production's image settings.

## Capabilities

### New Capabilities

- `ocu-video-explainer-kit`: the sandbox kit, which covers:
  - the `script.json` schema and its failure messages;
  - the commands and their order;
  - the narration timeline;
  - scenes, theme, Chinese typography and captions;
  - the `custom` scene limit;
  - `kit check`;
  - the gallery approval gate;
  - skill routing.
- `ocu-video-music`: the CC0 background-music library, which covers per-track licence evidence, loudness, user approval, the manifest, and ducking under narration.
- `ocu-video-evaluation`: the evaluation stack on the shared host, which covers its isolation, the speech adapter, the request set, baseline and after runs, and blind-judged acceptance.

### Modified Capabilities

- `ocu-offline-image-delivery`: adds a requirement that the workspace base image is pinned by digest and recorded as a build material.

## Impact

- OCU repository:
  - `remotion-template/` (`src/kit/`, `bin/`, `tests/`, `gallery/approvals.json`; no new dependencies and no `package.json` scripts);
  - `skills/public/remotion/` (`SKILL.md`, a new reference file and the vendored-skill manifest unchanged);
  - a new music directory baked into the image;
  - `Dockerfile` (`FROM` digest, music copy);
  - `deploy/release.py` (base-image material);
  - NOTICE and THIRD-PARTY-LICENSES;
  - `tests/test_remotion_image.py`, `tests/test-docker-image.sh`, new `node --test` kit tests, and a new CI job that runs them (a flagged CI change);
  - new evaluation tooling (stack definition, speech adapter, driver, request set).
- WebUI repository: this change, the source plan, the `constraints.yaml` OCU pin and a decision record.
- Deployment: a workspace image rebuild. The upgrade package carries the workspace tar (about 3.8 GB) and the LAN host recreates sandboxes. No database change.
- Shared host 210.77.77.27:
  - a compose project `ocu-eval`, with ports bound to 127.0.0.1;
  - the key `DMXAPI_KEY` in a 0600 file under `/home/nwm`;
  - only evaluation images loaded into Docker, no prune, and no host firewall or network changes.
