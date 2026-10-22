---
id: 2026-10-22-browser-failure-evidence-redaction
title: Browser failure artifacts carry screenshots and redacted text, never traces
kind: testing
status: implemented
date: 2026-10-22
supersedes: none
references: issue-601, 2026-10-11-frontend-test-discovery
---

# Browser failure artifacts carry screenshots and redacted text, never traces

## Problem

The A-T01 resources cases failed intermittently on hosted runners (#601), and no failing case left usable evidence. The CI upload step still matched `test-results/ocu-workspace.e2e.ts-*`. The OCU browser run, however, writes Playwright output into its scratch directory (`.run/workspace-ui-*/test-results`), and that directory is deleted with the owned stack. The failure screenshot and error context of an OCU case therefore never reached the artifact. The same pattern also dropped baseline-spec failures.

Playwright keeps a `trace.zip` for each failed case (`trace: 'retain-on-failure'`). A trace records request headers and bodies: session cookies, `Authorization` values, sign-in bodies and `/ocu/f/<token>` grant URLs. The harness secret list cannot find every encoded form of these inside a trace archive.

## Decision

When the browser run fails, the `run()` failure branch of `scripts/verify-ui-ocu.py` copies the evidence of each failed case. It handles every directory under the scratch `test-results/` that holds a `test-failed-*.png` or an `error-context.md`, and copies into `.run/ui-evidence/<scratch>/test-results/<case>/`:

- screenshots (`test-failed-*.png`) as they are;
- `error-context.md` and `wire-rows.json` (the observer's wire rows, written by `ResourceObserver.refused()` before it throws on a timeout), each passed through `redact(…, self.secrets)`. `self.secrets` is the harness secret list at copy time: the JWT, the sign-in token, the password, the stub token, `WEBUI_SECRET_KEY` and the minted session tokens. `redact` also registers and removes every `/ocu/f/<token>` grant segment it finds in the text.

`trace.zip` is never copied. Destination names come only from the scratch directory listing. The server logs are copied first. Each case file is then copied in its own `try`. A copy or redaction failure is logged with the case and file name. A failure to list the cases is logged with its exception type and skips the case copy. In both cases the branch still re-raises the original exception.

The `workspace-browser-failure` CI artifact uploads:

- the copied case evidence;
- the redacted `stub.log`, `backend.log`, `stub-restart.log` and `backend-restart.log`. `run_stack()` restarts the owned stub and backend before the browser starts, so the server output of the browser phase is in the `*-restart.log` files;
- the baseline specs' root `test-results/*/test-failed-*.png` and `test-results/*/error-context.md`.

`if-no-files-found: error` stays.

The baseline `error-context.md` is uploaded unredacted. The baseline specs run against the dev stack with seeded harness identities such as `admin@harness.local` and never receive OCU grants or minted sessions, so that file contains nothing the redaction list would remove.

## Alternatives considered

- **Retain traces with body redaction**: rejected. A trace holds headers, request and response bodies, and DOM snapshots in several encodings inside a zip. Making string redaction cover every copy of a cookie, bearer token or grant segment would need a trace-format parser. A missed encoding would publish a live credential in a CI artifact that is readable for seven days.
- **Upload the whole scratch `test-results/`**: rejected. It includes the trace archives and unredacted text.
- **Keep the failure output only in the CI log**: rejected. The log has the redacted reporter output, but no screenshot and no wire rows. Every intermittent failure would then need a blind rerun.

## Consequences

- A failing OCU case leaves its screenshot and its redacted error context. Redacted wire rows are left only when the failure is a `refused()` timeout. Other failures, for example the signed-expiry assertion (#606), leave screenshots and error context only. A failing baseline case leaves its screenshot and error context.
- Residual risk: a screenshot can show a short-lived grant URL in direct mode. That token comes from a throwaway CI harness instance with an ephemeral secret key. The same exposure already exists for `.run/ui-evidence/workspace-*.png`.
- Investigations that need the network timeline use `wire-rows.json`, the `wire-buffer-hits` stdout line and the popup trace, not a Playwright trace.
- `e2e/**/*.test.ts` joins the Vitest roots, so the side-effect-free `e2e/ocu-wire-rows.ts` has its paired unit test. This extends [frontend test discovery](2026-10-11-frontend-test-discovery.md).
