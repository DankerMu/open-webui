## Why

Some schema-valid scene text makes `wrapLines` (OCU `remotion-template/src/kit/text.ts:217,223`) throw `RangeError`. The two throws are:

- `opening marks of "<unit>" fill maxWidth <n>`;
- `piece "<piece>" is wider than maxWidth <n>`.

Where it happens:

- The throw happens in the browser while `kit check`'s probe renders the scene.
- `probeRule` (`bin/check-rules.mjs`) then reports `probe: kit probe: …<RangeError text>`.
- That reason names neither the scene nor the field, and does not say what to change.

The epic's reviews recorded these inputs four times (in the 4.2, 4.3, 4.4 and 4.6 notes) plus once in #893, and never filed them. This change closes (#924).

## What Changes

`probeRule`'s catch already maps one probe error, `unknown scene`, to a scene. It now also maps the two `wrapLines` throws:

- It parses the quoted text and the width from the message.
- It finds the field: in the scene the message's `target "<where>"` names, or in every scene when the message names none.
- It reports `<where>: <field> "<value>" cannot be wrapped in <n> characters: <cause>; shorten that run`.
- When no field holds the text, the reason stays `probe: <message>`, as today.

`wrapLines` itself does not change. Its two throws guard the line contract ("no line ends with an opening mark"), and it has no line that meets that contract for these inputs. No file under `src/` changes, so no rendered frame or approval changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-video-explainer-kit`: `kit check` reports text that cannot be wrapped as a reason naming its scene and field.

## Impact

- **OCU files changed:**
  - `remotion-template/bin/check-rules.mjs` (`probeRule`'s catch);
  - `remotion-template/tests/check-rules.test.mjs`;
  - `remotion-template/tests/render/check.test.mjs`.
- **Not changed:** `src/**` (including `text.ts`, `Captions.tsx` and every scene), the schema and the skill text.

## Triage

```text
Issue type: bugfix (error reporting)
Fixture level: compact (legacy pack selected only to keep existing reasons byte-identical)
Upstream suggested level: absent (issue says Size S–M)
Blast radius: kit check gives an unactionable reason for some schema-valid text
Selected risk packs: Error handling; Legacy compatibility (existing probe error mapping)
Evidence floor: pure probeRule tests with injected probe errors; one in-image check run on a real throwing input
```

No `design.md`: this is a compact fixture.
