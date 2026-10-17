# Design

## Context

Make exports the seed defaults/overrides, then expands credentials into Hurl arguments. `seed.sh` independently resolves its fallback values and sends JSON through curl's data argument. The existing Office/resource private-variable helper belongs to a different Python harness; importing it into this shell entrypoint would couple unrelated lifetimes. Hurl8.0.1 supports secrets files and has passed a real local HTTP/report-redaction control.

## Goals / Non-Goals

- Invariant: credentials reach curl/Hurl through private files, never through any helper's exec argv; one owner retires children before removing those files.
- Preserve standalone `seed.sh`, Make seed/e2e/verify-ui callers, signin-first behavior, effective defaults/overrides and existing request/assertion coverage.
- No production auth, Office-cookie transport, dependency upgrades, dotenv access, general environment concealment, new retry policy or network-routing changes.
- No guarantee for SIGKILL/host crash. Ordinary environment visibility and secrets supplied in the operator's own Make argv remain outside the child-argv boundary.

## Decisions

Refactor `seed.sh` in place into a sourceable owner plus its existing executable entrypoint. Sourcing defines helpers without seeding or allocating scratch. A thin `smoke.sh` sources it, invokes the same seed flow, writes only the consumed Hurl secret variables, and runs Hurl inside that private lifetime. Make retains its health/start prerequisite but delegates credential-bearing work without interpolating values. No second cleanup implementation or compatibility alias remains.

The shared seed owner resolves its existing absent/empty fallback values once. Make's exported command-line values still override inherited environment values; smoke uses the resolved values rather than a separate Make expansion. Email/password defaults and nonempty operator overrides remain intact, while Hurl cannot diverge from the seed owner's effective values.

Use fresh0700 scratch and0600 request/secret/response files. Shell builtins can write existing request payloads without moving secrets to an encoder's argv. Run at most one owned transport child at a time; interruption cleanup must reach that actual child, including while waiting. Avoid losing child ownership inside command substitution. Preserve nonzero failures and retire/remove only owned resources.

Use Hurl `--secrets-file`, not `--secret name=value` or a plain variables file: the former still leaks argv and the latter lacks report redaction. Existing Office/resource variable precedence and transport stay untouched. Document this boundary in a testing decision referencing the existing private-file gateway policy; no active record is superseded.

## Verification and Risks

- A controlled real script invocation observes actual child argv, file bytes/modes and cleanup, never source-text matches or secret-bearing assertion output.
- Fault cases cover both seed and Hurl transport lifetimes: child nonzero, missing executable and SIGINT/SIGTERM/SIGHUP while active; preserve unrelated sentinels and prove no surviving owned child.
- Defaults, environment overrides and Make command-line precedence must agree across seed/Hurl; explicit empty follows seed's established fallback. No new general input-validation policy is introduced.
- Parent executes real `make smoke` with distinctive synthetic credentials in an owned harness data directory, checks HTTP success and Hurl report redaction, then stops services and removes only its owned data/scratch.
- Required checks: focused regression, existing Office credential-file regression, scoped lint, doc/decision gates and expanded review. Parent owns evidence; workers do not edit the fixture or run checks.

## Rollback

Revert the focused cutover. No schema or persisted-format migration exists. Private artifacts are per-run; a failed cleanup is reported, never represented as a successful privacy result.
