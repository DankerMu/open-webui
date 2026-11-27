## ADDED Requirements

### Requirement: Generated images render right after the tool call that produced them

An assistant reply SHALL render each image returned by a `generate_image` or `edit_image` call immediately after that call, outside any collapsed group of tool calls, and SHALL NOT render it again in the row above the reply. Images whose producing call is not in the reply's output SHALL still render in the row above the reply.

#### Scenario: Two generated images interleave with their calls

- **WHEN** a reply's output is a `generate_image` call returning image A, then a `generate_image` call returning image B
- **THEN** the reply renders call A, image A, call B, image B in that order, and neither image appears in the row above the reply

#### Scenario: Two calls in one turn still interleave

- **WHEN** one turn's output is call A (`generate_image`), call B, then output A returning image A, then output B
- **THEN** the reply renders call A, image A, call B

#### Scenario: Images with no producing call keep the top row

- **WHEN** a reply has images in its message files and no tool call in its output names them
- **THEN** the images render in the row above the reply, as before
