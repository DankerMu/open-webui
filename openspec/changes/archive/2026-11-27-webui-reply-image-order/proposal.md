## Why

All images in an assistant reply render in one row at the top of the message, above every tool call and text (#937). They should follow the tool call that produced them.

Traced at `2097c2b`:

- `generate_image` / `edit_image` save their images to the whole message's `files` and emit `chat:message:files` (`backend/open_webui/tools/builtin.py:410-431`, `:487-508`); the browser replaces `message.files` with that list (`src/lib/components/chat/Chat.svelte:1291-1292`).
- `ResponseMessage.svelte:690-712` draws `message.files` before `ContentRenderer` (`:826`), which renders the ordered `message.output`.
- The tool result JSON already carries the images (`builtin.py:436`: `images`, each `{id, url: "/api/v1/files/<id>/content", name, content_type}` from `routers/images.py:562-568`).
- An in-order precedent exists: `buildOutputDisplayItems` pushes a `file` display item right after a `display_file` call's output (`structuredOutput.ts:380-390`).

## What Changes

- `structuredOutput.ts`: on a `generate_image` or `edit_image` `function_call` whose output (looked up by `call_id`) has an `images` array in its result JSON, add the call's token, close the detail group (`flushDetails`), and push an `image` display item with those images, right after the call. A helper returns the `id`s and `url`s of the images shown in order for a given `output`.
- `StructuredOutputRenderer.svelte`: renders an `image` display item with the existing `Image` component, outside any detail group.
- `ResponseMessage.svelte` and the channel `Message.svelte`: the files row skips an image shown in order (matched by `url`, or by `id` in channels). Images without an in-order match (no `output`, or a tool result without `images`) stay in the top row.

No backend change: `message.files` keeps being written, because OCU's chat-image sync reads it.

## Capabilities

### New Capabilities

- `webui-reply-image-order`: where generated images render inside an assistant reply.

### Modified Capabilities

None.

## Impact

Frontend only: `src/lib/components/chat/Messages/structuredOutput.ts`, `StructuredOutputRenderer.svelte`, `ResponseMessage.svelte`, `src/lib/components/channel/Messages/Message.svelte`, and tests.

## Triage

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent
Blast radius: generated images disappear from a reply, or show twice
Selected risk packs: Schema / columns / units / field names; Legacy compatibility / examples; Concurrency / shared state / ordering; Error handling / rollback / partial outputs
Evidence floor: unit tests for buildOutputDisplayItems and the top-row filter, red before; make test-frontend, make typecheck, make lint-scoped, make verify-ui-ocu with a screenshot
```
