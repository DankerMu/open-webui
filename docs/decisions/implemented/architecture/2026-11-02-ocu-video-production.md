---
id: 2026-11-02-ocu-video-production
title: Video production rides an upstream toggle filter, a feature header, an orchestrator speech tool and 2 CPU / 4 GB sandboxes
kind: architecture
status: implemented
date: 2026-11-02
supersedes: none
references: DankerMu/open-webui#701, DankerMu/open-webui#702, DankerMu/open-webui#703, DankerMu/open-webui#704, DankerMu/open-computer-use#201, DankerMu/open-computer-use#202, DankerMu/open-computer-use#203, ocu-video-production, 2026-11-02-ocu-sandbox-wake-retention, 2026-09-26-ocu-private-runtime-provisioning, 2026-10-22-ocu-harness-computer-use-tool
---

# Video production rides an upstream toggle filter, a feature header, an orchestrator speech tool and 2 CPU / 4 GB sandboxes

## Problem

The owner wants the chat model to write, render and voice Remotion videos in a chat's sandbox, switched on per message from the chat input like the other Open WebUI switches. The deployed sandbox has no internet access, so the official skill's `create-video` and `npm i` steps cannot run. It is capped at 1 CPU and 2 GB, and nothing synthesizes speech. The switch has to reach the system prompt that OCU renders without new WebUI production code, because the fork must stay rebase-able. Speech needs a provider key that the model and the sandbox must never see.

## Decision

**Switch seam.** The switch is an upstream toggle filter. OCU ships `openwebui/functions/video_production_filter.py`, id `video_production_filter`, whose `Filter.toggle` class attribute is True and whose `inlet` returns the body unchanged. The OCU init installs it active and global under the name `视频制作`. Upstream lists every active, global toggle filter in each model's `filters`, renders it as a switch in the integrations menu, and sends the selected ids as `filter_ids` in the request metadata. The Computer Use filter stays the only owner of the system prompt. It treats a request as video-enabled only when `video_production_filter` is in `__metadata__["filter_ids"]` and also among the ids in `__model__["filters"]`. An admin who deactivates the video filter therefore turns the feature off for clients that keep sending the id. The two filters share only the id constant; there is no ordering or shared state between them. WebUI adds no production code. Upstream resets the selection when the user switches chats, as it does for every switch.

**A UX control, not a security boundary.** For a direct connection, the browser supplies its own model item, so a user can make `__model__["filters"]` list the video filter. The worst outcome is that the chat model is told about the `remotion` skill, which is installed in every sandbox anyway, and sub-agents and the terminal's Claude can find it through `~/.claude/skills`. The switch decides what the chat model is told, not what is installed or allowed.

**Feature header.** A video-enabled request adds `X-OCU-Features: video` to the filter's `/system-prompt` fetch. That route is internal-token guarded, so a user reaches the header only through the switch. OCU parses the header as a comma-separated set. `video` is the only accepted value; any other value, including an empty item, returns 400 and renders nothing. An absent or blank header means no features, and the prompt is then byte-identical to the prompt before this change. With `video` and a user email, OCU renders `<available_skills>` from a new list with `remotion` appended unless already present, and never mutates the skills cache; without an email it renders the fixed template, which has no `remotion`. The filter's prompt cache key and OCU's render cache key both include the feature set. MCP initialize, the sandbox README and `sub_agent` pass no features.

**Speech contract.** `generate_speech(text, filename, instructions, voice)` is an MCP tool, mirrored in the Open WebUI tool wrapper. The orchestrator, not the sandbox, calls an OpenAI-compatible `POST {TTS_BASE_URL}/audio/speech` with `model`, `input` and a `response_format` derived from the `.mp3` or `.wav` extension. It refuses redirects, wrong content types and bodies over 50 MB, and writes the audio into the chat's outputs through the upload store under the lifecycle lock. A tombstoned chat is refused as `Error: chat was deleted`. All `TTS_*` variables are read by `computer-use-server` only. `TTS_API_KEY` lives in the 0600 provider env file and is interpolated into `computer-use-server` alone. It never enters `runtime.env`, a sandbox environment, a tool result, a log or the deployment record, and any echo of it in an upstream error body is removed. OCU backup and recovery carry it as a provider key (`deploy/recovery.py`). Without `TTS_BASE_URL`, the tool returns `speech synthesis is not configured`. A `TTS_BASE_URL` that is not `http(s)://`, a set URL without `TTS_MODEL`, and an explicitly empty or non-positive `TTS_TIMEOUT_SECONDS` refuse startup; `TTS_VOICE` and `TTS_API_KEY` are passed through unvalidated.

