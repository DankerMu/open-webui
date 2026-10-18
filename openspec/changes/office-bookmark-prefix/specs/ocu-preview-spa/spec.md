# Spec Delta

## ADDED Requirements

### Requirement: Office bookmark namespacing preserves local navigation

Office previews SHALL preserve navigation to ordinary and already-namespaced bookmark targets after sanitization. Accepted fragments SHALL resolve only to IDs in the sanitized fragment, never to unrelated page nodes. Malformed encoding and absent targets SHALL lose their link destination. Existing sanitizer, external-link and image restrictions SHALL remain unchanged.

#### Scenario: Real DOCX bookmark navigation

- **WHEN** a genuine DOCX with ordinary and already-prefixed bookmarks is converted and displayed in embedded or standalone preview
- **THEN** clicking each bookmark link moves its initially offscreen target into the visible preview area
- **AND** the already-prefixed target receives no second namespace prefix

#### Scenario: Invalid or out-of-fragment targets

- **WHEN** converted Office markup contains an encoded valid fragment, malformed encoding, a missing target or a target found only elsewhere on the page
- **THEN** the valid fragment navigates to its sanitized local target
- **AND** malformed, missing and unrelated-page targets have no active link destination
- **AND** other Office sanitization restrictions remain enforced
