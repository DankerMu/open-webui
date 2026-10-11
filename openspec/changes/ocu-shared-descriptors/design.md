# Design

## Context

`uploads.py` and `outputs_broker.py` repeat no-follow directory/regular-file flags, missing/no-follow errno classifiers and open/fstat/type/cleanup operations. Their wrappers intentionally differ: uploads returns HTTP traversal errors or FileNotFoundError; broker distinguishes UnsafePathError, UnstableReadError and scan-only descriptor exhaustion. Broker fstat/type failures are not always equivalent to failures in the preceding os.open.

## Goals / Non-Goals

Governing invariant: shared acquisition returns one owned verified descriptor or releases what it acquired, while each caller retains exactly its accepted failure classification and borrowed descriptors remain usable.

Preserve: upload publication/receipts; MCP bytes/MIME; file/archive responses; broker identity/index atomicity; hidden/symlink handling; scan budgets and scan-vs-registration EMFILE/ENFILE mapping; unsupported-platform constructor behavior; descriptor lifetime under path swaps and faults.

Non-goals: broker/Office business logic, Office workspace primitive consolidation, new error policy, generic callback frameworks, altered discovery bounds, route rewrites, archive memory work, dependency changes or deployment certification.

## Decisions

Extract only common low-level flags/classifiers and verified directory/file acquisition into a small pure module. Keep caller-specific wrappers where they translate errors or apply scan context; delete duplicate mechanical implementations, not meaningful policy seams. Existing higher-level path walks can compose the shared directory/file operations without becoming a new generic traversal framework.

Preserve operation-phase distinctions explicitly. An open-time missing/no-follow/OS-resource failure, a rejected fstat type, and an fstat exception may have different existing caller outcomes. A small neutral failure representation is acceptable if needed to retain those distinctions; do not unify HTTP and broker exception classes, expose new exceptions at public callers, or add callback-driven error translation.

Staging/write flags and publication stay local. The broker's read-only control-directory open may share read flags/acquisition only without changing its accepted errors or extra policy. Unsupported-platform checks remain at their existing caller boundary. No compatibility aliases or duplicate fallback implementations remain after cutover.

Sibling consumers: upload mkdir/no-replace paths call read-directory helpers; MCP and completed archive/file routes use the uploads reader; broker control/index/scan/registration use its wrappers. Audit every read-open call within these two owners and verify preserved semantics. Office modules are separate owners and outside this extraction.

The server Dockerfile copies modules explicitly: add the shared module to packaging and prove isolated app import from declared COPY inputs. Fixtures that replace a dependency module must replace/restore its new dependent module coherently; keep behavior assertions unchanged.

## Required evidence

Before production edits, capture accepted real-filesystem outcomes for both caller families: directory and regular success; leaf/directory symlinks; missing paths; regular-vs-directory/special type mismatch; open failures and fstat failures; scan EMFILE/ENFILE versus non-scan registration; exact owned closure and borrowed-root survival. Include current public consumer tests as reference GREEN.

Qualify containment judges by removing no-follow protection in disposable baseline copies, separately for uploads and broker, and require semantic rejection rather than import/setup errors. Restore baseline GREEN. New shared-module tests are authored before the module; missing-import failures are setup signals, not equivalence proof. Compare candidate observations to the frozen baseline without normalizing away class/status/errno/message or ownership differences.

Run owning upload/MCP/broker/outputs tests plus file/archive/lifecycle regressions affected through the reader and all modified fixture owners. Independent actual HTTP uses benign temporary files to verify upload collision/receipts, file/archive containment and broker listing/error outcomes, then cleans only owned services/trees. Retain fingerprints, failures, exits and explicit host limits.

## Migration / Risks

One atomic extraction, no state migration or parallel implementation. Revert restores the accepted baseline. Error-phase conflation and stale test-module bindings are primary risks; characterize before extraction and test the complete consumer matrix. No new concurrency or performance claim; existing filesystem-latency and same-inode snapshot limits remain.
