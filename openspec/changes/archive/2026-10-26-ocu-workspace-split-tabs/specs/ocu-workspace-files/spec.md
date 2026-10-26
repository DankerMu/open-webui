## MODIFIED Requirements

### Requirement: File tree preserves pagination and preview space

More files SHALL remain a named, muted full-width control after the loaded rows of the tree column, present only when another page exists and disabled while busy; it SHALL invoke the existing pagination action. The tree SHALL scroll independently within its column. Without an open file the tree SHALL use the full width and height of the Files area; with open files it SHALL occupy the left column and SHALL NOT be capped to a fraction of the panel height. Header presentation, iframe authority and protocol SHALL remain unchanged.

#### Scenario: Selection and another page

- **WHEN** a row is clicked, clicked again for an already selected Office file, or More files is activated
- **THEN** the existing respective selection/restart/pagination behavior occurs without duplicate actions
- **AND** the tree column scrolls independently while the opened file keeps the full column height, More files is absent without a cursor and disabled during its request

#### Scenario: Browser proof uses real nested fixtures

- **WHEN** the browser harness creates the nested-list scenario chat and opens Files in light and dark themes
- **THEN** it asserts nested folder rows, depth indentation, collapse/expand of an intermediate folder and selection styling, captures both screenshots and has zero unexpected console/page errors
- **AND** existing browser selectors and A-T01 generated-content isolation continue to pass

## ADDED Requirements

### Requirement: Opened files show beside the tree in tabs

In the Files view, opening a file SHALL split the Files area into the tree column on the left and an opened-file column on the right. The right column SHALL start with a tab list named `Open files` holding one tab per opened file in opening order, each with a decorative kind icon and its display name, and SHALL then show the `Selected workspace file` region filling the remaining height. The active tab SHALL be the persisted selection; activating a tree row or a tab SHALL use the existing selection action. A selection made elsewhere (restored preferences, a chat link) SHALL appear as a tab. Tabs SHALL be `role="tab"` elements, not buttons; no tab control SHALL carry a file name in a button's accessible name. Tabs whose file is no longer in the loaded listing SHALL be removed without a request. The tab list SHALL last for the open panel only. Browser and Terminal SHALL keep replacing the whole Files area at full width, and returning to Files SHALL show the same tabs.

#### Scenario: Open, add and switch

- **WHEN** a user clicks one file in the tree, then another, then the first tab
- **THEN** the area splits on the first click, a second tab is added and activated on the second, and the first file becomes the selection again on the tab click, each through the existing selection action and preference write

#### Scenario: Runtime views and restored selection

- **WHEN** a panel opens with a persisted selection, then the user switches to Browser and back to Files
- **THEN** the selection appears as the active tab beside the tree, Browser takes the full sidebar width without the tree, and the tab is still open after returning

### Requirement: Closing tabs keeps selection and Office edits coherent

Closing an inactive tab SHALL only remove it. Closing the active tab SHALL activate its right neighbour, else its left neighbour; closing the last tab SHALL clear the selection in the store and write `selected_file_id: null` through the existing preferences endpoint, and the tree SHALL return to full width. Each close control SHALL be a button named `Close tab`. Closing or switching away from the tab of an open Office editor SHALL go through the existing Office leave guard. A finished departure SHALL continue the close or switch whatever its save outcome, showing the existing result notice, as selecting another file does today. A departure superseded by a later guarded action SHALL drop the earlier action and perform the later one; a departure cancelled by closing the editor SHALL leave the tab and selection unchanged. When reconciliation clears the selection because the selected file is proven absent, the other tabs SHALL stay, none SHALL be activated automatically and the opened-file column SHALL state that no file is selected. Inactive tabs SHALL NOT keep an editor or preview alive. The close control SHALL carry no file name; it SHALL be described by its tab.

#### Scenario: Close order and last tab

- **WHEN** three tabs are open with the middle one active and the user closes it, then closes the remaining tabs
- **THEN** the right neighbour becomes active, and after the last close no file is selected, the preferences write carries `selected_file_id: null`, and the tree fills the area

#### Scenario: Open Office editor

- **WHEN** an Office editor is open in the active tab and the user closes that tab or activates another tab, and the departure finishes with a failed save
- **THEN** the leave guard runs before the change, the change completes and the result notice is shown

#### Scenario: Superseded and cancelled departures

- **WHEN** the user closes the editor's tab and, while that departure is pending, either activates another tab or uses Close editor
- **THEN** with the tab activation the closed tab stays open and the activated tab becomes the selection; with Close editor the tab and the selection stay unchanged

#### Scenario: Selected file deleted while other tabs are open

- **WHEN** two tabs are open and a complete reconciliation proves the active file absent
- **THEN** its tab is removed, the other tab stays inactive, no file is selected, no additional preference write occurs and the opened-file column states that no file is selected

### Requirement: The tree column is resizable and can be hidden

While files are open, the tree column SHALL have a keyboard- and pointer-operable vertical separator named `Resize file tree`, clamped so the tree keeps a minimum width and the opened-file column keeps at least 200 px, also after the outer panel shrinks; the width SHALL last for the open panel. Opening the first tab, closing the last tab and hiding or showing the tree SHALL NOT remount the tree, so its scroll position, focus and collapse state remain. A toggle in the tab bar named `Hide file tree` or `Show file tree`, with `aria-expanded` reflecting visibility, SHALL hide and show the tree column without closing tabs. When the last tab closes, the tree SHALL be visible again at full width. Existing panel separators SHALL keep their names.

#### Scenario: Resize and hide

- **WHEN** a user moves the separator with the arrow keys, hides the tree, then shows it again
- **THEN** the tree width changes within its bounds, hiding gives the opened file the full width with the tabs unchanged, and showing restores the tree at its width and scroll position

#### Scenario: Narrow sidebar

- **WHEN** a file is open in a sidebar at its minimum width or on a 390 px viewport
- **THEN** the opened-file column is at least 200 px wide and its selected-file bar does not overflow horizontally
