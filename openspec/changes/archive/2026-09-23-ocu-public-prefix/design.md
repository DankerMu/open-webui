# Design

## Context

Parent D15/D16 and issue14 task7.1 own shell emission, static mount and browser-viewer address adaptation. Issue17 owns the remaining JavaScript cutover. app.py preview_page is the sole production caller of \_generate_preview_html; security tests call the generator directly. Ruff has no reference capability, so callers were mapped by exact-name search.

## Goals / Non-Goals

Governing invariant: every OCU shell-emitted address uses the configured prefix exactly once; describeUrl belongs to WebUI and is never prefixed. Browser discovery and CDP WebSockets remain on the same origin under the script's public base.
Must preserve: default-empty baseline asset/API/files/heartbeat and browser addresses, existing token/chat guard, no browser exposure of internal token, direct generator compatibility and content types.
Non-goals: preview.js wrapper/module imports/loadScript/worker/viewer addresses and badge consumption (#17), output entry URLs (#16), proxy implementation (#22), lifecycle changes, real Docker.

## Decisions

- Canonical prefix is empty or one/more slash-led nonempty path segments of ASCII letters/digits/underscore/hyphen/dot/tilde, excluding `.` and `..` segments. No trailing slash, whitespace, percent escapes, query, fragment, scheme or protocol-relative form. Reject prefixes whose `{prefix}/static/` falls inside the existing chat guard namespaces, using the shared guard predicate rather than a duplicate list. The user selected startup rejection over extending auth routing; `/api` and similar nonconflicting names remain valid. Invalid environment fails at import/startup; do not silently trim or normalize it.
- Read prefix once. preview_page passes prefixed apiUrl/filesBase; generator uses prefix for assets/heartbeat and emits describeUrl `/api/v1/ocu/workspaces/{chat_id}`. Avoid prefixing caller URLs twice; preserve existing generator signature.
- Mount static at `{prefix}/static` only. Do not globally remount chat routes or alter auth routing: the proxy strips the public prefix for chat endpoints but preserves it for the static mount, per parent gateway static row.
- Browser-viewer derives browser HTTP/WS base from its module URL; relative `../browser/` preserves the configured nesting. Adapt connect, tab poll and reconnect together; keep transport behavior and origin/protocol. Its module import rewrite and preview.js imports remain #17, not part of this address-only change.
- No dependency installation for JavaScript tests: a pytest-discovered test may invoke Node's built-in vm modules with browser transport/locale dependencies mocked, executing the actual BrowserViewer class with a controlled module URL. No source rewriting of the class under test.

## Risks / Trade-offs

- This is the explicitly planned intermediate server slice. A nonempty prefix does not make the entire SPA deployable until #17 fixes module/script assets and fetch wrapper; the overlay must not enable it before that dependency closes. Empty prefix remains fully backward compatible.
- Config interpolation can break HTML/JS: canonical prefix validation plus existing JSON encoding; keep chat sanitization at routes. Token must never appear in shell config.
- Sibling surfaces: preview.js imports/fetches (#17), broker URLs (#16), proxy static preservation/chat stripping (#22), current security generator tests.

## Required evidence

Server input prefix empty or `/ocu` or nested `/tools/ocu` -> actual HTML URLs and static response200 at correct mount,404 at unprefixed static when configured. Missing/invalid token -> unchanged401 on preview. Invalid prefix -> process startup failure. Node executes actual browser viewer connect/poll/reconnect with recorded fetch/WebSocket targets for empty/nonempty module paths and http/https. Visual complete-SPA proof belongs to #17/#36; do not claim it from these URL tests.
