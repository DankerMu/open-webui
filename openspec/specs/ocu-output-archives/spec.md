# ocu-output-archives Specification

## Purpose

Allow users to download completed visible workspace output files as a ZIP without exposing hidden staging or internal entries.

## Requirements

### Requirement: Visible output archive membership

An authenticated output archive request SHALL omit files whose output-relative path contains any dot-prefixed component, including `.upload-*` residue and visible leaves beneath hidden directories. Visible completed files SHALL retain their relative ZIP names and complete bytes. Hidden files SHALL remain untouched on disk. Existing archive authorization, response headers and missing/empty-directory errors SHALL remain unchanged.

#### Scenario: Active or stale hidden upload residue

- **WHEN** an open `.upload-*` file or a closed stale `.upload-*` file exists alongside a completed visible file
- **THEN** the ZIP contains the completed file with its full bytes and contains neither hidden entry
- **AND** the reader does not remove or modify those hidden files

#### Scenario: Hidden ancestor and visible nested output

- **WHEN** a hidden directory contains a visible leaf and an ordinary visible directory contains a completed file
- **THEN** the ZIP omits the hidden subtree and includes the visible nested file under its relative path with complete bytes

#### Scenario: No visible files

- **WHEN** the outputs directory contains only hidden files or files beneath hidden directories
- **THEN** the archive request returns the existing no-files HTTP404 response rather than a successful ZIP containing hidden data

#### Scenario: Published uploads remain archivable

- **WHEN** two successful uploads of distinct content request the same visible name
- **THEN** the archive contains both actual stored names with their complete distinct payloads
- **AND** archive filtering does not change no-replace publication, collision naming, attachment receipts or writer cleanup
