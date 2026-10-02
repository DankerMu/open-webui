# Spec Delta

## ADDED Requirements

### Requirement: Credential-isolation verification exercises successful startup

The OCU credential-injection and CLI-isolation tests SHALL verify their existing environment assertions after the production startup-state and DNS guards succeed against a faithful Docker test fixture. They SHALL control DNS inputs independently of the invoking shell. They SHALL NOT bypass production guards, skip failing cases, or weaken credential-isolation assertions to obtain success.

#### Scenario: No configured DNS in the invoking shell

- **WHEN** the environment-injection and CLI-isolation test modules run without a host DNS setting
- **THEN** their successful Docker fixtures pass real startup guards and all existing credential assertions execute and pass

#### Scenario: Valid configured DNS in the invoking shell

- **WHEN** the same modules run with a valid host DNS setting
- **THEN** the fixtures use controlled, consistent requested and inspected DNS values and all existing credential assertions execute and pass

#### Scenario: Complete unit suite retains its evidence

- **WHEN** the documented OCU unit suite runs after the fixture repair
- **THEN** the repaired cases pass alongside existing lifecycle and DNS failure cases without new skips or disabled guards
