## ADDED Requirements

### Requirement: Office sweep safety probe survives execution ordering

The Office sweep lifecycle-lock safety test SHALL preserve its real precheck, canary swap and positive lock-attempt observation under bounded and canonical full-root execution. Test-owned module state SHALL NOT redirect admission to a stale manager or otherwise suppress the tested path. Repairs SHALL preserve all existing assertions that the canary is neither opened nor flocked and that its bytes, inode, mode and directory entries remain unchanged. Production admission and lock semantics SHALL remain unchanged.

#### Scenario: A preceding test changes module state

- **WHEN** the minimized same-process predecessor sequence runs before the sweep safety probe
- **THEN** the probe observes a real lifecycle-lock path-open after the successful precheck and canary swap
- **AND** all canary preservation assertions remain active and pass

#### Scenario: Canonical execution exercises the safety boundary

- **WHEN** the unfiltered tests root executes with importlib mode in a qualified environment
- **THEN** the sweep safety probe completes with positive lock reachability and canary exclusion evidence
- **AND** every unrelated failure or skip is reported separately rather than converted into a full-suite success claim

#### Scenario: Diagnosis preserves confidentiality and oracle integrity

- **WHEN** execution fails between the precheck and lock opening
- **THEN** evidence identifies the admission result, exception class, relevant module identities and flock depth without exception text or credentials
- **AND** no skip, manufactured admission success, weakened assertion or production-lock change substitutes for fixing the established test owner
