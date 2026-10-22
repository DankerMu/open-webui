## ADDED Requirements

### Requirement: Account-save browser case is independent of the active-user badge

The browser case that saves the account settings and then fails the follow-up session lookup SHALL open Account settings from the user menu by the signed-in user's name, whether or not the menu's Account button also shows the active-user count badge. Its assertions about the save responses, the aborted lookup, the kept user, the URL and the token SHALL be unchanged.

#### Scenario: Badge rendered before the click

- **WHEN** the user menu's Account button shows `Harness Admin` followed by an active-user count of 1 at the time the case clicks it
- **THEN** the case opens Account settings, completes the save, and passes its existing assertions

#### Scenario: Badge absent

- **WHEN** the active-user count is 0, so the Account button shows only `Harness Admin`
- **THEN** the case opens Account settings, completes the save, and passes its existing assertions
