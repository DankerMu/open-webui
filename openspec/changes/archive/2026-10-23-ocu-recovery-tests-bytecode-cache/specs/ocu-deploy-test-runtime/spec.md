## ADDED Requirements

### Requirement: Recovery CLI tests pass as non-root in the stock image

The recovery CLI tests SHALL give every recovery CLI process they start, and the processes it starts, a writable bytecode cache under the test's temporary root, so that they pass as a non-root user in the stock Python image without a precompile step or extra environment flags.

#### Scenario: Non-root run in the stock image

- **WHEN** `python -m unittest test_recovery` runs from `tests/deploy` as uid 1001 in the plain `python:3.13` image with the CI dependencies and no extra environment flags
- **THEN** every test passes, including the activation cases that start the fake docker hundreds of times
