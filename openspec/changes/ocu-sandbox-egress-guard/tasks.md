# Tasks

## 1. Policy and reconciliation

- [ ] 1.1 Implement the single production rule definition, strict explicit allowlist parsing and authoritative bridge/backend/kernel-path checks; prove unset/empty/malformed policy and unsupported prerequisites through the actual CLI with isolated fake tools.
- [ ] 1.2 Implement `deploy/firewall/docker-user-rules.sh` with owned IPv4/IPv6 chains, first hooks, private process serialization and safe reconciliation; two sequential and cooperating concurrent runs leave one ordered copy and preserve seeded foreign rules.
- [ ] 1.3 Implement read-only `deploy/firewall/check.sh`; independent fixtures remove, duplicate, reorder or shadow each rule/hook family and require a specific nonzero diagnostic without firewall mutation.

## 2. Integration and independent evidence

- [ ] 2.1 Integrate installer/checker into `deploy/up.sh` through `run_owned` after provisioning, before any start, with explicit-empty allowlist support; fake failure/interruption/reused-bridge scenarios prove no starts and owned snapshot/child cleanup.
- [ ] 2.2 Evaluate installed fake rule state with an independent packet-policy oracle: allowed/unlisted public/company/host destinations, protected ranges under a broad allow, control-initiated replies, denied established original flows, forged source, non-sandbox traffic and IPv6 default deny.
- [ ] 2.3 Qualify the major judges using isolated policy faults and restoration: missing default DROP, reversed deny/allow order, missing reply/INPUT/IPv6 enforcement, source-only scope, duplicate/bypassed hooks, and ignored preflight failure. Preserve semantic rejection output, not setup or parser failures.
- [ ] 2.4 Run focused non-Docker regressions from submitted sources and verify the deployment CLI against fake tools; do not execute privileged firewall or Docker commands. Record exact commands, exits and unexecuted kernel evidence.

## 3. Documentation and acceptance handoff

- [ ] 3.1 Update network-hardening instructions, the umbrella integration delta and core network invariant; write the control-repo decision record with ordered-policy rationale, source-spoof/reply-path boundaries and supported backend requirements. Verify documentation and decision-record gates.
- [ ] 3.2 Record required real iptables/ip6tables, host-local/forwarded packet, DNS and CDP/ttyd evidence in #36; #79 remains mandatory before claiming full all-egress closure, and #27/#36 retain that dependency.
- [ ] 3.3 Obtain expanded fixture and implementation reviews, close bounded repair findings, and satisfy exact-head available CI; disabled Docker-build CI remains disabled under the user deferral.

## Risk mapping

- CLI: selected; actual installer/checker/deploy commands and exit contracts (1.1–1.3, 2.1).
- Config/project setup: selected; allowlist presence/emptiness, bridge identity, supported host prerequisites (1.1).
- File IO/path safety: selected; private owned lock and existing deployment snapshot cleanup (1.2, 2.1).
- Schema/columns/units: not selected; no persisted application schema change.
- Auth/permissions/security: selected; default deny, deny precedence, source spoofing, host/IPv6 paths (2.2).
- Concurrency/shared state: selected; chain ordering, cooperating installers, foreign-rule preservation (1.2, 1.3).
- Resource limits/discovery: not selected beyond bounded subprocess/lock handling; trusted operator configuration, no workload resource policy.
- Legacy compatibility/examples: selected; explicit default-deny behavior change and protected reply paths (2.2, 3.1).
- Error handling/rollback: selected; failed restore/check blocks starts; no global flush or destructive rollback (1.2, 2.1).
- Release/packaging/dependencies: selected; Linux iptables interface and kernel prerequisites, actual engine proof deferred (1.1, 3.2).
- Documentation/migration: selected; host reset invalidates readiness; DNS coverage is a named mandatory dependent slice (3.1, 3.2).
