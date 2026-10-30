## ADDED Requirements

### Requirement: The Office editor opens in Simplified Chinese

The signed editor configuration that OCU returns when an Office editing session is created or joined SHALL set the editor interface language to Simplified Chinese (`editorConfig.lang = "zh"`) and the regional formats to `zh-CN` (`editorConfig.region`), for every user, inside the signed token as well as in the returned configuration.

#### Scenario: Opening a spreadsheet for editing

- **WHEN** a chat owner opens an XLSX file in the editor, whether the session is new or joined
- **THEN** the editor's menus and dialogs are in Simplified Chinese, dates and numbers default to Chinese formats, and the returned configuration still equals the signed token's payload
