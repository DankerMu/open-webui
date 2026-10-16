---
id: 2026-10-16-ocu-qualified-office-image
title: Qualify a minimal native Office bootstrap image
kind: architecture
status: implemented
date: 2026-10-16
supersedes: 2026-10-03-ocu-office-editor-selection, 2026-09-30-ocu-offline-image-delivery (image selection and DocumentServer provenance only)
references: issue 433, issue 172, Plan 2 B1, ocu-office-amd-image
---

# Qualify a minimal native Office bootstrap image

## Problem

The pinned official 9.4.0 desktop bootstraps dispatch dependent views before their native BaseView/Window providers are initialized. Holding real RequireJS provider dispatch reproduces native `undefined.extend` failures without changing response bytes. Retrying the harness or ignoring native errors would conceal a production loading defect.

## Decision

Select the minimal derivative of the original B1 OCI index. The committed OCU recipe patches only the three desktop `main/app.js` bootstraps to await native Window after Locale readiness and underscore publication, before dispatching existing controllers/views. Window supplies the transitive BaseView dependency. Exact input/output hashes and unique edit spans fail closed; all targets are checked before writes. No DataView change is justified by the control.

Retain the original image and its immutable B1 evidence. The [B1 delta](../../../evidence/issue-433/2026-10-16-b1-delta.md) binds the derivative identities, affected runtime observations and inherited observations with their original limits. Both platform archives preserve base layers, runtime configuration and recorded file/directory modes, ownership and modification times. The only regular-file changes are three bootstrap scripts and the modification notice. Build-only scratch storage prevents emulation caches from entering the image.

DocumentServer is a built role in the seven-role version2 release; PostgreSQL remains pulled. Recipe and immutable base/material provenance come from the selected committed source. Content-derived image names, configuration-digest and archive verification, mandatory font bundle, and no-build/no-pull startup remain required. A platform manifest is not a configuration digest. The local verifier accepts only the qualified configuration or single-platform manifest identity for the current recipe and launches the checked immutable identity; missing or mismatched material is an error, not an implicit pull or fallback.

Readiness must cover the pinned entrypoint's cache generation and core-service restart, not just HTTP health and theme availability. The local native campaign waits for the positive PID-1-owned final log-tail phase and then health, within the existing shared readiness budget. This is an entrypoint-specific witness, not a general quiet-time heuristic.

This decision partially supersedes [editor selection](2026-10-03-ocu-office-editor-selection.md) and [offline delivery](2026-09-30-ocu-offline-image-delivery.md). Their protocol, archive, source, font and acceptance boundaries remain in force. The operator's derivative authorization does not expand LAN or release-wide image acceptance. Original licence fit was an operator judgement for the unmodified image; retained branding/notices and explicit modifications are not an agent legal opinion.

## Alternatives considered

- **Retry, serialize test traffic, or suppress native errors** — leaves the production dependency race intact and invalidates qualification.
- **Patch every candidate AMD site** — broadens the image delta beyond reproduced provider failures; DataView's dispatch control remained healthy.
- **Replace the Office release or server bundle** — discards the qualified base and broadens protocol, licence and runtime requalification without need.
- **Retain a pulled role or mutable tag as authority** — cannot bind the modified bytes to selected source and confuses registry manifests with archive configuration identity.
- **Increase readiness sleeps** — does not establish completion of native initialization or protect a shared deadline.

## Consequences

A changed base, recipe, patch inventory or output identity requires fresh affected qualification. Built-image export/import and the general containerd identity issue remain separate release work; this decision is not their acceptance. ARM64 native evidence does not certify AMD64 runtime, capacity, shutdown at larger document counts, organisation fonts, arbitrary rendering fidelity or the acceptance machine. The complete broker workflow and independent-reader acceptance remain separately evidenced by their owning verification target.
