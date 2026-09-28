# Design

## Context

See proposal.md. `preview.js` already owns BrowserView/BrowserViewer and TerminalView/TerminalSession. Its standalone App also enumerates files, discovers both runtimes, autoselects views and sends heartbeat. Files-only embedding intentionally excludes these effects. A parent must not embed a raw CDP URL or duplicate the clients.

## Goals / Non-Goals

Select one runtime surface by authenticated preview URL, retain existing client behavior and retire all owned resources on removal. No parent postMessage runtime-control protocol is needed: the parent owns iframe creation/removal and selects the immutable mode through its URL. No real engine operations, deployment proof, WebUI controls, dependencies or Files renderer changes.

## Decisions

- Accept exactly one embed value among files/browser/terminal only when framed; absent means standalone, invalid/repeated/non-framed remains visible invalid embedding. Browser and Terminal mode have no nested view tabs or outputs enumeration. Files selection messages remain confined to Files-only mode.
- A runtime wrapper mounts the existing selected client. Browser mode fetches browser status immediately, then every3seconds without overlapping requests, and passes active status into BrowserView. Failed/malformed/non-2xx status displays a named unavailable/error state, not active. Status resolution after teardown cannot mount/reconnect a client. Terminal mode reuses its dashboard and session controls; no background creation/launch occurs. Explicit existing Launch/Start Session controls retain their current authorization and lifecycle semantics.
- Reuse the canonical heartbeat helper in runtime mode and its cleanup, with one owned timer maximum. Read-only status does not launch a stopped sandbox. On iframe removal, every status interval, heartbeat, browser tab poll/reconnect and ttyd connection is retired; late connect continuations must not recreate sockets or commit mounted state. Correct canonical client lifecycle code if required, rather than wrapping a leaking client with a second implementation.
- Runtime document responses add a dedicated CSP: default-src 'none'; script-src 'self' plus a fresh nonce for the configuration script; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self'. Runtime markup uses locally bundled assets and no generated-content DOM. Response nonce and inline config nonce must agree. HTTP and same-origin WS transports are allowed; arbitrary external destinations are not. Do not add unsafe-eval or wildcard hosts. Scope the new policy to browser/terminal mode so Office/standalone policy compatibility is not silently changed.
- Parent sandbox remains exactly allow-scripts allow-same-origin allow-forms. No popup/download/top-navigation permissions are introduced. Invalid modes perform no runtime calls. Browser requests and WS endpoints continue to derive from module URL/public prefix, never sandbox host ports or internal tokens.
- Extend existing preview browser harness and protocol recording seams. Synthetic CDP/ttyd fixtures provide actual held WebSockets and minimal real client exchanges solely to count connections and prove lifecycle. They do not attest real terminal/browser interaction.20mount/remove cycles plus delayed status/connect responses must end at zero active fixture connections and no new requests after retired work settles. Prefix cases include /ocu and a nested prefix.

## Risks / Trade-offs
- The runtime embed status cadence is fixed while mounted; unlike standalone's visibility-adaptive polling, the parent removes an inactive runtime iframe rather than retaining a hidden poller. Whole-frame removal guarantees client connection/timer retirement, not delivery of a stop-ttyd POST; server-side process lifetime remains owned by explicit terminal controls and sandbox lifecycle. Browser fixtures release delayed completions before asserting zero pending completions and zero active connections.

Shared client cleanup fixes can affect standalone usage → retain standalone regression and Files-only Office browser coverage. CSP may expose an undeclared asset dependency → verify actual scripts/fonts/canvas/xterm, do not broaden policy without identifying the required source. Whole-iframe teardown differs from component teardown → test actual parent removal and delayed continuation, not only mocked effect cleanup. Synthetic transports cannot prove sandbox behavior → A-T05/A-T09 remain issue36.

## Migration Plan

Ship OCU source and matching WebUI control fixture first; issue30 advances its reviewed pin before using new modes. Reverting the source restores prior modes; do not enable the new consumer against an old pin. No schema/data migration. User separately approved a minimal Chat.svelte save callback for issue30; it is not implemented in this prerequisite.
