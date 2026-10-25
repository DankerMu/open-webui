## ADDED Requirements

### Requirement: An out-of-space status read is transient

When an Office session status read fails because its own state write (activity and notice) runs out of space, OCU SHALL answer HTTP 503 with reason `storage_low`. Other failures of the status read SHALL keep their existing answers, so real state corruption still ends the editor.

#### Scenario: Disk full while the user edits

- **WHEN** the editor has loaded, the chat's filesystem fills up so the status read's state write fails with an out-of-space error, and space is later freed
- **THEN** status reads answer 503 `storage_low`, the editor never shows a final failure, Save stays available, and status is applied again once a status read succeeds

#### Scenario: Corrupt state or another OS error

- **WHEN** the status read fails because the Office `state.json` or the broker index is corrupt, or a state write fails with a non-ENOSPC OS error such as EIO
- **THEN** OCU answers 500 `state_corrupt` as before
