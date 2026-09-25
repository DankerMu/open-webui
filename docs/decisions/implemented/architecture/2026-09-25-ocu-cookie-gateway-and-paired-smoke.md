---
id: 2026-09-25-ocu-cookie-gateway-and-paired-smoke
title: Cookie-only native gateway with pinned paired acceptance
kind: architecture
status: implemented
date: 2026-09-25
supersedes: none
references: 2026-09-20-lan-topology-external-reverse-proxy, 2026-09-23-ocu-public-prefix, 2026-09-24-ocu-websocket-recheck, issue-22, issue-23
---

# Cookie-only native gateway with pinned paired acceptance

## Problem

A proxy configuration can validate while authenticating through an unintended header, forwarding the wrong chat path, or sending an invalid bodyless auth request. A smoke test that sees only browser status codes cannot distinguish gateway denial from an upstream404, nor absence of credentials from safe credential handling.

## Decision

Use native nginx with auth_request and one reviewed route table. A renderer validates environment values and nginx syntax, then atomically publishes a private0600 configuration; neither secrets nor rendered runtime paths are committed. Chat rows strip /ocu, while static rows retain /ocu/static.

Chat subrequests authenticate cookies through WebUI owner auth; static subrequests use session auth without chat identity. Forward only explicitly allowed auth headers, and clear Content-Length on bodyless subrequests. The internal Bearer credential is for OCU, never for WebUI authentication. Preserve route-derived chat and server-derived user identity. Keep auth403→404 distinct from mutation403 and OCU error passthrough. WebSocket upgrades retain cookies for periodic revocation; generated-file responses receive MIME-dependent opaque-origin policy.

The permanent make smoke-proxy command verifies the exact OCU commit in constraints.yaml and materializes reviewed Git blobs into private scratch before launching the existing entrypoint. It does not read or overwrite a sibling checkout's ignored configuration. Real WebUI sessions establish owner/non-owner and alternate-header positive controls; private stub observations establish per-request forwarding, identity, credentials and denied-request noncontact. Public fixture responses never echo credentials. Ordinary Content-Length POST→GET sequences and WS frame exchange are part of acceptance, not optional diagnostics.

The user selected paired cross-repository acceptance: review and freeze OCU without merging, run WebUI's permanent smoke and CI against that source, then merge OCU and WebUI sequentially. A new counterexample invalidates previous evidence; changing request order or framing to avoid a failure is not an acceptable fix.

## Alternatives considered

- **Forward arbitrary headers to auth** — WebUI accepts configurable credential headers, defeating the browser gateway's cookie-only boundary.
- **Trust a Gitless SHA sidecar** — its text does not authenticate the renderer bytes being executed.
- **Count any successful credential receipt** — can hide a missing credential on another route; each allowed request needs its own observation.
- **Accept proxy configuration before permanent smoke** — rejected by the user; the two repositories share an integration gate.
- **Run smoke in the source checkout's ignored runtime** — can overwrite an unrelated operator configuration or process state.

## Consequences

The verification command requires a Git checkout, native nginx, Hurl and a healthy WebUI harness. Its processes, credentials and test-created data have explicit ownership and cleanup; failure cannot be reported as green when cleanup fails. CI checks out the public pinned source without persisting checkout credentials. Native evidence does not establish Docker routing or deployment firewall behavior, which remain consolidated deployment acceptance responsibilities.
