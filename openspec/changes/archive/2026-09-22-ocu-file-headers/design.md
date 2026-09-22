# Design

## Context and Invariant

app.py download_file computes MIME with mimetypes.guess_type in the non-download branch and returns FileResponse. No existing CSP source was found on this OCU response path. The policy is a mirror of parent access-gateway generated-content isolation, not a new server-wide default.
Governing invariant: the five designated active-content MIME types have exactly the fixed sandbox CSP and nosniff on non-download file responses; no allow-same-origin is introduced.

## Decisions

Apply headers per response in the existing non-download branch, using computed MIME before Starlette appends charset. Do not branch on extension or add middleware. Setting the CSP value replaces rather than appends policy; assert a single exact value.
Target MIME set: text/html, image/svg+xml, application/xhtml+xml, text/xml, application/xml. Non-target and forced-download responses receive no new mirror headers.
Must preserve: actual file bytes, MIME detection, filename handling, existing download truthiness, authorization/traversal checks, archive/upload/error response behavior. Do not change content disposition; the default attachment mismatch is tracked separately in #62 for final acceptance.
Sibling surfaces: download_file's two branches, archive route, auth denial, missing-file error, platform-specific XML MIME mapping. Proxy charset-tolerant MIME matching belongs to #22.
Non-goals: default inline disposition correction, proxy policy, browser/runtime deployment, broader MIME protection, symlink/path policy, compression/range changes.

## Evidence

Use real FastAPI TestClient with configured internal token and isolated output files, not direct route calls. For each target MIME, non-download yields exact single CSP plus nosniff and unchanged bytes; download=1 remains attachment/octet-stream without mirror headers. Explicitly cover both XML MIME variants despite platform mapping differences. Negative MIME rows (plain text, PNG, unknown/octet-stream) have neither header. Check missing-file and unauthorized responses retain their errors without route headers. Keep existing traversal tests meaningful.
Semantic red is missing headers on real responses before the change, not import/setup failure. Focused module then configured non-Docker suite and structure check. No Docker; epic task 19.0 retains final proxy/browser evidence. Rollback is the response-header patch, while proxy remains the primary policy owner.
