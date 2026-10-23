## MODIFIED Requirements

### Requirement: Confined relative symlinks in captured trees

Filesystem capture, verification and restore SHALL apply a link policy chosen by the captured component: deployment-owned trees (WebUI data volume, skills cache) use the confined policy and model-written trees (chat workspace volumes, chat data including outputs) use the verbatim policy. Under the confined policy, a symbolic link SHALL be accepted when its target is relative and, ignoring `.` and empty components, consists of zero or more leading `..` components followed only by normal components (no later `..` component), and whose number of leading `..` components does not exceed the depth of the link's parent directory below the captured root; any other symbolic link, including absolute targets and targets that would resolve outside the captured root, SHALL fail capture, verification and restore without creating destination data. Under the verbatim policy, any symbolic link with a non-empty target SHALL be accepted. An empty target SHALL be refused under both policies. Accepted links SHALL be captured and restored with their target unchanged. Under both policies, no member SHALL be created below a link, no hardlink SHALL target a link or a path outside the archive, and no restore step SHALL read, write, change the mode of or change the owner of a link's target. Capture and restore SHALL apply the same rule on every archive path. Restore through the Python fallback SHALL NOT create a member or apply its metadata through a symbolic link in the member's parent chain on disk, whatever the destination filesystem's name rules; the GNU tar path relies on the archive checks, GNU tar's handling and the post-extraction check.

#### Scenario: HuggingFace cache in the WebUI data volume

- **WHEN** a captured tree contains `models--x/snapshots/r1/model.safetensors -> ../../blobs/abc` and `models--x/blobs/abc`
- **THEN** capture succeeds, and restore into an empty destination recreates the link with target `../../blobs/abc`, through which the blob's bytes are read

#### Scenario: Escaping link

- **WHEN** an archive or a captured tree of a deployment-owned component contains a link such as `x -> ../y` at the root, `a/x -> ../../y`, `a/b/x -> a/../../../y`, `a/x -> b/../y`, or `a/x -> /etc/passwd`
- **THEN** capture, verification or restore fails with `unsafe symlink` and nothing is created in the destination

#### Scenario: Links accepted before stay accepted

- **WHEN** a captured tree contains links without `..` such as `a/x -> ./y`, `a/x -> b//y` or `a/x -> .`
- **THEN** capture and restore succeed and the links keep their targets

#### Scenario: Name alias on a case-insensitive filesystem

- **WHEN** an archive restored through the Python fallback holds `d/L -> ..`, `d/l/M -> ../..` and `d/l/m/evil`, and the destination filesystem treats `d/l` and `d/L` as one entry
- **THEN** restore fails with `unsafe parent` (or `existing target` when the alias collides with an already created directory) before writing through the link, and no file is created outside the destination

#### Scenario: Absolute links in a chat workspace

- **WHEN** a chat workspace volume or the chat data tree contains `bin/python3 -> /usr/bin/python3` and `a/x -> ../../outside`
- **THEN** backup publishes the recovery set, verification passes, and restore recreates both links with unchanged targets while files at those targets keep their content, mode, owner and timestamps

#### Scenario: Member below a link stays refused

- **WHEN** an archive of a model-written component holds `l -> /tmp` and `l/evil`
- **THEN** verification and restore fail before creating destination data
