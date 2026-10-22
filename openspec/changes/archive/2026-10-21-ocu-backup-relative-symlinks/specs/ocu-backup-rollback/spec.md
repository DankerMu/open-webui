## ADDED Requirements

### Requirement: Confined relative symlinks in captured trees

Filesystem capture and restore SHALL accept a symbolic link whose target is relative and, ignoring `.` and empty components, consists of zero or more leading `..` components followed only by normal components (no later `..` component), and whose number of leading `..` components does not exceed the depth of the link's parent directory below the captured root. An empty target SHALL be refused. Such a link SHALL be captured and restored with its target unchanged. Any other symbolic link, including absolute targets and targets that would resolve outside the captured root, SHALL fail capture, verification and restore without creating destination data. Capture and restore SHALL apply the same rule on every archive path. Restore through the Python fallback SHALL NOT create a member or apply its metadata through a symbolic link in the member's parent chain on disk, whatever the destination filesystem's name rules; the GNU tar path relies on GNU tar's handling and the post-extraction check.

#### Scenario: HuggingFace cache in the WebUI data volume

- **WHEN** a captured tree contains `models--x/snapshots/r1/model.safetensors -> ../../blobs/abc` and `models--x/blobs/abc`
- **THEN** capture succeeds, and restore into an empty destination recreates the link with target `../../blobs/abc`, through which the blob's bytes are read

#### Scenario: Escaping link

- **WHEN** an archive or a captured tree contains a link such as `x -> ../y` at the root, `a/x -> ../../y`, `a/b/x -> a/../../../y`, `a/x -> b/../y`, or `a/x -> /etc/passwd`
- **THEN** capture, verification or restore fails with `unsafe symlink` and nothing is created in the destination

#### Scenario: Links accepted before stay accepted

- **WHEN** a captured tree contains links without `..` such as `a/x -> ./y`, `a/x -> b//y` or `a/x -> .`
- **THEN** capture and restore succeed and the links keep their targets

#### Scenario: Name alias on a case-insensitive filesystem

- **WHEN** an archive restored through the Python fallback holds `d/L -> ..`, `d/l/M -> ../..` and `d/l/m/evil`, and the destination filesystem treats `d/l` and `d/L` as one entry
- **THEN** restore fails with `unsafe parent` (or `existing target` when the alias collides with an already created directory) before writing through the link, and no file is created outside the destination

### Requirement: Recovery helper failures name their cause

When a recovery helper container that captures or restores a volume exits unsuccessfully, the resulting error SHALL include the helper's reported reason (its standard error, or standard output when standard error is empty), bounded in length, together with the volume name.

#### Scenario: Volume capture refused by the helper

- **WHEN** the helper capturing a volume exits with an error reporting `unsafe symlink a/b`
- **THEN** the backup error names the volume and contains `unsafe symlink a/b`
