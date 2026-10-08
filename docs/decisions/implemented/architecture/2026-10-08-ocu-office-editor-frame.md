---
id: 2026-10-08-ocu-office-editor-frame
title: Office editor host has a dedicated trust class and CSP
kind: architecture
status: implemented
date: 2026-10-08
supersedes: none
references: ocu-office-editing D15, 2026-09-27-ocu-selected-runtime-embedding, 2026-09-27-ocu-restricted-office-embedding, issue-145, issue-146
---

# Office editor host has a dedicated trust class and CSP

## Problem

The editor host must permit the configured DocumentServer API script and nested
document without widening generated-content isolation, read-only Files rendering
or Browser/Terminal policies. External script provenance is not an origin boundary:
API JavaScript loaded into the host executes with the host document's privileges.

## Decision

Use a third trust class for the authenticated `/preview/{chat_id}?embed=office`
host. A single Office parameter with server-side Office enablement receives the
Office configuration and policy; the client additionally requires a parent frame.
The host installs its parent-message listener before announcing readiness and
admits one validated open per page. It creates or joins through the canonical
request wrapper and reads one initial session-status snapshot before deriving
publication and change-notice state. The abbreviated create response is not a
substitute for that snapshot. It mounts no Files/runtime controller and ignores
preview-selection messages.

The editor API loads only from the configured origin. Broker-signed document,
editorConfig and token fields are not rewritten; local event callbacks do not
alter those fields. Validation refusal is final, while request/API/editor failures
report error without closing another tab's session. Editor readiness and internal
modification acknowledgements do not establish persisted editing or saved state.

`officeDocserverOrigin` comes only from the server-owned
`OCU_OFFICE_DOCSERVER_ORIGIN` setting. Parent messages, query values and user
sandbox settings do not select or widen it. Configuration and served local scripts
contain no service, model or Office JWT secrets or derived ticket keys.

Each eligible response has a fresh configuration-script nonce and this policy:
`default-src 'none'`; `script-src 'self' 'nonce-<response nonce>' <DocumentServer origin>`;
`frame-src <DocumentServer origin>`; `connect-src 'self'`;
`style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`;
`font-src 'self' data:`; `base-uri 'none'`; `object-src 'none'`;
`form-action 'none'`; `frame-ancestors 'self'`.
Style, image and font allowances match the runtime policy, not a new resource grant.

The configured API JavaScript is trusted code executing on the host origin.
Only the cross-origin nested DocumentServer document is separated
by the same-origin policy; the external API script itself is neither opaque nor
SOP-isolated. Generated HTML/SVG/XML retains opaque-origin isolation. The existing
Files and runtime contracts, CSPs and fixed sandbox tokens remain unchanged; user
iframe preferences are not reused for this host.

Absent, empty or whitespace-only `OCU_OFFICE_DOCSERVER_URL` keeps Office disabled:
the preview returns HTTP 200 with `Invalid preview embedding`, no DocumentServer
origin/configuration and no Office CSP. Repeated, mixed or unknown embedding modes
and top-level Office use also fail visibly without Office/Files/runtime application
requests or outgoing protocol messages. Top-level enabled single-Office responses
still carry the server-selected Office configuration and policy.

Enabled single-Office responses validate a single HTTP(S) origin at serialization.
Malformed or CSP-inexpressible authorities return HTTP 500 with the fixed detail
`Invalid Office browser origin configuration`, never the configured value or a
fallback policy. Bracketed IPv6 URLs are valid URL syntax but unsupported CSP host
sources at this boundary; use a DNS hostname, including one resolving to IPv6.
Disabled and other/invalid embedding modes bypass this validation. This request-time
CSP validation does not add URL-format startup validation.

## Alternatives considered

- **Reuse or widen the runtime CSP** — either blocks DocumentServer script/frame
  loading or grants external sources to Browser/Terminal unnecessarily.
- **Reuse generated-content opaque isolation** — conflates untrusted document
  execution with trusted host API code and breaks the host's same-origin role.
- **Treat remote API JavaScript as SOP-isolated** — mistakes its download origin
  for the privileges it gains when executed in the host document.
- **Accept an origin from parent messages/settings or relax CSP on errors** — moves
  policy authority into browser input or silently broadens a misconfigured host.
- **Mount the standalone or Files SPA** — starts unrelated discovery/rendering
  work and exposes the wrong protocol instead of an idle editor host.

## Consequences

Trust in the configured DocumentServer includes its host-executed API code; CSP
limits sources, not that code's host privileges. Host connections remain same-origin
while the nested DocumentServer document owns its own origin and connection policy.
The host consumes existing broker APIs without a persisted-schema migration.
Save/close execution, recurring status polling and auto-save remain outside this
protocol owner's delivered behavior.

Local actual-HTTP/Chromium evidence covers the [idle host](../../../evidence/issue-145/office-shell.png), [local CSP canary](../../../evidence/issue-145/office-policy-canary.png) and [disabled invalid surface](../../../evidence/issue-145/office-disabled.png), not real DocumentServer editing or LAN acceptance.

Local protocol evidence covers a [joined session](../../../evidence/issue-146/office-session.png), [pending conflict](../../../evidence/issue-146/office-conflict.png) and [API timeout](../../../evidence/issue-146/office-api-error.png) through the actual host with controlled broker replies and a local editor API fixture. These captures do not certify real DocumentServer editing or deployment.

The [selected-runtime](2026-09-27-ocu-selected-runtime-embedding.md) and
[restricted read-only Office](2026-09-27-ocu-restricted-office-embedding.md) decisions
remain authoritative for their separate surfaces; neither is superseded.
