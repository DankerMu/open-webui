# Design

## Context

The shared file-header builder already chooses inline versus attachment from `download=1`, but both branches interpolate the raw POSIX leaf name inside quotes. Upload routing accepts quotes and backslashes and retains them in stored names; those characters are not the control characters rejected by issue209. The ordinary nested-file smoke currently pins a quoted filename representation.

## Decision

Serialize the POSIX leaf once as an HTTP quoted-string: escape literal backslashes before escaping literal double quotes, and use the result in one shared disposition assignment after selecting the existing mode. Do not reject names, reinterpret backslash as a path separator, change storage identity or add a second serializer/helper when the existing builder owns this behavior.

The backend file API's RFC5987 `filename*` is an existing alternative, but changing every ordinary stub response to that representation is unnecessary for this issue. Correct quoted-pair escaping satisfies the accepted ASCII names while preserving the ordinary wire representation. Unicode filename policy is not expanded here.

## Verification

Use a standards-aware parser independent of the serializer, such as Python's `email` parser with default policy: malformed quotes must produce a defect or wrong name, an unescaped backslash must decode incorrectly, and properly quoted pairs must recover both exact names with no defects. Parent stores that qualification before implementation.

A first permanent regression uploads `a"b.txt` into a fresh chat through the real stub, retrieves both modes and checks exact bytes, one correctly framed disposition field, correct mode, zero parser defects and the exact leaf. Parent captures semantic RED before authorizing the shared builder repair. Then cover `a\b.txt`, combined quote/backslash, nested POSIX paths and an ordinary unchanged control through the same real upload/GET path. No mocked serializer or source-text tests.

Run existing `make smoke-stub` to preserve all 33 rejected ASCII controls, traversal, ordinary raw-header assertions, pagination and Office behavior; run the relevant public-stub regressions, focused lint/format, documentation/strict fixture gates and three-seat review. Scripts are not application-coverage subjects. If a narrow test command is missing, add a Makefile target following existing harness conventions rather than broadening the test discovery policy.

## Risks and Non-Goals

Parser permissiveness can conceal malformed headers: inspect raw header multiplicity/framing as well as parsed parameters/defects. Avoid changing ordinary filename bytes just to satisfy a new test. No claim about every browser's historical parser, Unicode filenames, production serialization or arbitrary filesystem path semantics. The stub intentionally carries weak CSP/X-Content-Type-Options fixtures; keep them unchanged. Use private temporary process roots and retire actual children; do not redesign unrelated fixture cleanup.

After runtime proof, update the existing Office stub testing decision's filename-serialization boundary in place. Rollback is the focused shared-builder correction and its tests; no persisted migration or new decision record.
