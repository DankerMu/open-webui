# webui-image-aspect-ratio Specification

## Purpose

Let the built-in image generation tool pick an output size by aspect ratio from an admin-editable table, so a model can honour a requested ratio on the configured image service without exposing the table to that service.

## Requirements

### Requirement: The image tool selects a size by aspect ratio from an editable table

`generate_image` SHALL accept an optional `aspect_ratio`, ignoring surrounding whitespace. On any engine other than `openai` it SHALL ignore the argument. The ratio table SHALL be the `aspect_ratio_sizes` mapping in `IMAGES_OPENAI_API_PARAMS` when that key is stored, and a built-in preset of seven sizes otherwise. When the argument names a key of the table, the tool SHALL request that size. When the argument is absent or the table is empty, the size SHALL remain the configured default. When a non-empty table lacks the argument, the tool SHALL return an error listing its ratios and SHALL NOT call the image service. A size chosen for a call SHALL take precedence over a `size` in the params; with no size chosen, a `size` in the params SHALL take precedence over the configured default. The `aspect_ratio_sizes` key SHALL NOT be sent to the image service or stored in file metadata. Reading the image configuration SHALL show the preset under that key when none is stored, without writing it, so an admin can edit it.

#### Scenario: A configured ratio

- **GIVEN** the mapping holds `16:9` as `2752x1536`
- **WHEN** the model calls the tool with `aspect_ratio` `16:9`
- **THEN** the service receives size `2752x1536` and no `aspect_ratio_sizes` key

#### Scenario: The params also set a size

- **GIVEN** params with `size` `1024x1024` and a mapping holding `16:9` as `2752x1536`
- **WHEN** the model calls the tool with `aspect_ratio` `16:9`, and again with no ratio
- **THEN** the service receives `2752x1536`, and then `1024x1024`

#### Scenario: No ratio requested

- **WHEN** the model calls the tool without `aspect_ratio`
- **THEN** the service receives the configured default size

#### Scenario: The preset applies

- **GIVEN** no stored `aspect_ratio_sizes`
- **WHEN** the model calls the tool with `aspect_ratio` `9:16`
- **THEN** the service receives size `1536x2752`

#### Scenario: The admin edits the table

- **GIVEN** an already seeded database
- **WHEN** an admin opens the image settings, changes a size and saves
- **THEN** the field showed the preset, and the tool uses only the saved table

#### Scenario: Selection is turned off

- **GIVEN** a stored empty `aspect_ratio_sizes`
- **WHEN** the model calls the tool with `aspect_ratio` `16:9`
- **THEN** the service receives the configured default size

#### Scenario: Another engine

- **GIVEN** the image engine is not `openai`
- **WHEN** the model calls the tool with `aspect_ratio` `16:9`, or `5:4`
- **THEN** generation proceeds at the configured default size with no error

#### Scenario: An unknown ratio

- **GIVEN** a mapping without `5:4`
- **WHEN** the model calls the tool with `aspect_ratio` `5:4`
- **THEN** the tool returns an error listing the configured ratios and the service receives no request
