# Spec Delta

## MODIFIED Requirements

### Requirement: Kit commands have one invocation and refuse to overwrite

The kit SHALL be invoked as `node /opt/remotion-template/bin/kit.mjs new <name>` to create a project, and as `node bin/kit.mjs <subcommand>` inside the project for every other step.

The new-project command SHALL:

- create `/home/assistant/videos/<name>`, where `<name>` matches `^[a-z0-9][a-z0-9-]{0,39}$`;
- fill it with the template sources, a symlink to the shared read-only `node_modules` and an example `script.json`;
- fail without changing anything when the target directory exists and is not empty, including an old Remotion project without a `script.json`.

The example `script.json` SHALL pass the schema unchanged.

The kit SHALL use only packages already installed in the template, plus the workspace image's `python3` and `openpyxl` for `kit data`, and SHALL need no network at any step.

#### Scenario: New project offline

- **WHEN** the model runs the new-project command for `water-cycle` in a sandbox without network
- **THEN** `/home/assistant/videos/water-cycle` holds the template sources, the shared `node_modules` link and an example `script.json` that passes the schema
- **AND** no package is installed and no network request is made

#### Scenario: Non-empty target is refused

- **WHEN** the target directory already holds any file, for example an old project's `src/Root.tsx`
- **THEN** the command fails naming the directory and changes nothing

### Requirement: Scenes render Chinese text within bounds

Every kit scene SHALL use the preset theme's colours, type sizes, spacing and motion constants. It SHALL use no system font stack, remote font or remote asset.

In every probe frame, Chinese text SHALL satisfy these rules. The probe frames are, for each scene, the frame where its entrance ends, its midpoint, and the frame before its exit.

- The rendered text equals the input text. In a report, the input text is the text after placeholder expansion.
- Every text box stays inside the theme's safe area, does not scroll horizontally, and is at or above the theme's minimum type size.
- No line starts with `，。！？、；：）」』`.
- Masks enclose the glyph boxes they reveal.

In explainers, numbers SHALL be formatted with 万 and 亿. Reports SHALL display figures as the report kit's display rules state, without 万/亿 rescaling.

Captions SHALL show one caption block per page, timed to that block's audio.

#### Scenario: Long Chinese text stays inside the safe area

- **WHEN** every text field of a scene holds Chinese text at its schema maximum
- **THEN** every probe frame of the scene satisfies the text rules

#### Scenario: Line-start punctuation

- **WHEN** a concept-card point wraps exactly before a `，`
- **THEN** the `，` stays at the end of the previous line

#### Scenario: Number formatting

- **WHEN** an explainer key-number scene shows `12345` and `123456789`
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
- more than one `custom` scene in an explainer, or any `custom` scene in a report;
- in a report, a rule of the report kit (data items, placeholders, figure length, scene figure rules).

When the mechanical stage passes, the check SHALL write one 2×2 contact sheet of key frames into the project, and the kit status command SHALL print a fixed yes/no checklist. The model answers the image questions from that image. In a report, the status command also prints the report kit's three material questions, which the model answers against the user's material.

The final-render command SHALL refuse to start until a check has passed for the current `script.json`, `timeline.json`, project sources and, in a report, every imported table the script references, whether named by a data item or by a scene.

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

#### Scenario: Re-imported table requires a new check

- **WHEN** a report's `data/q3-销售.json` is replaced by `kit data` after a passing check
- **THEN** the final-render command fails and says to run the check again

### Requirement: Components enter the kit only after recorded user approval

Every candidate scene component and, until each preset's theme pick, its theme candidates SHALL have a rendered sample in a gallery the user reviews. The explainer candidates were light and dark. The report candidates are `report-light` and `report-dark`. A sample is a short clip and key frames, rendered in the workspace image in the preset's theme candidates.

The user's decision per component and each theme pick SHALL be recorded in a tracked approvals file. Each entry names the component, the decision (`approve`, `redo` or `drop`), the reviewer and the date, and links the user's own export or message. Explainer entries use the kind as their id and `theme` for the theme pick. Report entries use `report:<kind>` and `report:theme`. A kind used by both presets SHALL need an approval in each.

The unpicked theme of each preset SHALL be removed from the kit. Explainers SHALL render with the explainer pick only, and reports with the report pick only.

For each preset, these SHALL equal the approved set of that preset's kinds in the approvals file:

- the schema's kinds;
- the component registry;
- the JSON Schema;
- the preset's example script, which uses every approved kind of the preset that needs no image, and no other kind;
- the skill's kind list.

`redo` counts as not approved until a later approval entry replaces it. A required kind SHALL NOT ship unapproved: the explainer requires `hook`, `summary` and `end-card`, and the report requires `cover`, `summary` and `end-card`. The report kinds are approved in batches, so a report kind may exist in the gallery as a candidate before the required report kinds are approved. Until they are approved, no report script validates.

#### Scenario: Unapproved component is absent

- **WHEN** the approvals file marks the chart component `drop`
- **THEN** `chart` is absent from the explainer schema, the registry, the JSON Schema, the explainer example script and the skill text

#### Scenario: Theme pick recorded

- **WHEN** the approvals file's `theme` entry is `light` and its `report:theme` entry is `report-dark`
- **THEN** the kit's themes hold only `light` and `report-dark`; explainers render with `light`, and reports with `report-dark`

#### Scenario: Required kind not approved

- **WHEN** the end-card component is marked `redo`
- **THEN** the kit's static test fails, naming the required kind

#### Scenario: Required report kinds not yet approved

- **WHEN** no `report:cover` entry is `approve`
- **THEN** every report script fails validation at its `hook`, and explainer scripts validate as before

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

The entry file SHALL also route work reports (工作汇报) to the kit, pointing the model to `report-kit.md`. That file holds the report steps:

1. the material checklist, with one question to the user when it is incomplete;
2. a new project with `--preset report`;
3. `kit data` for each attachment;
4. the explainer's steps from writing `script.json` on.

Course and promo videos SHALL keep the free-form workflow. The vendored Remotion guidance SHALL be read only for a `custom` scene, which only explainers allow.

The entry file SHALL be at most 80 lines. Render mechanics and failure handling SHALL live in reference files.

This requirement supersedes, for science explainers, the skill rule of the never-archived local `ocu-video-production` draft that renders must be run through `npx --no-install`.

#### Scenario: Explainer request

- **WHEN** a user asks for a science-explainer video with the video switch on
- **THEN** the skill entry lists the kit steps above in that order, within 80 lines

#### Scenario: Report request

- **WHEN** a user asks for a work-report video with the video switch on
- **THEN** the skill entry sends the model to `report-kit.md`, whose first step is the material checklist

#### Scenario: Course request

- **WHEN** a user asks for a course video with the video switch on
- **THEN** the skill entry sends the model to `free-form.md`