**Global resources.** Every sandbox gets 2 CPUs and 4 GB: the code defaults, `bootstrap-test.sh`, the README and `.env.example` set `CONTAINER_CPU_LIMIT=2.0` and `CONTAINER_MEM_LIMIT=4g`. The helm chart keeps `2g` / `1.0`. Its podman sidecar, which hosts every sandbox, is itself capped at 2 CPU / 4Gi by the chart's own `podman.resources.limits`, so one 4g sandbox could OOM the sidecar and every sandbox in it. A comment in `values.yaml` names the limit; helm is not on the LAN deployment path. An existing `runtime.env` keeps its old values until the operator edits it, and existing containers keep 1 CPU / 2 GB until they are recreated or updated with `docker update`.

**Remotion licensing.** The image installs Remotion 4.0.537 with Chrome Headless Shell into `/opt/remotion-template/` at build time, and the official `remotion-best-practices` skill is vendored unchanged with a `SOURCE.md`. Remotion is under the Remotion License, which is free for individuals, for-profit organizations with up to 3 employees and non-profits. The owner's organization is a non-profit. Any other organization, or a change in the owner's status, needs a Remotion Company License. OCU's `NOTICE` and `THIRD-PARTY-LICENSES.md` carry the notice; neither repository is relicensed. WebUI ships no Remotion code and needs no notice.

**Chinese display name.** OCU's repository rules require English-only text (`CLAUDE.md`, "English only. No exceptions"). The function name `视频制作` is an exception: it is a product label the owner specified for the Chinese-speaking users, and it is stored by the init payload and shown verbatim in the integrations menu. Code, comments and docs around it stay English, and `tests/deploy/test_init_wrapper.py` pins the name, so an English-only cleanup fails a test instead of renaming it silently.

**Evidence in this repository.** `constraints.yaml` pins OCU at `4dab0cf`. `make verify-ui-ocu` runs `e2e/ocu-video-switch.e2e.ts`, which installs both pinned filters as admin from the staged checkout, points the Computer Use filter at the OCU stub, and asserts the switch in the integrations menu. The OCU stub serves an OpenAI-compatible model, so a send runs the real backend filter chain, and it records each `/system-prompt` request's `X-OCU-Features` value. A send with the switch on carries `video`; a send with it off carries no header. The spec removes the filters and restores the provider config afterwards.

## Alternatives considered

- **The video filter appends the skill to the system message** — duplicates OCU's skill rendering and races the Computer Use filter's insertion.
- **The Computer Use filter trusts `filter_ids` alone** — an admin could not turn the feature off for a client that keeps sending the id; the intersection with the model's toggle filters restores that.
- **A WebUI-side switch, setting or route** — new production code on the upstream spine for something upstream's toggle filters already do.
- **A query parameter instead of a header** — the header keeps `/system-prompt`'s existing parameters unchanged and is equally limited to the internal-token caller.
- **The sandbox calls the TTS service directly** — the key would sit inside the sandbox, where the model can read it.
- **Per-chat resource bump while the switch is on** — needs a WebUI-to-OCU signal and `docker update` on a live container; the owner chose a global bump.
- **Raise helm to 4g with the rest** — one sandbox could OOM the shared podman sidecar under its 4Gi cap.
- **Write our own Remotion guide** — the official skill is maintained, already proven by the owner, and redistributable under the Remotion License.
- **Page-level model mocking in the e2e spec** — fulfilling `/api/chat/completions` in the browser skips the backend filter chain, so it could not observe the header; the stub serves a real OpenAI-compatible model instead.

## Consequences

- An existing deployment gets the new filter, the changed Computer Use filter and the tool with `generate_speech` only after its init marker is removed and the init re-run. The #590 re-run procedure in OCU `NETWORK-HARDENING.md` applies; packaging task 4.5 adds this release's upgrade step.
- The switch is per message and resets on chat change; a message sent without it lacks the skill entry, and the chat's video files are untouched.
- Speech is verified against a stub HTTP server; the real Breeze-TTS-2 service, or an adapter exposing `/audio/speech`, is verified when the owner deploys it.
- The WebUI evidence runs the pinned filter sources against the OCU stub, not a real OCU or a real model; the real-engine render evidence lives in the OCU change.
