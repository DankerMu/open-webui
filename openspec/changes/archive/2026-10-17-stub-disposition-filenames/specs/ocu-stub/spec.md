# Spec Delta

## ADDED Requirements

### Requirement: Accepted quoted filename characters survive disposition serialization

The stub SHALL preserve accepted literal double quotes and backslashes in uploaded leaf names through both inline and attachment Content-Disposition responses. Each response SHALL contain one syntactically valid disposition field whose standards-aware parsing recovers the exact uploaded POSIX leaf name. Stored names, retrieved bytes, existing disposition-mode selection and control-character rejection SHALL remain unchanged.

#### Scenario: Quote and backslash uploads retain exact display names

- **WHEN** each of `a"b.txt` and `a\b.txt` is uploaded into a fresh chat and retrieved normally and with `download=1`
- **THEN** the stored name and response bytes equal the upload
- **AND** each response has one valid disposition field, with inline or attachment respectively, and parsing recovers the exact quote or backslash in the leaf name

#### Scenario: Nested and ordinary names retain their established behavior

- **WHEN** an accepted nested POSIX path containing quote/backslash characters, or an ordinary filename, is uploaded and retrieved in either mode
- **THEN** disposition identifies only its unchanged leaf, without treating a backslash as a separator
- **AND** the ordinary quoted filename representation, retrieval bytes and response mode remain unchanged

#### Scenario: Rejected controls remain outside stored state

- **WHEN** existing control-character or traversal rejection cases are submitted
- **THEN** their rejection status, unchanged listing and non-retrievable paths remain unchanged
- **AND** no malformed or injected disposition field is emitted
