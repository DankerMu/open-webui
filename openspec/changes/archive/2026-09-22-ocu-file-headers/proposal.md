# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: compact (override: browser security policy on a public file API is an expanded trigger, despite the small patch).
Blast radius: active generated content lacks the intended origin sandbox if proxy controls are absent.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Legacy compatibility / examples; Error handling / rollback / partial outputs.
Evidence floor: real-app five-MIME/download header matrix with semantic red, unaffected response cases, configured non-Docker suite and cross-review. Docker/browser end-to-end acceptance remains deferred to epic task 19.0.

## Why

Issue #12 mirrors the proxy's generated-content isolation headers at the OCU file response itself. The exact MIME set and CSP are fixed by the parent access-gateway requirement.

## What Changes

Set one `Content-Security-Policy: sandbox allow-scripts allow-forms` and `X-Content-Type-Options: nosniff` on successful non-download file responses whose computed MIME is text/html, image/svg+xml, application/xhtml+xml, text/xml or application/xml. Downloads remain attachments; other responses remain unchanged.

## Capabilities

### New Capabilities

- `ocu-file-headers`: selective OCU mirror of generated-content security response headers.

### Modified Capabilities

None.

## Impact

Sibling OCU app.py file route and tests/test_files_headers.py; minimal relevant docs/changelog. No proxy changes (#22), auth/path changes, middleware or dependencies. Default Content-Disposition mismatch is separately tracked as #62, not silently folded into this header-only issue.
