# Spec Delta

## Purpose

A sandbox kit with which a weak chat model makes a narrated Chinese science-explainer video. The model writes one validated data file, and prebuilt, user-approved scenes render it offline.

## ADDED Requirements

### Requirement: Kit commands have one invocation and refuse to overwrite

The kit SHALL be invoked as `node /opt/remotion-template/bin/kit.mjs new <name>` to create a project, and as `node bin/kit.mjs <subcommand>` inside the project for every other step.

The new-project command SHALL:

- create `/home/assistant/videos/<name>`, where `<name>` matches `^[a-z0-9][a-z0-9-]{0,39}$`;
- fill it with the template sources, a symlink to the shared read-only `node_modules` and an example `script.json`;
- fail without changing anything when the target directory exists and is not empty, including an old Remotion project without a `script.json`.

The example `script.json` SHALL pass the schema unchanged.

The kit SHALL use only packages already installed in the template and SHALL need no network at any step.

#### Scenario: New project offline

- **WHEN** the model runs the new-project command for `water-cycle` in a sandbox without network
- **THEN** `/home/assistant/videos/water-cycle` holds the template sources, the shared `node_modules` link and an example `script.json` that passes the schema
- **AND** no package is installed and no network request is made

#### Scenario: Non-empty target is refused

- **WHEN** the target directory already holds any file, for example an old project's `src/Root.tsx`
- **THEN** the command fails naming the directory and changes nothing

### Requirement: The model writes only script.json

An explainer video SHALL be fully described by `script.json`, validated against a published schema, at 1920×1080 and 30 fps.

The script SHALL hold:

- a title;
- a music choice: a library track id or `none`;
- exactly one `hook` scene first;
- three to five chapters, each with a name of at most 6 characters and one to four scenes;
- exactly one `summary` scene, then exactly one `end-card` scene last.

Every scene except `end-card` SHALL carry narration as one to four sentences. Each sentence is a list of one to four caption blocks of at most 16 characters each. The `end-card` scene MAY have no narration.

A scene MAY name an image as a plain file name. It is resolved inside the project's `public/images/`, and names with a path separator or `..` are rejected.

The body scene kinds SHALL be the approved subset of this candidate set:

- question;
- concept card;
- process steps;
- cause and effect;
- comparison;
- timeline;
- key number;
- chart (bar or line);
- image with callouts;
- definition or quote.

`hook`, `summary` and `end-card` are required kinds.

A video SHALL hold at most one `custom` scene. It names a component file under the project's `src/custom/`, which the model writes, and it carries narration like any body scene.

The schema SHALL be available to the model as JSON Schema from inside the sandbox.

#### Scenario: Invalid script fails before rendering

- **WHEN** `script.json` is empty, is not JSON, has zero or six chapters, has a chapter with no scene, has a sentence with no caption block, lacks the hook, summary or end card, has an unknown kind, a missing field, a caption block over 16 characters, a chapter name over 6 characters or a body scene without narration
- **THEN** every kit command that reads the script fails before any frame is rendered
- **AND** the message names the chapter, the scene, the field and the limit

#### Scenario: Image path escape is refused

- **WHEN** a scene's image is `../x.png` or `a/b.png`
- **THEN** schema validation fails naming the scene and the field

#### Scenario: Second custom scene is refused

- **WHEN** `script.json` holds two `custom` scenes
- **THEN** validation fails naming both scenes

### Requirement: Narration audio is bound to its text

The speech-call command SHALL list one `generate_speech` call per caption block, giving the block text, the voice, the voice instructions and a target file name. The target file name carries a short hash of the block text, the voice and the voice instructions.

The voice-import command SHALL copy each block's audio from `/mnt/user-data/files/` into the project's `public/voice/` under its target name. It accepts the numbered-suffix names `generate_speech` produces for an existing name.

The timeline command SHALL fail naming the block when a block's audio is missing, or when its recorded hash does not match the block's current text, voice and voice instructions.

#### Scenario: Edited text needs new audio

- **WHEN** a caption block's text, voice or voice instructions change after its audio was imported
- **THEN** the timeline command fails, naming that block and its new target file name

#### Scenario: Suffixed speech file is imported

- **WHEN** `generate_speech` wrote `s1-0-0-ab12cd34 (2).wav` for target `s1-0-0-ab12cd34.wav`
- **THEN** the voice-import command places it as `public/voice/s1-0-0-ab12cd34.wav`

