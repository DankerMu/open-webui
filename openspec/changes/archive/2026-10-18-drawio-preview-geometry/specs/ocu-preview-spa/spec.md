# Spec Delta

## ADDED Requirements

### Requirement: Ordinary Drawio geometry remains fully visible

Standalone ordinary Drawio preview SHALL NOT clip otherwise-fitting geometry, rounded corners or strokes through its decorative host box. A user SHALL NOT need fullscreen or manual zoom reduction to reveal that content. Selection and revision replacement SHALL preserve this behavior. Existing page, zoom, Fit and fullscreen controls SHALL remain usable without weakening fullscreen lifecycle ownership; intentional zoom beyond the available viewport is not a full-visibility guarantee.

#### Scenario: Complete small diagram on first display

- **WHEN** the existing plain, compressed or multipage diagram fixture containing a 120×60 rounded rectangle is displayed in ordinary preview
- **THEN** all four edges, corners and painted stroke are visible without opening fullscreen or manually shrinking the diagram
- **AND** actual transformed geometry and clipping bounds, corroborated by screenshots, establish visibility rather than SVG existence alone

#### Scenario: Selection, revision and controls

- **WHEN** diagram B is selected or the ordinary preview is replaced by a new revision, then page navigation, Zoom In/Out, Fit and fullscreen open/close are exercised
- **THEN** expected ordinary and fullscreen geometry remains complete for these fixtures and the controls remain responsive
- **AND** retired fullscreen UI and child callbacks retain their existing cleanup guarantees
