## ADDED Requirements

### Requirement: Kit check names text that cannot be wrapped

When a scene's text cannot be wrapped because a run of punctuation marks is wider than its line, `kit check` SHALL report a reason that names the scene, the field and the text, and says to shorten the run. It SHALL NOT report a bare `probe:` RangeError for such text.

#### Scenario: A chart label of opening marks

- **WHEN** a line chart with 8 points has the label `（（（（甲乙`, which `wrapLines` cannot fit at maxWidth 4
- **THEN** `kit check` fails with a reason naming that scene, `content.points[<i>].label` and the label, and no reason starts with `probe:`
