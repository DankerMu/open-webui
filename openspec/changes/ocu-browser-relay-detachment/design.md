## Context

The image generates one `playwright-cli` wrapper in `Dockerfile`. A background `socat` exposes Chromium's loopback CDP listener to the sandbox viewer. The wrapper's `open http*` branch intentionally performs open, a three-second interception window, then goto.

## Decision

Launch the existing relay with `nohup` and explicit stdin/stdout/stderr redirection to `/dev/null`. Redirection releases captured pipe ownership; `nohup` preserves the relay across a launching shell's hangup. Do not change the listener, target, relay discovery, or command dispatch.

Governing invariant: the relay outlives the launching CLI without owning any of that CLI's standard descriptors.

Must preserve: `0.0.0.0:9222` forwarding to `127.0.0.1:9223`, one discovered existing relay, `PLAYWRIGHT_CLI_CONFIG` overrides, CLI arguments/exit status, and HTTP open/sleep/goto ordering. No new supervisor or retry behavior.

Sibling surfaces: the existing xdg-open launcher delegates to this wrapper; the browser viewer consumes the external CDP endpoint. Neither gains a separate relay implementation.

## Verification

Use a fresh image container as the public boundary. Confirm no relay exists before invocation. Run the exact issue pipeline with its 15-second limit and verify successful about:blank output. Then query CDP through port 9222 and compare it with Chromium's port 9223; verify the relay listener binds all IPv4 interfaces. A successful pipeline without a live relay is insufficient.

The historical isolated-container failure (exit 124) is the accepted semantic RED; do not rerun the reported failure simply to confirm it. Extend the existing image test surface rather than add source-text assertions. Parent verification owns command execution; agents do not run checks mid-flight.

Build only tracked source in a clean exported context. Do not send the user's untracked `.run/` into Docker. Full image-build failure is a blocker, not permission to substitute a wrapper-only overlay for the required image evidence.

## Risks and migration

Relay diagnostics intentionally leave the tool's captured output stream, as required by independent lifetime. Existing launch-failure semantics are unchanged. Fresh image construction may expose unrelated packaging failures; preserve their evidence and route them without silently broadening this repair.

Rebuild and recreate the sandbox image for rollout; source changes do not alter existing containers. Rollback uses the preceding image. No LAN deployment or acceptance-machine access is part of this work.
