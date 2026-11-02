## Why

(#690.) The site's image model offers seven official sizes by aspect ratio. Open WebUI's built-in `generate_image` takes only a prompt (`backend/open_webui/tools/builtin.py:369`), and the size comes from the single admin `IMAGE_SIZE`, so the model cannot honour "draw a 16:9 picture".

## What Changes

- `generate_image` gains an optional `aspect_ratio` argument.
- The seven official sizes ship as a preset: one constant in `utils/images/aspect_ratio.py`, used when `IMAGES_OPENAI_API_PARAMS` (Settings > Images) has no reserved key `aspect_ratio_sizes`. An admin edits the table by saving that key; saving it as `{}` turns selection off.
- `GET /api/v1/images/config` shows the preset under that key when none is stored, so a deployment whose database is already seeded sees it in the admin field and can edit it. A code fallback, not a seed, because a seeded row would never receive it.
- `routers/images.py` removes the key before posting, through a helper in the same module, so the service never receives it.
- With no argument, or with an empty table, the size stays `IMAGE_SIZE`. Only the `openai` engine uses the table; other engines ignore the argument.
- A size chosen for a call beats a `size` in the params JSON, which today silently overrides it (`images.py:640,652`). With no size chosen, a `size` in the params still beats `IMAGE_SIZE`, as today. A direct `POST /api/v1/images/generations` with both `size` and a params `size` changes accordingly.
- A ratio missing from the table returns an error listing the configured ratios, with no service request, because a generation takes minutes.

## Non-Goals

- No new config key, admin field or migration.
- No ratio control in the chat input.
- `edit_image` and the `legacy` function-calling path are unchanged.

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent
Blast radius: one builtin tool and one request body; a leak of the reserved key would be rejected by a strict image service
Selected risk packs: Public API (model-visible tool signature; `image_generations` has three callers), Config, Legacy compatibility, Error handling
Evidence floor: pytest for the tool and the request body; make lint-scoped; make coverage-gate; make smoke; the mock gateway run
```

## Capabilities

### New Capabilities

- `webui-image-aspect-ratio`: the built-in image tool selects a size by aspect ratio from an editable table.

## Impact

New `backend/open_webui/utils/images/aspect_ratio.py` holds the preset and logic, with a paired test file. `backend/open_webui/tools/builtin.py` and `backend/open_webui/routers/images.py` carry call-only hooks: both are over the 800-line limit, so `constraints.yaml` gains owner-approved bounded overrides at their new line counts.
