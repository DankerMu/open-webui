## ADDED Requirements

### Requirement: Status word never breaks between letters

The Office editor status bar SHALL keep each word of its status text whole. When the status text, the "Workspace file changed" notice and the editor controls do not fit on one line at the sidebar's width, the bar SHALL wrap whole items onto further lines rather than narrowing the status text below its longest word. A single token wider than the whole bar SHALL wrap inside the bar instead of overflowing it.

#### Scenario: Conflict with a change notice in the default-width sidebar

- **WHEN** the non-maximized sidebar shows the status `Conflict`, the "Workspace file changed" notice and the Save, Version history, Maximize and Close editor buttons
- **THEN** `Conflict` is rendered on one line and the buttons that do not fit move to a further line of the bar
