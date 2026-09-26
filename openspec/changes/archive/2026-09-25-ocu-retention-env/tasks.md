# Tasks

## 1. Retention and provisioning

- [x] 1.1 Preserve stop-only retention and correct explicit-launch documentation; actual script tests prove overage/boundary stop, under-age/unmanaged preservation, invalid input rejection and no data/container deletion.
- [x] 1.2 Replace obsolete bootstrap source/image/publication defaults with explicit source/image/origin inputs and complete current topology/auth configuration; actual bootstrap-to-consumer tests prove deployment preflight, exact public-base/internal-auth URL composition, matched service tokens and unset/empty/malformed egress behavior.
- [x] 1.3 Wire prefix/no-autostart through the replacement core environment; prove consumer-visible settings and preserve existing sandbox credential-exclusion/lifecycle tests.
- [x] 1.4 Preserve private no-overwrite provisioning and temporary-file cleanup, with only a bounded output-path test seam; prove mode0600, preserved existing bytes and no secret disclosure on success/failure.
- [x] 1.5 Remove historical terminal patch and update version-record caller; prove generated provenance reflects environment policy and contains no credentials.

## 2. Independent acceptance

- [x] 2.1 Parent runs focused deployment tests and relevant non-Docker regressions using isolated fake tools only; qualify major provisioning/retention judges with semantic source faults and restoration in Git-only disposable exports.
- [x] 2.2 Update scoped deployment instructions and existing lifecycle decision references as needed, then run control doc-gate/decisions-verify and strict OpenSpec validation; record real startup/168h data-preservation evidence as deferred to issue36 and retain mandatory issue79 DNS boundary.
- [x] 2.3 Complete expanded fixture review, risk-scaled implementation cross-review and exact-head available CI; merge source/control changes, then archive this fixture without marking real-engine acceptance complete.

## Risk mapping

- CLI and config/project setup:1.1–1.3, actual script boundaries and downstream environment.
- File IO/path safety and auth/security:1.2/1.4, private output, explicit policy, token secrecy and overwrite refusal.
- Legacy compatibility/examples:1.1/1.5, no implicit restart and no historical patch.
- Error handling/rollback:1.2/1.4, fail before publication and preserve existing state.
- Documentation/migration:2.2, operator configuration migration and deferred real-host acceptance.
- Build/offline packaging and DNS routing: no implementation here; issues33/79. No Docker invocation, privileged firewall action or real credential-store access in this slice.
