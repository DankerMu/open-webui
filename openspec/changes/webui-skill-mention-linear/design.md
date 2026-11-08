## Design

Change surface: `backend/open_webui/utils/middleware.py`. Only the two pattern literals change (`:2271`, `:2293`). Tests go in the new module `backend/open_webui/test/utils/test_skill_mention_patterns.py`.

Must preserve. Each case gives the same result on `main` @ `e5da5be3b` and after the fix (measured with both pattern pairs, 2026-11-08):

| Input text                        | `extract_skill_ids_from_messages` | `strip_skill_mentions` result |
| --------------------------------- | --------------------------------- | ----------------------------- |
| `<$skill-a>`                      | `{'skill-a'}`                     | `''`                          |
| `<$skill-a\|Label A>`             | `{'skill-a'}`                     | `'Label A'`                   |
| `</skill-b\|Label B>`             | `{'skill-b'}`                     | `'Label B'`                   |
| `a <$x\|X> b </y\|Y> c`           | `{'x', 'y'}`                      | `'a X b Y c'`                 |
| `<$a\|>` and `</a\|>`             | `{'a'}`                           | `''`                          |
| `<$a\|多 字>`                     | `{'a'}`                           | `'多 字'`                     |
| `<$a\|x>y>`                       | `{'a'}`                           | `'xy>'`                       |
| `<$Bad\|B>` (uppercase id)        | `set()`                           | unchanged                     |
| `</x>` (slash form without label) | `set()`                           | unchanged                     |

- Both content shapes are covered: string content, and list content with `{'type':'text'}` parts. Non-text parts are left as they are.
- The #751 pin module `test_ocu_skill_mention_fallback.py` stays green unchanged.

Must change:

- In both patterns, the label class `[^>]*` becomes `[^<>]*`. Nothing else in `middleware.py` changes.
- A label containing `<` is no longer matched: `<$b|c<d>` gives `set()` and the text unchanged. On `main` it gives `{'b'}` and `'c<d'`.
- For nested starts, `<$a|x<$b|y>` gives `{'b'}` and `'<$a|xy'` (on `main`: `{'a'}` and `'x<$b|y'`).

Why the `<` change is acceptable, settled from code:

- The editor already drops such labels. `RichTextInput.svelte:499-500` re-parses a saved mention after HTML-escaping the line, with the label class `([^&]*?)`. A label holding `<`, `>` or `&` therefore never round-trips as a mention today.
- A label holding `>` already breaks the backend patterns on `main`.
- A native skill's `name` is not validated on create; only the id is (`routers/skills.py:169-174`, `[a-z0-9_-]+`). That gap is existing behaviour and out of scope.
- Uploaded OCU skill names match `[a-z0-9][a-z0-9-]{0,63}` (`utils/ocu_skill_zip.py:22`), so `<` cannot occur in them.
- OCU's filter uses the same `[^<>]*` label class (DankerMu/open-computer-use#223), so both sides agree on which markers exist.

Governing invariant: the cost of one scan of either pattern grows linearly with the text length, whatever the text holds.

Sibling surfaces:

- The callers `extract_skill_ids_from_messages` (`:2284-2290`, called at `:2732`) and `strip_skill_mentions` (`:2296-2311`, called at `:2807`) are unchanged.
- Out of scope, not evaluated, as #769 states:
  - the frontend `src/lib/utils/marked/mention-extension.ts:43` (anchored, runs in the browser);
  - the `<details>` pattern at `middleware.py:3689` (applies to model output).
- Rebase note: upstream `dev` has moved both patterns to `backend/open_webui/utils/skills.py`, still with `[^>]*`. A rebase conflicts on these two lines, and the same class change must be carried to the new location.

Seams under test: `middleware.extract_skill_ids_from_messages(messages)` and `middleware.strip_skill_mentions(messages)`, called directly on plain dict messages. There is no app, DB, or network.

Required evidence (task 1.1).

- **Linear scan.** Red on `main`, green after.
  - Inputs: `"<$ocu--a|" * 10000` (90 KB) and `"</a|" * 20000` (80 KB), each as string content, and `"<$ocu--a|" * 10000` as one list text part.
  - Time one call of each function on each input with `time.perf_counter`, and assert each call takes under 0.25 s.
  - On `main` these calls take about 3 s (`$` form) and about 2.4 s (`/` form). The fixed patterns take about 1 ms, which leaves a margin of about 250× under the bound.
  - Assert the content is unchanged after `strip_skill_mentions`.
- **Must-preserve table.**
  - Every row above is a parametrized case.
  - It asserts both the extracted id set and the stripped text.
  - Rows run on string content, and the `<$skill-a|Label A>` and mixed rows also run as list text parts beside an `image_url` part, which must stay unchanged.
  - Green on `main` and after.
- **Changed behaviour.** Red on `main`, green after:
  - `<$b|c<d>` gives `set()` and an unchanged text;
  - `<$a|x<$b|y>` gives `{'b'}` and `'<$a|xy'`.
- `test_ocu_skill_mention_fallback.py` passes unchanged.
- `git diff --stat origin/main -- backend/open_webui/utils/middleware.py` shows `1 file changed, 2 insertions(+), 2 deletions(-)`.

Verification: the new pytest module, the #751 pin module, `make lint-scoped`, `make fmt-check`, and `make smoke` (the Critical Paths row for `middleware.py`).

Non-goals:

- validating native skill names;
- the gateway `client_max_body_size`;
- moving `process_chat_payload` work off the event loop;
- the frontend marked extension;
- the `<details>` pattern;
- #771 (the `<@…>` serialization of native `/` mentions).

Review focus:

- only the two class literals change;
- the timing test is red on `main` (at least 9× over the bound) and does not flake (about 250× under it after the fix);
- the must-preserve rows really are identical old and new.
