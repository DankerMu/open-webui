# Office request credential ownership

## Context

The Office judge retains variables between serial requests; serializing that map into `--variable` arguments exposes prior cookies too.
The generic runner already loads a base0600 variables file inside owned0700 scratch.
Actual Hurl8.0.1 probing confirms a later variables file overrides the earlier one and preserves an explicit empty value.

## Decisions

Change surface: `OfficeJudge.request`; paired tests under the existing backend smoke-test conventions.
Use a securely created per-request temporary file in `smoke.scratch`, containing the complete effective Office map in the existing Hurl properties format.
Flush before invoking Hurl; pass only its path through a later `--variables-file` option. Keep the base variables file and generic runner unchanged.
Lexically own the temporary file through child execution so normal completion, nonzero Hurl status, launch errors and interruption unwind cleanup.
Must preserve: retained noncredential state, explicit current-value precedence, anonymous empty cookies, inherited base owner credentials and every matrix assertion.
Governing invariant: Office credential values never enter child argv, while Hurl receives the intended effective values from a private, request-owned file.
Sibling surfaces: base variables-file creation, generic Hurl invocation, Office denial/unlisted callers, Office templates, scratch lifecycle and report redaction.
No product auth changes, broad helper rewrite, new credential validation, retries or permanent files.

## Evidence

Permanent tests exercise the real judge and generic runner up to the subprocess boundary, replacing only the child dependency; inspect permissions, effective values, argv and cleanup without printing credentials.
The first test must fail against the original code for the argv exposure, not for an absent helper or unrelated setup.
Cover owner then retained-owner, non-owner, explicit anonymous and retained-empty transitions; a current empty value must not inherit a prior cookie.
Inject nonzero child status, process-launch failure and interruption; each propagates failure and removes the dedicated file while preserving base files.
Parent real-Hurl HTTP control proves file precedence and empty-cookie transmission.
Parent `make smoke-proxy` with a transparent Hurl launcher audit must retain seven owner rows,24auth/guard denials and five unlisted denials; audit every Office child argv privately and report booleans/modes/counts only.
Verify private files are gone after runtime completion; stop only owned services and preserve the source checkout's ignored state.

## Risks / Trade-offs

Per-request files add bounded local IO; separate ownership avoids rewriting shared base credentials.
File permissions protect other local users, not privileged readers or all same-UID access; no broader secrecy claim.
Verification targets existing macOS/Linux POSIX runners and Hurl8.0.1. No dependency upgrades or deployment certification.
Rollback is reverting the transport change; no persisted application data migration.
