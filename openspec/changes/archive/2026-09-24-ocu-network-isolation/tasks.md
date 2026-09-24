# Tasks

## 1. Network lifecycle cutover

- [x] 1.1 Approve expanded fixture and strict validation; record user-selected non-destructive migration and deployment configuration ownership.
- [x] 1.2 Validate provisioned bridge and gateway/bind configuration; stateful fake-engine tests prove invalid config causes no creation/mutation, disabled create-stop-launch stays disabled, configured/inspected mode mismatch fails, and create/meta reconstruction selects exactly one bridge with gateway publications.
- [x] 1.3 Remove compose attach/discovery/address fallbacks and unused callers; address tests prove gateway plus assigned port, no mutation, unavailable without publication, preserved host/loopback parsing.
- [x] 1.4 Enforce membership before explicit launch/restart alias under existing locks; tests prove stop-launch, same-gateway recreated network IDs, unassigned dynamic ports, missing/dual/wrong-service bindings, create-conflict winner validation, live mismatch and repair errors preserve containers and do not falsely succeed.
- [x] 1.5 Update affected lifecycle/address fixtures and existing README/.env.example/changelog; tests remain CI-discovered under tests/orchestrator, no deploy/CI edits.

## 2. Verification and delivery

- [x] 2.1 Preserve semantic RED/GREEN evidence; run parent pinned Python3.12 non-Docker suite and direct lifecycle smoke, reporting fake-engine limits and no real L3 claim.
- [x] 2.2 Expanded correctness/state, network/config security and test-evidence review; bounded repair gate, exact-head CI/merge and fixture archive.
- [x] 2.3 Record issue24 patch retirement/config provisioning and issue36 compatible-repair versus explicit-preserved-failure Docker cases; actual Docker execution remains deferred by user until all development completes.

## Risk mapping

Network/config:1.2–1.3. State/compatibility and non-destructive migration:1.4. Error handling:1.2/1.4. Test evidence and CI discovery:1.5/2.1. Deployment and real-engine reachability are explicitly deferred, not claimed by unit tests.