### Requirement: Narration drives the timeline

The timeline command SHALL build `timeline.json` and one narration track from the imported audio:

- leading and trailing silence trimmed;
- block durations measured from decoded audio;
- gaps of 0.06 s between blocks of one sentence, 10 frames between sentences, 20 frames at scene end and 45 frames before a chapter, plus a 40-frame lead-in and a 90-frame tail;
- the narration track loudness-normalized to -16 LUFS.

A scene SHALL last as long as its narration plus gaps, or the scene component's minimum length, whichever is longer.

The 90-frame tail SHALL be the closing part of the `end-card` scene, so an `end-card` without narration lasts exactly 3 seconds.

Every scene boundary SHALL carry one theme transition of 15 frames. The transition lies entirely inside the gap after the outgoing scene's last caption block (20 or 45 frames), so no narration plays under a transition and transitions do not change the total length.

The total length SHALL be between 60 and 180 seconds, or the timeline command fails stating the length and the bound.

The model SHALL NOT write frame numbers.

#### Scenario: Timeline from narration

- **WHEN** every block's audio is imported and the timeline command runs
- **THEN** every caption block has start and end frames that match its trimmed audio within one frame
- **AND** every scene's length equals the larger of its narration plus gaps and its component minimum

#### Scenario: Transitions sit in gaps

- **WHEN** a timeline is built for a script with three chapters
- **THEN** every transition's 15 frames fall inside the gap after the outgoing scene's last block
- **AND** the rendered length equals the timeline's total length

#### Scenario: Too long

- **WHEN** the measured total exceeds 180 seconds
- **THEN** the timeline command fails, stating the measured length and the 180-second bound, and writes no timeline

### Requirement: Scenes render Chinese text within bounds

Every kit scene SHALL use the preset theme's colours, type sizes, spacing and motion constants. It SHALL use no system font stack, remote font or remote asset.

In every probe frame, Chinese text SHALL satisfy these rules. The probe frames are, for each scene, the frame where its entrance ends, its midpoint, and the frame before its exit.

- The rendered text equals the input text.
- Every text box stays inside the theme's safe area, does not scroll horizontally, and is at or above the theme's minimum type size.
- No line starts with `，。！？、；：）」』`.
- Masks enclose the glyph boxes they reveal.

Numbers SHALL be formatted with 万 and 亿.

Captions SHALL show one caption block per page, timed to that block's audio.

#### Scenario: Long Chinese text stays inside the safe area

- **WHEN** every text field of a scene holds Chinese text at its schema maximum
- **THEN** every probe frame of the scene satisfies the text rules

#### Scenario: Line-start punctuation

- **WHEN** a concept-card point wraps exactly before a `，`
- **THEN** the `，` stays at the end of the previous line

#### Scenario: Number formatting

- **WHEN** a key-number scene shows `12345` and `123456789`
- **THEN** they render as `1.2万` and `1.2亿`, and `9999` renders unchanged

#### Scenario: Captions page by block

- **WHEN** a scene's narration has three caption blocks
- **THEN** the captions show three pages, each holding one block's full text during that block's audio

### Requirement: Kit check enforces mechanical rules before rendering

The kit check SHALL run in the background, log its progress, and report its outcome through the kit status command.

It SHALL fail on any of these:

- a schema violation;
- a probe frame that breaks the text rules;
- a key reveal followed by less than 1 second of rest, or a batch entrance followed by less than 0.5 seconds;
- a stretch of more than 3 seconds without narration, outside the lead-in, the tail and the `end-card` scene;
- a scene whose length disagrees with the timeline;
- a missing image, font, voice or music file;
- a music track shorter than the video that is not a loop track;
- more than one `custom` scene.

When the mechanical stage passes, the check SHALL write one 2×2 contact sheet of key frames into the project and print a fixed yes/no checklist. The model answers the checklist from that image.

The final-render command SHALL refuse to start until a check has passed for the current `script.json`, `timeline.json` and project sources.

#### Scenario: Overflow fails the check

- **WHEN** a custom scene renders text beyond the safe area
- **THEN** the check fails, naming the scene and the probe frame, and no contact sheet is written

#### Scenario: Render requires a passing check

