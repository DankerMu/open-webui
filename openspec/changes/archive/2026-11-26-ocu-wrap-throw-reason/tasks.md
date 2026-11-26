## 1. Name unwrappable text in kit check (#924)

- [x] 1.1 Map `wrapLines`' two `RangeError`s in `probeRule`'s catch to a reason naming the scene, field and text. Verify with pure tests that inject the probe error, and with one in-image `kit check` on a script whose chart label throws.

  **Task 1.1 required evidence** (issue #924):
  - **Fixture level:** compact (override: the legacy pack is selected only to keep the existing probe reasons byte-identical; no format, entrypoint or state changes). One catch block in one function, after the existing `unknown scene` mapping.
  - **Risk packs:**
    - **Error handling:** selected. A new reason text for a failure that today surfaces raw.
    - **Legacy compatibility:** selected. The `unknown scene` mapping and the `probe: <message>` fallback keep their exact output, and the tests at `tests/check-rules.test.mjs:428-457` are unchanged.
    - Every other pack is not selected. No `src/`, schema, CLI, file or concurrency change.
  - **Checked by the fixture review.**
    - **Message path.** Remotion 4.0.537 keeps the `wrapLines` message verbatim, with `RangeError: ` stripped, after `kit probe: target "<id>" frame <n>: ` (`renderFailure`, `handle-javascript-exception.js`). `tests/render/probe.test.mjs:354-362` shows the same shape for a throwing scene.
    - **Every scene text is a `content` string leaf.** Each `Lines` text in `src/kit/scenes/*.tsx` is one, including `ImageCallouts` labels, `CauseEffect` and `Timeline` fields, and both chart layouts. The only derived texts are numbers, which cannot reach either throw.
  - **Shape** (`bin/check-rules.mjs`, `probeRule`'s catch, after the `unknown scene` match):
    - **Matching.**
      - The text: `opening marks of ("(?:[^"\\]|\\.)*") fill maxWidth (\d+)`, or `piece ("(?:[^"\\]|\\.)*") is wider than maxWidth (\d+)`, matched as a substring.
      - The target, when present: `target ("(?:[^"\\]|\\.)*") frame`.
      - Each quoted capture is decoded with `JSON.parse`, because `renderFailure` and `wrapLines` build them with `JSON.stringify`. If any parse fails, the reason falls back to `probe: <message>`.
    - **Locating.**
      - **With a target:** only that scene is searched. The probe mounts one target per frame, so the text can only come from it. A target that names no scene falls back to `probe: <message>`; it does not widen the search.
      - **Without a target:** every scene is searched in playback order.
      - **Skipped scenes:** a scene without `props.content` (custom) is skipped, never walked.
      - **Within a scene:** its `props.content` string leaves are walked in field order. The first leaf whose value contains the text is named; the unit or piece is a substring of its field, because `units()` joins back to its input.
      - **No leaf:** if no leaf holds the text, the reason is `probe: <message>`, byte-identical to today.
    - **Known limit, recorded and pinned.** If two fields of one scene both hold the text, the first in field order is named. For example, a chart `title` `（（（（甲乙增长` before a label `（（（（甲乙`. A pure case pins this behavior.
    - **Reason.** The form is `<where>: <field> "<value>" cannot be wrapped in <n> characters: <cause>; shorten that run`.
      - `<field>` comes from `fieldPath`, prefixed `content.`.
      - `<value>` is the field's full value through `escapeLine` (exported by `bin/script-schema.mjs`), not cut: field values are at most 40 code points and hold no control characters.
      - `<cause>` for the opening-marks throw is `its leading opening marks or spaces fill the line`.
      - `<cause>` for the piece throw is `one character with its punctuation marks is wider than the line`.
  - **Required evidence.**
    1. **Red first.**
       - The in-image case below runs on OCU `main` at `bce4aef` first. Record its raw `probe:` reason line verbatim.
       - The pure tests in `tests/check-rules.test.mjs` inject probe errors built from that line and from the shapes below. They expect the named reasons, so on `bce4aef` they fail with the `probe: …` reason.
    2. **Pure cases**, through `probeRule` with an injected `probe`:
       - **Opening marks, chart label.** `kit probe: target "<where>" frame 15: opening marks of "（（（（甲乙" fill maxWidth 4` for a chart label maps to that scene and `content.points[<i>].label`. The recorded in-image line is used verbatim as one more case.
       - **Opening marks, hook title.** The same throw for the hook's top-level leaf `content.title`.
       - **Piece, chart label.** `piece "（（（（甲" is wider than maxWidth 4` for the label `，（（（（甲`.
       - **Piece, closing marks.** One character followed by 10 or more `）`, for example `甲））））））））））`, at maxWidth 8 maps to its field.
       - **Nested non-chart path.** `content.steps[<i>].label` or `content.events[<i>].year`.
       - **No target.** The text is in a later scene, and the walk passes the fixture script's custom scene without throwing.
       - **The target restricts the search.** The same text is in two scenes and `target` names the second, so the second is named. With `target` naming a scene that holds no such leaf, the reason is the `probe:` fallback.
       - **Escapes.** A target `where` containing `"` decodes, and a text containing `"` or `\` decodes and is found.
       - **Known limit.** The two-fields case above names the first field.
       - **No match.** A text no field holds stays `probe: <message>`.
       - **Existing tests.** The `unknown scene` and fallback tests pass unchanged.
    3. **In-image** (`tests/render/check.test.mjs`).
       - **Setup.** The case copies the tracked `src/kit/render/registry.ts`, as tests 4 and 5.4 do, and starts from `checkScript(edit)`. It adds one line chart with 8 points, no image, and the label `（（（（甲乙`. Before `kit timeline` runs, it writes tone WAVs for the new chart scene's narration stems, as the 5.4 test does. It then regenerates `timeline.json` with `kit timeline`.
       - **Run.** It drives `kit check` through `startCheck`/`settled`.
       - **Expected.** The check fails with that scene's named reason, and no reason starts with `probe:`.
       - **Not skipped.** It runs by default, not behind `TIMING_SKIP`/`KIT_TIMING`.
       - **Image.** Build the workspace image from a clean `--no-local` clone at the head with `docker build --platform linux/amd64`. Run the red at `bce4aef` in an image built from that commit, or record why the head image with the old `check-rules.mjs` stands in. Record the digests and results.
    4. **Mutations**, each on a copy and then reverted:

       | Mutation                                 | Expected red                 |
       | ---------------------------------------- | ---------------------------- |
       | the opening-marks match removed          | the opening-marks pure cases |
       | the piece match removed                  | the piece pure cases         |
       | the target restriction removed           | the two-scene case           |
       | `JSON.parse` replaced by the raw capture | the escape cases             |

    5. **Green.** Pure template tests in a frozen `npm ci` tree under Node 22.23.2, run from both roots.

  - **Must preserve.**
    - The only files that change are `bin/check-rules.mjs`, `tests/check-rules.test.mjs` and `tests/render/check.test.mjs`.
    - `src/**`, the schema, `script.schema.json`, the skills and every other `bin/` file stay byte-identical.
    - Every existing reason stays byte-identical.
  - **Non-goals:**
    - **Changing `wrapLines`.** Its throws guard the line contract.
    - **Narration captions** (`src/kit/render/Captions.tsx`, `LINE_WIDTH` 16). A caption block holds at most 16 characters (`LIMITS.block`), and every character is 1 em wide, so its core never exceeds 16. Neither throw can happen.
    - **A schema rule against such runs.**
    - #926.

  - Amended after OCU #274 (2026-11-26, merged `2de3c72`, reviewed head `c04d3c4`):
    - **Red.** Image `sha256:def09b04…`, built at `bce4aef`, gave the raw reason `probe: kit probe: target "chapter 3 应用, scene 2 (chart)" frame 15: opening marks of "（（（（甲乙" fill maxWidth 4`, which is reused verbatim as a pure case. On the old `check-rules.mjs`, pure tests 37-46 failed (10 of 65).
    - **Mutations.** All four rows went red. The `JSON.parse` row used `capture.slice(1, -1)`, because a capture that keeps its quotes turns every case red.
    - **Green.** Pure tests 622/622 from both roots. In image `sha256:4e4b2cdb986bf40452ceb8d5b73b0407f628ef7bdc96d383b9e341ea76f6325a`, `tests/render/check.test.mjs` gave 16 pass, 0 fail, 2 skipped by `KIT_TIMING`. The new case names `content.points[2].label`.
    - **Deviations.**
      - The helpers sit above `probeRule`.
      - The in-image case writes tones for every stem, because the new scene renumbers later stems.
      - Two extra fallback cases: an unparsable escape, and a target that names no scene.
    - **Review.** One seat, no findings.

Suggested fixture level: compact - one catch block with pure tests and one in-image case.
Minimal mergeable slice: atomic.
