---
id: 2026-09-25-ocu-cookie-gateway-and-paired-smoke
title: Native gateway with pinned request acceptance
kind: architecture
status: implemented
date: 2026-09-25
supersedes: none
references: 2026-09-20-lan-topology-external-reverse-proxy, 2026-09-23-ocu-public-prefix, 2026-09-24-ocu-websocket-recheck, 2026-10-10-ocu-resource-grants, issue-22, issue-23
---

# Native gateway with pinned request acceptance

## Problem

A proxy configuration can validate while authenticating through an unintended header, forwarding the wrong chat path, or sending an invalid bodyless auth request. A smoke test that sees only browser status codes cannot distinguish gateway denial from an upstream404, nor absence of credentials from safe credential handling.

## Decision

Use native nginx with auth_request and one reviewed route table. A renderer validates environment values and nginx syntax, then atomically publishes a private0600 configuration; neither secrets nor rendered runtime paths are committed. Chat rows strip /ocu, while static rows retain /ocu/static.

Chat subrequests authenticate cookies through WebUI owner auth; static subrequests use session auth without chat identity. Forward only explicitly allowed auth headers, and clear Content-Length on bodyless subrequests. The internal Bearer credential is for OCU, never for WebUI authentication. Preserve route-derived chat and server-derived user identity. Keep auth403→404 distinct from mutation403 and OCU error passthrough. WebSocket upgrades retain cookies for periodic revocation; generated-file responses receive MIME-dependent opaque-origin policy.

The permanent make smoke-proxy command verifies the exact OCU commit in constraints.yaml and materializes reviewed Git blobs into private scratch before launching the existing entrypoint. It does not read or overwrite a sibling checkout's ignored configuration. Real WebUI sessions establish owner/non-owner and alternate-header positive controls; private stub observations establish per-request forwarding, identity, credentials and denied-request noncontact. Public fixture responses never echo credentials. Ordinary Content-Length POST→GET sequences and WS frame exchange are part of acceptance, not optional diagnostics.

The explicit Hurl list governs execution, and output names each invoked file on success or failure; a missing listed file fails. Office requests run serially with one private observation boundary per request: each admitted row requires one attributed arrival, and each denial requires none. A configured conflict chat must reach observed conflict before resolution and observed closed state before version restore. The pinned renderer receives a distinct Office listener and its upstream; this evidence does not establish browser editing or real-editor behavior.

Office and resource request variables travel in a fresh0600 file beneath owned0700 scratch, never as credential-bearing command arguments. The request file follows the base variables file so an explicit empty cookie overrides retained authentication. Its lifetime ends on success, child failure, launch error or interruption; the base credential file remains owned by the outer smoke run.

Canonical ordinary-file reads use real WebUI owner issuance followed explicitly without cookies. The resource judge registers capabilities before diagnostics, verifies exact raw targets and fresh server identity on each arrival, and requires zero arrivals on each denial. Raw socket HEAD proof observes wire bytes rather than relying on client body suppression. A short session minted through the canonical harness environment proves fresh resource access and subsequent session/grant expiry. Browser-response containment scans exclude private request metadata and permit only the successful canonical issuer Location; public diagnostics redact registered credentials and capability URLs even when reports are incomplete.

Paired cross-repository acceptance couples reviewed source identity with WebUI's permanent smoke and CI. The original coupled cutover freezes OCU before source merge, verifies WebUI against that source, then merges the repositories sequentially. Resource-grant stage ordering, the atomic pin/fixture cutover and separate browser acceptance boundaries follow approved [D6](../../../../openspec/changes/archive/2026-10-14-ocu-resource-grants/design.md#d6-verification-and-delivery) and the [implemented resource-grant decision](2026-10-10-ocu-resource-grants.md). [Local browser/native evidence](../../../evidence/issue-300/verification.json) does not replace consolidated deployment acceptance. A new counterexample invalidates previous evidence; changing request order or framing to avoid a failure is not an acceptable fix.

## Alternatives considered

- **Forward arbitrary headers to auth** — WebUI accepts configurable credential headers, defeating the browser gateway's cookie-only boundary.
- **Trust a Gitless SHA sidecar** — its text does not authenticate the renderer bytes being executed.
- **Count any successful credential receipt** — can hide a missing credential on another route; each allowed request needs its own observation.
- **Accept proxy configuration before permanent smoke** — rejected by the user; the two repositories share an integration gate.
- **Run smoke in the source checkout's ignored runtime** — can overwrite an unrelated operator configuration or process state.

## Consequences

The verification command requires a Git checkout, native nginx, Hurl and a healthy WebUI harness. Its processes, credentials and test-created data have explicit ownership and cleanup; failure cannot be reported as green when cleanup fails. CI checks out the public pinned source without persisting checkout credentials. Native evidence does not establish Docker routing or deployment firewall behavior, which remain consolidated deployment acceptance responsibilities.

Owned-data cleanup attempts every recorded run-owned chat/user ID and every exact owner/foreign email result after HTTP or transport failures, without retries or prefix-based deletion. It reports one aggregate containing only operation kinds and HTTP statuses or exception classes; cleanup failure makes a successful run nonzero and preserves an existing nonzero verdict. Process cleanup precedes owned-data cleanup, followed by the sentinel assertion and scratch removal.
