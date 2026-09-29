# ocu-pyodide-materials Specification

## Purpose

Define the supported browser Python material closure, content integrity and failure-safe publication required for local Pyodide execution without WAN access.

## Requirements

### Requirement: Supported package material closure

Preparation SHALL produce local runtime files and a standard Pyodide lock resolving every existing supported package root and its transitive dependency closure. Supplementary pure-Python wheel versions and hashes SHALL be explicit; normal preparation SHALL NOT resolve unversioned latest packages or overwrite the resolved lock with distribution metadata.

#### Scenario: Clean-directory preparation

- **WHEN** preparation runs with no previously generated assets
- **THEN** every supported package and dependency resolves to verified local wheel bytes and the final lock identifies the installed pinned runtime

#### Scenario: Stable repeated inputs

- **WHEN** preparation repeats with the same distribution and supplementary inputs
- **THEN** its lock and material hashes remain identical and existing package versions do not change

### Requirement: Fail-closed integrity and publication

Preparation SHALL reject missing dependencies, unsafe material filenames, unavailable downloads and hash mismatches. A cached file SHALL be trusted only after content verification. Failed preparation SHALL exit nonzero and SHALL NOT replace a previously valid published bundle with partial output.

#### Scenario: Corrupted cached material

- **WHEN** cached bytes differ from the expected SHA256
- **THEN** they cannot be accepted as a successful material; preparation either replaces them with verified bytes or fails without publishing inconsistent state

#### Scenario: Failure before publication

- **WHEN** a supported wheel download or final publication fails
- **THEN** the command fails, owned staging is cleaned and the prior valid bundle remains available

### Requirement: Browser runtime without WAN

The supported package set SHALL install and execute from the local Pyodide index with WAN requests denied. Numerical/table operations, seaborn plotting and openpyxl workbook round-trip SHALL succeed; the verifier SHALL fail on any nonlocal request or missing material rather than masking it with a network fallback.

#### Scenario: Air-gapped browser package execution

- **WHEN** the browser loads locally prepared assets while every nonlocal request is rejected and observed
- **THEN** all supported roots import and representative operations produce their expected results with zero nonlocal requests

#### Scenario: Missing-wheel counterexample

- **WHEN** one required wheel is removed from an otherwise valid disposable bundle
- **THEN** verification fails for the missing package material and cannot report offline success
