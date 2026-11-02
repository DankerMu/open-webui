Change surface: `generate_image` in `tools/builtin.py`; `image_generations` and the config read route in `routers/images.py`; logic in the new `utils/images/aspect_ratio.py`.

Must preserve:

- `image_generations` callers: the `/generations` route, the tool (`builtin.py:389`) and the legacy path (`middleware.py:1931`).
- With no size chosen, precedence stays params `size`, then `IMAGE_SIZE`.
- Gemini, ComfyUI, Automatic1111 and `image_edits` do not read these params; none changes.
- `Images.svelte` round-trips nested JSON (`:142-146,271-274`); no UI change.

Must add/change:

- One constant holding the seven sizes:

  | Ratio | Size      |
  | ----- | --------- |
  | 1:1   | 2048x2048 |
  | 4:3   | 2400x1792 |
  | 3:4   | 1792x2400 |
  | 3:2   | 2528x1696 |
  | 2:3   | 1696x2528 |
  | 16:9  | 2752x1536 |
  | 9:16  | 1536x2752 |

- One helper returning the effective table: the stored mapping when the key exists, else the constant. A params value that is not a dict counts as no key, and is otherwise left as it is. An `aspect_ratio_sizes` value that is not a mapping counts as empty.
- The tool applies the table only when `IMAGE_GENERATION_ENGINE` is `openai`. On any other engine it ignores `aspect_ratio`, because the tool registers whatever the engine is (`utils/tools.py:689-696`) and ComfyUI and Automatic1111 take width and height from the form size.
- The config read route tests for the key, not its truthiness: `Images.svelte:136-146` saves back the whole displayed value, so showing the preset for a stored `{}` would turn selection back on at the next unrelated save. A non-dict params value is returned unchanged.
- The reserved key is removed where `data` is built, not only from `json=`, because `data` also reaches file metadata (`:676`).
- The request's `size` is applied after the params merge, when the form carries one.
- The config read route shows the effective table without writing to the database.
- The tool's docstring documents `aspect_ratio`, because the model-visible spec is generated from the signature and docstring (`utils/tools.py:869-911`).

Governing invariant: the size a call chose is the size the service receives, and the reserved key never leaves WebUI.

Sibling surfaces:

- Stored file metadata: covered above.
- `edit_image`: uses its own config; none.
- `legacy` function calling passes no ratio; none.
- A preset applies to any `openai` model until an admin saves a table. Any save on the image settings page stores the displayed table, so later changes to the constant no longer reach that deployment. Clearing the whole field brings the preset back; turning selection off takes `{"aspect_ratio_sizes": {}}`. The runbook states all three.

Seams under test: the tool with `image_generations` mocked; `image_generations` with the HTTP session mocked; the config route.

Required evidence: `tasks.md` §3.

Non-goals: as in the proposal.

Review focus:

- Size precedence in all four combinations of form and params.
- Non-`openai` engines and non-dict params behave as today.
- No path sends or stores the reserved key in a request or file metadata.
- Reading config writes nothing.
