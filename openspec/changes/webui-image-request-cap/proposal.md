## Why

The production upstream accepts at most 32 images per request (#936). Past that, every request in the chat fails, and the chat cannot be compacted on demand, so it is unusable. A single turn with more than 32 `view` calls fails partway through even with an empty history.

Traced at `2097c2b`:

- Nothing caps images in the payload sent upstream.
- OCU's `view` tool returns a `data:image/...` string; the middleware turns it into an LLM-only `input_image` (`utils/middleware.py:1127-1129`, `:5816-5818`) stored as base64 in the message `output`.
- Every later request replays all of them as a user message "Here are the images from the tool results above" (`utils/misc.py:401-418`); user images are re-sent every request (`middleware.py:2431-2451`, inlined at `:2512`).
- Within a turn, each tool-loop round re-sends every image so far (`middleware.py:5943-5980`, `:6185-6200`).
- Compaction is off by default (`config.py:2204`), token-triggered only, and the manual endpoint returns `disabled` when off.

## What Changes

- New module `backend/open_webui/utils/image_budget.py`: keep the newest N image parts across the outgoing `messages` and replace each older one with a short text part saying an earlier image was omitted to stay within the per-request limit.
- `normalize_messages_for_model` (`middleware.py:190-193`) calls it. Its four callers (`:3115`, `:3431`, `:5992`, `:6212`) are every send in the chat flow, after the `request` filters run.
- `CHAT_MAX_IMAGES_PER_REQUEST` in `config.py`, default 30 (the production upstream allows 32). A value that is not a positive integer fails startup.
- Decision record for the spine touch.

Owner decision (#936): cap in WebUI before every send, not in the OCU filter.

Deviation from #936: the placeholder does not name the omitted image's sandbox path, because flattening tool images into one trailing user message loses the image-to-call mapping (see `design.md`).

## Capabilities

### New Capabilities

- `webui-image-request-cap`: the per-request image budget on payloads sent to the model.

### Modified Capabilities

None.

## Impact

- `backend/open_webui/utils/image_budget.py` (new), `utils/middleware.py` (one call), `config.py` (one entry), tests, one decision record.
- Stored chat history does not change; only the outgoing payload does.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent
Blast radius: every chat request: a wrong cut drops text, reorders content, or still sends more than N images
Selected risk packs: Public API / CLI / script entry; Config / project setup; Schema / columns / units / field names; Resource limits / large input / discovery; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes
Evidence floor: unit tests red before and green after; make lint-scoped, make coverage-gate, make smoke, make decisions-verify
```
