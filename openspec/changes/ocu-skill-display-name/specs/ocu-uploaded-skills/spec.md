## MODIFIED Requirements

### Requirement: Administrator listing with grants

`GET /api/v1/ocu/skills/admin` SHALL return every uploaded skill as `{name, description, display_name, zip_sha256, size, created_by, updated_at, access_grants}`, without loading the ZIP bytes. `display_name` SHALL be the stored display name, or `null` when none is set. `access_grants` SHALL list the skill's current read grants as `{principal_type, principal_id, permission}` entries, the same format `POST /{name}/access` accepts and the `AccessControl` component consumes. The everyone grant appears as `user` / `*` / `read`. The responses of `POST /{name}/access` and `POST /{name}/display-name` SHALL use this same item shape.

#### Scenario: Listing shows the current grant set

- **WHEN** skill `a` holds the `user:*` read grant and skill `b`'s only grant is group A read
- **THEN** the listing shows `a` with exactly the `user` / `*` / `read` grant and `b` with exactly the group A read grant, and neither item carries the ZIP bytes

#### Scenario: Listing shows the display name

- **WHEN** skill `a` has display name `发票生成` and skill `b` has none
- **THEN** the listing shows `a` with `display_name: "发票生成"` and `b` with `display_name: null`

#### Scenario: Access response shape

- **WHEN** an administrator updates the access of skill `a`
- **THEN** the response item has exactly the listing's fields, including `display_name`

## ADDED Requirements

### Requirement: Administrator display name

An administrator SHALL be able to set, change and clear an optional display name for each uploaded skill, through `POST /api/v1/ocu/skills/{name}/display-name`.

Request body:

- The body SHALL be a JSON object whose `display_name` key is present and is a string or `null`.
- A missing key, any other type, or a body that is not such an object SHALL return 422 and change nothing.

Stored value:

- The server SHALL trim surrounding whitespace.
- An empty string after trimming, or `null`, SHALL clear the name.
- A stored name SHALL be at most 32 characters.
- A stored name SHALL contain no `<`, no `>`, no control character (Unicode `Cc`), no surrogate (`Cs`) and no format character (`Cf`, which includes bidi controls and zero-width characters). `|` is allowed.
- A stored name SHALL contain at least one letter, digit, punctuation mark or symbol (Unicode category class `L`, `N`, `P` or `S`).
- Display names need not be unique.

Lifecycle:

- A ZIP replace SHALL keep the display name.
- A hard delete SHALL remove the display name with the skill, so a later upload of the same name starts without one.

Unchanged:

- The skill's `name` SHALL remain its only identifier.
- The internal registry responses SHALL NOT change.

#### Scenario: Set and list

- **WHEN** an administrator sets the display name of `invoice-builder` to ` 发票生成`
- **THEN** the response and `GET /admin` show `display_name: "发票生成"`

#### Scenario: Boundary length accepted

- **WHEN** an administrator sets a 32-character display name, or one containing `|`
- **THEN** it is stored as given

#### Scenario: Clear

- **WHEN** an administrator sets the display name to `""`, to `"   "` or to `null`
- **THEN** `GET /admin` shows `display_name: null`

#### Scenario: Rule violations

- **WHEN** an administrator submits a 33-character name, a name containing `<`, a name containing `>`, a name containing a line break, a name containing a tab, a name containing a lone surrogate, a name containing a bidi control such as `U+202E`, a name containing a zero-width space, or a name made only of combining marks
- **THEN** each response is 400 with the reason as its detail string, and the stored name is unchanged

#### Scenario: Malformed body

- **WHEN** an administrator sends `{}`, `{"display_name": 123}` or `{"display_name": true}`
- **THEN** each response is 422 and the stored name is unchanged

#### Scenario: Unknown skill

- **WHEN** an administrator sets the display name of a name that is not uploaded
- **THEN** the response is 404

#### Scenario: Not an administrator

- **WHEN** a user-role caller, or a caller without a session, sets a display name
- **THEN** the response is 401 and the stored name is unchanged

#### Scenario: Workspace disabled

- **WHEN** `ENABLE_OCU_WORKSPACE` is not `true` and an administrator calls the route
- **THEN** the response is 404

#### Scenario: Replace keeps the name

- **WHEN** `invoice-builder` has display name `发票生成` and an administrator uploads a new ZIP with the same name
- **THEN** `GET /admin` still shows `发票生成`

#### Scenario: Delete removes the name

- **WHEN** an administrator deletes `invoice-builder` and later uploads a skill named `invoice-builder` again
- **THEN** `GET /admin` shows `display_name: null` for it

#### Scenario: Internal contract unchanged

- **WHEN** OCU requests the internal user-config for a user whose enabled skill has a display name
- **THEN** the response body has the same fields as before this change
