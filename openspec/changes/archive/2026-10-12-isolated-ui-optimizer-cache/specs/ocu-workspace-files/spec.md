## MODIFIED Requirements

### Requirement: Executable component and browser proof

Vitest SHALL exercise actual component state/lifecycle using the approved DOM runtime without weakening coverage thresholds. Playwright SHALL exercise the actual WebUI route through the existing proxy and deterministic real-chat fixtures, including the real merged Office SPA. Screenshots and zero unexpected console errors SHALL accompany A-T01/A-T10. Required harness prerequisites SHALL fail visibly rather than skip; owned services SHALL be stopped after verification.

The owned browser frontend SHALL keep mutable dependency-compilation state beneath its run-owned scratch, separate from the default frontend and other verification runs. Starting, using or cleaning up that frontend SHALL NOT overwrite or remove another frontend's dependency cache. An enabled harness without its required private cache location SHALL fail explicitly before serving rather than fall back to shared state.

#### Scenario: Repeatable verification

- **WHEN** make verify-ui runs with its documented local or CI prerequisites
- **THEN** A-T01/A-T10 run, evidence is saved and no closed panel retains owned work or process

#### Scenario: Existing dummy backend is not reused

- **WHEN** default dev-bg is already running with an unrelated or dummy OCU URL
- **THEN** workspace verification starts its own isolated configured backend/Vite pair and proves owner-chat describe plus real Office asset readiness through its proxy
- **AND** it stops only its owned services without changing or relying on the existing pair

#### Scenario: Reused frontend survives another dependency generation

- **WHEN** an owned browser run compiles a different dependency generation while a default frontend remains alive, and the default frontend subsequently rebuilds its module graph
- **THEN** the default page evaluates one coherent dependency generation without duplicate selection registration and renders successfully
- **AND** the owned run removes only its private cache during cleanup, preserving the default frontend's cache and existing browser assertions

#### Scenario: Missing private cache prerequisite

- **WHEN** the isolated browser frontend is enabled without its required private cache location
- **THEN** configuration fails with an actionable error before a frontend is served
- **AND** it does not create or use the default dependency cache as a fallback
