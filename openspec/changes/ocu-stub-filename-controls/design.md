# Design

## Boundary and invariant

The upload handler URL-decodes the route name before validating path segments, parsing multipart data and publishing bytes/listing metadata. The file handler uses the stored name in both inline and attachment disposition branches. Decoded HTTP control characters must never enter upload state; accepted supported names retain their bytes, listing identity and disposition behavior.

## Decision

Extend the existing invalid-filename guard, before multipart parsing or `_store_upload`, to reject U+0000–U+001F and U+007F. Keep400 and `Invalid filename`; do not sanitize or rename unsafe input, change GET header construction, or align status codes with production OCU. Existing `re` is available; no new helper/module is needed.

The leading-slash test is equivalent to rejecting an empty first split component. If compacting the guard is necessary for the existing800-line ceiling, preserve every empty/dot/dot-dot segment rejection and prove those boundary cases; do not remove unrelated lines or relax the ceiling.

## Required evidence

- Implementer authors only the smoke regression first. Parent captures a semantic accepted-unsafe-name failure before permitting the source edit; preserve the unchanged smoke hash through GREEN.
- URL-encoded CR, LF, NUL and the remaining ASCII HTTP controls (including DEL) receive400; compare complete chat listing before/after rejection, including revision. Include a combined CRLF header-injection-shaped name.
- GET each rejected path in inline and `download=1` modes returns404 without disposition. Raw header bytes, not only a normalizing HTTP parser, must show intact framing and no injected field or control byte within header lines.
- An ordinary supported filename uploads successfully; raw GET responses in both modes retain exact payload bytes and exactly one expected inline/attachment disposition with its basename.
- Add traversal preservation assertions: leading slash, repeated/trailing slash, dot and dot-dot components, including encoded `%2f`, `%2e`, `%2e%2e`. Each matched upload route returns400 `Invalid filename` and leaves the full listing unchanged. Send encoded paths without client-side dot-segment normalization. Run these controls before the new control-character failure so baseline output proves their GREEN state; qualify their rejection with a disposable missing-empty-component guard mutation and restore GREEN.
- Existing reserved-error, chat-isolation, concurrent upload and Office smoke remain valid. Invalid-path400 versus production403 is not changed.

## Sibling surfaces and checks

Both disposition branches and the uploaded-file GET lookup share the name; upload validation is the rightful owner. Office fixture-generated names and static fixtures are unchanged. Parent runs `make smoke-stub`, scoped lint/format and applicable backend/harness checks, doc-gate, decisions-verify and strict fixture validation; reviewers run nothing.

## Non-goals and rollback

No production auth/security change, arbitrary Unicode filename support, header escaping redesign, new persistence, dependency, UI or browser certification. Revert the focused commit if the harness contract regresses; no data migration exists.
