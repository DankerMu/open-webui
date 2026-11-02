## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review (revise twice, applied; pass; the preset change is the owner's); `openspec validate webui-image-aspect-ratio --strict --no-interactive`.

## 2. Risk packs

- **Public API** — selected: the tool signature the model sees gains one optional argument. Evidence a, c.
- **Config** — selected: a reserved key inside existing JSON. Evidence a, b.
- **Legacy compatibility** — selected: an empty table or no argument behaves as today. Evidence a, b.
- **Error handling** — selected: an unknown ratio makes no request. Evidence a.
- **Auth, Schema, File IO, Concurrency, Resource limits, Release, Documentation** — not selected: no permission or schema change, no new IO, no shared state. The runbook carries the table at packaging, task 4.

## 3. Evidence

- a. Tool tests, with `image_generations` mocked:
  - table `{"1:1": "2048x2048", "16:9": "2752x1536"}`, `aspect_ratio="16:9"`: the form's `size` is `2752x1536`;
  - no argument: `size` is `None`, so `IMAGE_SIZE` applies;
  - `aspect_ratio` given with table `{}`: `size` is `None`, and generation proceeds;
  - no `aspect_ratio_sizes` key stored: `1:1` gives `2048x2048`, `4:3` `2400x1792`, `3:4` `1792x2400`, `3:2` `2528x1696`, `2:3` `1696x2528`, `16:9` `2752x1536`, `9:16` `1536x2752`, each width and height divisible by 32;
  - engines `comfyui`, `automatic1111` and `gemini`: `16:9` and `5:4` both leave form `size` `None` with no error;
  - params `None` and `''`: `9:16` uses the preset, and no argument leaves `size` `None`; a non-mapping `aspect_ratio_sizes` makes the table empty;
  - an edited table replaces the preset entirely: with `{"16:9": "1920x1088"}`, `"16:9"` gives `1920x1088` and `"1:1"` is an unknown ratio;
  - unknown ratio `"5:4"`: the returned JSON has an error naming `1:1` and `16:9`, and `image_generations` is not called;
  - whitespace around the ratio is ignored.
- b. Request tests on the `openai` engine: with params `{"num_inference_steps": 40, "aspect_ratio_sizes": {...}}`, the posted JSON has `num_inference_steps` and no `aspect_ratio_sizes`, red before the change, and the stored config still holds the table afterwards; `size` from the form wins over `IMAGE_SIZE`, a regression guard;
  - params `None` and `''`: the request still posts, with no `aspect_ratio_sizes`;
  - `GET /api/v1/images/config` with no stored key returns the preset under `aspect_ratio_sizes` without writing the database, and with params `{"num_inference_steps": 40}` keeps that key too;
  - `POST /api/v1/images/config/update` with an edited table, and separately with `{"aspect_ratio_sizes": {}}`: a following GET returns exactly what was saved, and the tool, with configuration not mocked, uses it;
  - a non-dict params value is returned unchanged by GET.
  - params `{"size": "1024x1024", "aspect_ratio_sizes": {"16:9": "2752x1536"}}`: form `size` `2752x1536` posts `2752x1536`, red before the change; form `size` `None` posts `1024x1024`; neither posts `aspect_ratio_sizes`, and neither writes it to file metadata;
  - `get_builtin_tool_spec(generate_image)`: `aspect_ratio` is an optional string with a non-empty description, and `required == ['prompt']`.
- c. The orchestrator's mock gateway against a running backend, with `IMAGE_SIZE` `2048x2048` and no stored table: a model tool call with `aspect_ratio: "9:16"` posts `size: 1536x2752`; a call with no argument posts `2048x2048`.

## 4. Package

- [x] 4.1 `DEPLOY-AGENT.md` gets the preset, how to edit it, the three rules in `design.md` Sibling surfaces, and the `IMAGE_SIZE` guidance when the release is packaged. Done in the 2026-11-02 package `zhice-deploy-1c378fa`, section 7A.
