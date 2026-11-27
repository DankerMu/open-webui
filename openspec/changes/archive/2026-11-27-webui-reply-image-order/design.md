## Design

Change surface: `buildOutputDisplayItems` and a new exported helper in `src/lib/components/chat/Messages/structuredOutput.ts`; the display-item switch in `StructuredOutputRenderer.svelte`; the files rows in `ResponseMessage.svelte` (`:690-712`) and `src/lib/components/channel/Messages/Message.svelte` (`:458-485`) (upstream files: minimal diff).

Must preserve:

- `message.files` is still written and stored as today (OCU `_chat_image_ids` reads it; `webui-generated-image-*` behavior unchanged).
- The `display_file` → `file` display item path, detail grouping, and every other display item are unchanged.
- Non-image files in `message.files` and images without an in-order match still render in the top row.
- A message with no `output`, or whose tool results carry no usable `images`, keeps its top row. A stored native-calling message (whose `output` already holds the `images` JSON) moves its images into the body by design.

Must add/change:

- Display item `{type: 'image', id, images: [{id, url, name}]}`, anchored to the call: when `buildOutputDisplayItems` handles a `function_call` named `generate_image` or `edit_image` whose output (looked up by `call_id`) parses to an object with an `images` array, it adds the call's token, closes the group (`flushDetails`), and pushes the image item. The middleware appends all of a turn's outputs after all its calls (`middleware.py:5798-5830`), so anchoring at the output would group the calls first; anchoring at the call keeps call, image, call, image. Only entries with a nonempty string `url` are kept; none pushes nothing.
- Exported helper (for example `getOrderedImageKeys(output)`) returning the `id`s and `url`s of those images. Both files rows skip an image whose `id` or `url` is in the set: the chat row matches on `url` (equal to the result's, `routers/images.py:562-568`), the channel row on `id` (`socket/main.py:1039` rewrites a channel file's `url` to its `id`).

Governing invariant: each generated image of a reply renders exactly once: right after its call when the call's result names it, otherwise in the top row.

Sibling surfaces:

- Streaming: the image shows in the top row from the `chat:message:files` event until the turn's outputs are appended: that includes `save_generated_images` (`builtin.py:437`) and, for two calls in one turn, the later calls' generation time. Then it moves. Accepted transient.
- Channels (`channel/Messages/Message.svelte:153-154`, `:458-485`, `:538`): render `StructuredOutputRenderer` from `message.data.output` and their own files row; covered by the same item and the `id` match.
- `ConsecutiveDetailsGroup`: image items are pushed outside the group (after `flushDetails`), so a collapsed group no longer hides generated images.
- MCP display files on `function_call_output.files` (`ToolCallDisplay.svelte:394-407`): unchanged; they already render under their call.
- Image-generation placeholder: drawn on the running `generate_image` call inside `output` (`ConsecutiveDetailsGroup.svelte:130-131`, `:334-336`; `ImageGenerationPlaceholder.svelte:16-24`). When the output arrives, the image item appears right after the call in its place. Consumer `e2e/ocu-image-placeholder.e2e.ts` must still pass.
- Non-native image-generation toggle path (`middleware.py:1839`, `:1947`): no tool call in `output`, so its images stay in the top row.

Seams under test: `buildOutputDisplayItems` and the helper as pure functions (`structuredOutput.test.ts`); the top-row filter as a pure function or a component test.

Required evidence:

- Output `[call generate_image A, output A {images:[a]}, call generate_image B, output B {images:[b]}]` → display items in order: tool A, image a, tool B, image b (red before).
- Same turn: `[call generate_image A, call B (other tool), output A {images:[a]}, output B]` → tool A, image a, tool B (not a group of A and B with the image after it); `[call A, call B (both generate_image), output A {images:[a]}, output B {images:[b]}]` → tool A, image a, tool B, image b.
- `edit_image` result → same.
- A result that is not JSON, has no `images`, or has entries without string `url` → no image item, no error.
- A `display_file` call → still a `file` item (unchanged).
- Helper on the first output → keys of a and b; chat top-row filter with `message.files = [a, b, pdf]` (by `url`) → only the pdf; with no output → all three; channel row with files whose `url` equals their `id` → filtered by `id` (red before).

Non-goals: agent-drawn charts written to the sandbox (#938, which reuses the `image` display item); MCP image files inside a collapsed group; changing the backend.

Review focus: exactly-once invariant across the two render sites; legacy messages unchanged; no change to grouping of non-image items; minimal diff to `ResponseMessage.svelte`.
