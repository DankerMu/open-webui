# Design

## Authority and boundary

Issue18 task10.1/10.2, parent D17. Existing injected emitter wraps events into the originating user room in WebUI socket/main.py1057–1083; the tool must reuse it, never choose/broadcast a room. Polling tolerates dropped/absent hints.

## Decisions

- Event envelope: type=ocu:workspace_changed, data exactly {chat_id, reason:"tool_completed"}. No revision, args, paths, tool output or credentials. The validated chat_id passed to \_run_tool is authoritative.
- Completion means the invoked MCP client call returned (including an error-valued result) or raised an ordinary caught Exception. The client may reject during its own health/auth preflight; that returned attempt still emits a hint because the hook does not inspect transport internals or infer invocation from result text. One hint attempt follows existing terminal status handling. Rejection by the public wrapper/\_run_tool chat/config checks or header construction before the client call produces no hint. Cancellation is not completion: propagate asyncio.CancelledError without a hint or changed result.
- None emitter is a no-op. A hint-emitter ordinary Exception is swallowed under the same best-effort policy as status events; it cannot change the tool return or error string. No retry, timeout, background task or new telemetry.
- Preserve existing status/progress events and all transport/auth/upload behavior. Public wrappers continue to share \_run_tool. Add only the minimal completion hook and one emission path; do not create another event system.

## Evidence

Exercise real public tool wrappers and \_run_tool, mocking only transport/header dependencies where necessary. Filter workspace hints rather than counting all events. Prove success, error-valued result and caught execution exception each produce exactly one hint after client completion, exact minimal payload, None behavior and failing hint emitter preserving outcomes. Outer rejection/header failure and cancellation produce none; existing real health/auth rejection paths return their original configuration error plus one hint. A callable pre-change hook must fail on missing hint count, not missing symbol. Parent also runs a throwaway public-wrapper smoke with an emitter and an async client substitute, without Docker/network side effects.

## Risks / non-goals

Hint emission is not proof a file changed or a tool succeeded; even read-only tools send it. No retry delivery guarantee, no revisions or broker calls. User-room isolation relies on the existing server emitter and is unchanged. UI dirty-flag handling remains#32; actual end-to-end event-triggered refresh remains final acceptance#36.
