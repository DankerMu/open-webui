---
id: 2026-10-03-ocu-office-editor-selection
title: Select the measured ONLYOFFICE 9.4.0 release
kind: architecture
status: implemented
date: 2026-10-03
supersedes: none
references: Plan 2 B1, ocu-office-editing D4 and D9, issue 119, 2026-10-02-ocu-unified-workspace-files, 2026-09-30-ocu-offline-image-delivery
---

# Select the measured ONLYOFFICE 9.4.0 release

## Problem

Office broker, callback, embedding and backup work depends on release behavior that API documentation alone cannot establish. The release README says “up to 20 maximum”, while its 9.4.0 changelog says “Removed the limitation of 20 simultaneously opened documents”. Neither claim substitutes for observing the pinned image.

## Decision

**Verdict: go.** Use the unmodified ONLYOFFICE Docs Community 9.4.0 image identified by OCI index `sha256:e3da62a847b9a5d51a11f73cfea1d9c13c3be3809614490d4edddcf01dcf919b`. The [dated B1 record and retained evidence](../../../evidence/issue-119/2026-10-03-b1.md) supply all fifteen observations, with the permitted acceptance-machine and operator-font unknowns explicit, and concrete values for all nine consumed items.

For release inventory shape, this selection partially supersedes
[offline image delivery](2026-09-30-ocu-offline-image-delivery.md): DocumentServer
is the seventh pulled role in version2, selected from the committed declaration
and bound to `DOCUMENTSERVER_IMAGE`. Configuration-digest and archive checks
remain authoritative; the selected OCI index is not a configuration digest.
Version1 has no compatibility path. The earlier record's remaining guarantees
and rationale are retained.

The operator, DankerMu, confirmed licence fit for the unmodified official image with branding and notices retained on 2026-10-03. This is an operator judgement, not an agent legal opinion. The same operator approved aligning the contracts with 21 observed simultaneous editable documents and no cap event. The broker adds no artificial 20-connection limit or nonexistent global live-count query; the host, UI and stub add no cap-specific refusal path. Actual validation, unavailable-service and editor-error handling remain required.

The five design assumptions have the following evidence, bounded as the B1 record states:

- `forcesave` echoes the exact `userdata` nonce in an authenticated status-6 callback.
- The shipped shutdown-preparation command saves both dirty documents held open and disconnects both editors.
- Restart clears shutdown mode: a fresh editor fails before restart, then opens and accepts an edit afterward.
- DOCX native save with user force-save disabled produces no callback during the measured 199.701-second window.
- The proxy withholds the synthetic WebUI cookie while all three formats and 21 concurrent documents work; none of the observed upstream requests carries that cookie.

All three deterministic formats open, accept real input and export bytes containing the markers. The record retains positive and capability-removal controls, final-close timing, callback download origins, font provenance and exact cleanup evidence.

## Alternatives considered

- **Keep the assumed 20-connection rejection** — contradicts measured admission and invents a cap event; a new product quota would require a separate requirement.
- **Treat public documentation or a stub as B1 evidence** — cannot establish actual callback, shutdown, iframe or cookie behavior.
- **Adopt Collabora automatically** — changes the integration protocol to WOPI without a user decision; it is not selected.

## Consequences

Once this record lands on the target branch, the B1 prerequisite for later Office source tasks is satisfied. This is not deployment acceptance, AMD64 certification, proof of arbitrary document fidelity or a capacity guarantee above 21 documents. The acceptance machine, organisation fonts, independent Office rendering comparison and later broker round-trip acceptance remain separately governed work.

The authorized isolated campaign is the sole exception to the [workspace cutover's image schedule](2026-10-02-ocu-unified-workspace-files.md). All other image builds and acceptance remain deferred until the user's source-completion boundary. A different release, changed proxy/iframe configuration or changed assumptions requires fresh relevant evidence before relying on these measurements.
