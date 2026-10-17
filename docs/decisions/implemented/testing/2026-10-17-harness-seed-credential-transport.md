---
id: 2026-10-17-harness-seed-credential-transport
title: Invocation-owned private seed and smoke credentials
kind: testing
status: implemented
date: 2026-10-17
supersedes: none
references: issue-375, 2026-09-25-ocu-cookie-gateway-and-paired-smoke
---

# Invocation-owned private seed and smoke credentials

## Problem

Generic harness authentication must not expose operator-selected passwords in curl, Hurl or helper process arguments. File transport alone is insufficient if reports retain the password, seed and smoke resolve different values, or cleanup removes files while a transport child still consumes them.

## Decision

`scripts/seed.sh` defines sourceable helpers without executing authentication, allocating scratch or changing caller options and traps. Its executable entrypoint and `scripts/smoke.sh` use the same owner: resolve existing absent/empty credential defaults once, try signin before signup, and allocate one fresh mode0700 scratch directory per invocation. Make command-line values retain precedence over inherited environment values. Make smoke retains its service health/start prerequisite and delegates credential-bearing work without expanding values into a recipe.

Curl consumes mode0600 JSON request files through `--data-binary @path`; response and status files are private as well. Smoke writes only its consumed seed variables to a mode0600 Hurl `--secrets-file`. Shell builtins write payloads without passing credentials to encoder subprocesses. The existing Hurl request set and assertions remain authoritative.

The owner tracks at most one active transport PID in the parent shell. Catchable INT, TERM and HUP defer exit until scratch ownership and PID assignment are recorded. Cleanup terminates the child, allows a bounded retirement interval, escalates if necessary, reaps it, then removes only the owned scratch. Normal completion, child nonzero exit and missing executables share that cleanup. Nonzero transport/interruption statuses remain nonzero; cleanup failure makes an otherwise successful invocation fail.

`make test-harness-seed` exercises executable receivers and a stateful loopback authentication boundary: actual argv privacy, effective credentials, signin-first account transitions, file permissions, successful cleanup, failure/launch/interruption lifetimes and unrelated-resource preservation. Fixture diagnostics hold exact-match credential predicates rather than printable expected values. Controlled receivers accept inline and file CLI shapes so a privacy regression fails on disclosure, not receiver setup. A receiver-only, explicitly supplied cleanup-noop mode supports independent residue-oracle qualification; the default fixture environment inherits no such knobs. Real WebUI/Hurl execution and report-redaction acceptance are separate from these controlled tests.

This applies the [private-file gateway policy](../architecture/2026-09-25-ocu-cookie-gateway-and-paired-smoke.md) to generic seed/smoke ownership. Office and resource request-variable transport remains separate; that decision is not superseded.

## Alternatives considered

- **Inline curl JSON or Hurl `--secret name=value`** — still exposes the password in child argv.
- **Hurl `--variables-file`** — hides values from argv but does not mark them secret for report redaction.
- **Separate seed and smoke cleanup implementations** — allows credential defaults and resource lifetimes to diverge.
- **Capture a transport through command substitution** — loses direct ownership of the active transport PID in the shell responsible for cleanup.
- **Reuse the Python Office transport helper** — couples independent shell and Office request lifetimes.

## Consequences

Standalone seed and its Make seed/e2e/UI callers retain their entrypoints and signin-first behavior. Generic smoke depends on Hurl secrets-file support already provided by the pinned Hurl8.0.1. Environment visibility and credentials supplied in the operator's own Make command line remain outside the child-argv guarantee. Cleanup is not guaranteed after owner SIGKILL or host failure; no production authentication policy, retry behavior or Office configuration changes are implied.
