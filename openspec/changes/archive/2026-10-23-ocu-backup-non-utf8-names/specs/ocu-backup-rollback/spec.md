## ADDED Requirements

### Requirement: Backup keeps file names that are not valid UTF-8

Capture SHALL accept a member whose file name, directory name or symlink target is not valid UTF-8, on both the GNU tar and the Python path, and extraction on either path SHALL recreate it with the same bytes.

#### Scenario: GBK-named file

- **WHEN** a captured tree holds a file whose name is GBK bytes that are not valid UTF-8
- **THEN** capture, verify and extract succeed and the extracted file has the same name bytes and contents

#### Scenario: Non-UTF-8 directory name

- **WHEN** a captured tree holds a directory whose name is not valid UTF-8, containing a file
- **THEN** the extracted directory has the same name bytes and holds the same file

#### Scenario: Non-UTF-8 symlink target on the Python path

- **WHEN** the Python capture path captures a symlink whose target bytes are not valid UTF-8, under the verbatim policy, and the archive is extracted on the GNU path
- **THEN** the extracted symlink has the same target bytes
