## ADDED Requirements

### Requirement: Receipt classification survives file-route fixture ordering

File-route verification fixtures SHALL preserve coherent receipt exception identity during execution and restore their owned module-cache entries to the exact entry objects or entry absence afterward. The direct receipt cleanup verification SHALL retain nominal exception classification and every existing committed-write, primary-error, cause, descriptor-retirement and complete-receipt assertion. Production classification SHALL remain unchanged.

#### Scenario: Either file-route fixture precedes receipt cleanup

- **WHEN** either independently minimized file-response or header predecessor runs before both receipt cleanup branches in one process
- **THEN** the receipt writer and test observe the same descriptor exception class
- **AND** both close-only and sync-and-close branches pass all original assertions

#### Scenario: Fixture exits after success or failure

- **WHEN** an affected fixture completes normally, its test body raises, or setup raises after owned module eviction
- **THEN** owned entry module objects and prior absence are restored without leaking replacement modules
- **AND** the original failure remains observable and a later receipt consumer uses a coherent module family

#### Scenario: Canonical full-root verification

- **WHEN** the unfiltered tests root runs with importlib mode in the qualified runtime environment
- **THEN** both receipt cleanup branches pass without reloads or weakened nominal assertions in the target
- **AND** discovered and executed nodes, skips and unrelated failures are reported explicitly rather than filtered into a success claim
