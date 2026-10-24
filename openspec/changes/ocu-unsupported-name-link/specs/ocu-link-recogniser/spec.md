## ADDED Requirements

### Requirement: A link to a listed unsupported-name entry selects it

When a current-chat preview link matches no listed entry by URL, link resolution SHALL match a listed entry marked `unsupported_name` whose display `path` equals the link path decoded once, select that entry, and stop reading listing pages once it is seen. A link path that cannot be decoded SHALL NOT match a marked entry. A path absent from a complete listing SHALL still show the missing-file notice.

#### Scenario: Backslash link to a marked entry

- **WHEN** the listing holds an entry with `path` `a\b.html`, `url` null and `unsupported_name` true, and the user activates the current-chat link `/ocu/files/<chat>/a%5Cb.html`
- **THEN** that entry is selected, its no-action fallback and reason show, and no "Selected file was removed" notice appears