- **WHEN** `script.json` or a project source changed after the last passing check
- **THEN** the final-render command fails and says to run the check again

#### Scenario: Check outlasts a tool call

- **WHEN** a full-length script is checked on 2 CPUs
- **THEN** the check command returns at once
- **AND** the status command reports running, passed or failed, and the failure reasons when it failed

### Requirement: Final render publishes only a complete file

The final-render command SHALL start the full render in the background and return at once. It SHALL render to a file inside the project, and verify that file with `ffprobe` as H.264 with yuv420p and AAC audio at the timeline's duration. Only then SHALL it move the file atomically to `/mnt/user-data/files/<name>.mp4`.

The audio SHALL mix the narration with the selected music. A music choice of `none` gives narration only.

The status command SHALL distinguish running, succeeded, failed with an exit code, and died without an exit code.

On failure, `/mnt/user-data/files/<name>.mp4` SHALL be left as it was. A render relaunched after a death SHALL reuse the last passing check.

#### Scenario: Background render completes

- **WHEN** a checked project is rendered
- **THEN** the command returns before the render ends
- **AND** on success `/mnt/user-data/files/<name>.mp4` plays with the timeline's duration

#### Scenario: Killed render leaves no partial file

- **WHEN** the render process is killed mid-way, as by an idle stop
- **THEN** the status command reports it died without an exit code
- **AND** `/mnt/user-data/files/<name>.mp4` is absent, or still holds the previous complete render

### Requirement: Components enter the kit only after recorded user approval

Every candidate scene component and, until the theme pick, both theme candidates (light and dark) SHALL have a rendered sample in a gallery the user reviews. A sample is a short clip and key frames, rendered in the workspace image.

The user's decision per component and the theme pick SHALL be recorded in a tracked approvals file. Each entry names the component, the decision (`approve`, `redo` or `drop`), the reviewer and the date, and links the user's own export or message.

The unpicked theme SHALL be removed from the kit, and the kit SHALL render with the picked theme only.

These SHALL each equal the approved set in the approvals file:

- the schema's kinds;
- the component registry;
- the JSON Schema;
- the example script, which uses every approved kind that needs no image, and no other kind;
- the skill's kind list.

`redo` counts as not approved until a later approval entry replaces it. A required kind (`hook`, `summary`, `end-card`) SHALL NOT ship unapproved.

#### Scenario: Unapproved component is absent

- **WHEN** the approvals file marks the chart component `drop`
- **THEN** `chart` is absent from the schema, the registry, the JSON Schema, the example script and the skill text

#### Scenario: Theme pick recorded

- **WHEN** the approvals file's theme entry is `light`
- **THEN** the kit's themes hold only `light`, and the explainer renders with it

#### Scenario: Required kind not approved

- **WHEN** the end-card component is marked `redo`
- **THEN** the kit's static test fails, naming the required kind

### Requirement: The video skill routes explainers to the kit

With the video switch on, the `remotion` skill's entry file SHALL tell the model to make science explainers in this order:

1. new project;
2. write `script.json`;
3. generate illustrations with the existing image tool, then import them with the kit;
4. speech calls, then voice import;
5. timeline;
6. check and status;
7. answer the checklist. On any "no", fix the script and check again;
8. render and status.

It SHALL say that course, promo and report videos keep the existing workflow, and that the vendored Remotion guidance is read only for a `custom` scene.

The entry file SHALL be at most 80 lines. Render mechanics and failure handling SHALL live in a reference file.

This requirement supersedes, for science explainers, the skill rule of the never-archived local `ocu-video-production` draft that renders must be run through `npx --no-install`.

#### Scenario: Explainer request

- **WHEN** a user asks for a science-explainer video with the video switch on
- **THEN** the skill entry lists the kit steps above in that order, within 80 lines

### Requirement: Third-party sources carry their notices

Every ported component and borrowed format SHALL be listed in the repository's third-party notices with its source, commit and licence. This applies from the change that first brings it in. The sources are:

- MIT: Onda, RenderComp, Remocn, remotion-bits;
- Apache-2.0: video-shotcraft;
- PolyForm Noncommercial 1.0.0: video-talkcraft, anything2explainer, with each project's Required Notice line kept verbatim.

#### Scenario: Notice coverage

- **WHEN** the notices are checked against the kit's source headers
- **THEN** every source named in a kit file header appears in the notices with its licence
