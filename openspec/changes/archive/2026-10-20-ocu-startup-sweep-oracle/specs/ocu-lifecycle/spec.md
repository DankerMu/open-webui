## ADDED Requirements

### Requirement: Startup sweep verification exercises the real lifespan

OCU lifecycle tests SHALL NOT claim anything about Docker construction during application startup from an app whose lifespan was entered by a fixture before the claim's guard was installed, or whose startup sweep was replaced. Startup-sweep coverage SHALL prepare its data root, managed metadata and environment before a fresh app is imported, SHALL start with no cached Docker client, and SHALL keep the production lifespan, background reaper, startup sweep and Docker client accessor. It SHALL observe the background sweep through a recording Docker double, SHALL wait with a bounded timeout for a barrier reached only after the startup sweep has returned, and SHALL assert the actual construction and container lookup for the seeded managed chat. It SHALL NOT rely on an exception propagating from the background reaper or on a successful health response. The assertion SHALL be specific to the seeded managed state and SHALL NOT claim that startup never contacts Docker.

#### Scenario: Startup sweep looks up a managed sandbox

- **WHEN** a fresh app starts with one managed chat directory, one unmanaged sibling and no cached Docker client
- **THEN** the startup sweep constructs the Docker client for the configured socket, pings it once, and looks up exactly the managed chat's container

#### Scenario: Startup sweep wiring is removed

- **WHEN** the background reaper no longer runs the startup sweep
- **THEN** the startup-sweep test fails because no construction or lookup was recorded, instead of passing on a healthy response

#### Scenario: No fixture-entered startup claim remains

- **WHEN** a lifecycle test uses the shared fixture that entered the lifespan with the startup sweep replaced
- **THEN** that test makes no claim about Docker construction during startup
