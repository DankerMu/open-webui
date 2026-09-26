# Tasks

## 1. Policy and lifecycle

- [x] 1.1 Add one shared pure DNS policy implementation and package it in the server image; tests prove ordered syntax, duplicate/limit rejection, empty non-inherited override and unsupported input failures, with Docker-free startup validation.
- [x] 1.2 Apply current DNS at create/recreate and verify inspected DNS before start; existing authoritative fake-engine tests prove launch success or explicit refusal without deletion, including conflict/hostname-retry paths.
- [x] 1.3 Enforce compatibility before running reuse, start/unpause and stopped membership repair; test ordered mismatch, inherited DNS, preserved container/data/metadata and unchanged disabled/non-policy behavior through lifecycle and HTTP aliases.

## 2. Deployment boundary

- [x] 2.1 Require and privately provision DNS with explicit-empty semantics; wire the core environment and resolved-document agreement check, proving missing/omitted/mismatched settings cannot start services.
- [x] 2.2 Add the read-only protected-bridge DNS preflight before firewall installation/start, reusing allowlist/hard-deny authority; actual CLI tests prove resolver policy rejection and all-state/unlabelled container inspection with zero destructive side effects.
- [x] 2.3 Extend only necessary fake-engine/CLI state, then qualify creation, compatibility, preflight and forwarding judges with Git-only semantic source faults and restoration; parent runs focused and non-Docker regressions.

## 3. Review and acceptance handoff

- [x] 3.1 Update DNS environment documentation, existing egress/retention boundaries and a decision record; strict OpenSpec, doc-gate and decisions-verify pass, with image COPY/dependency direction reviewed.
- [x] 3.2 Record the pinned-engine DNS mapping, empty-policy, namespace traffic, embedded-name and CDP/ttyd acceptance obligations in issue36; no Docker/privileged commands before final development completion.
- [x] 3.3 Complete expanded fixture and implementation reviews, exact-head available CI, source/control merges and fixture archive; only then unblock dependent issue27, without claiming real-engine acceptance.

## Risk mapping

- CLI/config/project setup:1.1,2.1,2.2; required-empty semantics, supported resolver list and process exits.
- Auth/permissions/security:1.2,1.3,2.2; host-inheritance exclusion, hard denies, immutable refusal.
- Concurrency/shared state:1.3,2.2; existing lifecycle lock and refusal-before-mutation, point-in-time deploy check.
- Error handling/rollback and compatibility:1.2,1.3; no destructive migration, disabled/dev paths preserved.
- Release/packaging:1.1,3.1; explicit server COPY and stdlib-only shared module, no Docker build claim.
- Documentation/migration:3.1,3.2; operator migration and final routing acceptance boundaries.
