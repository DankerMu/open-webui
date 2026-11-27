# webui-image-request-cap Specification

## Purpose

A chat request sent to a model carries at most a configured number of images, newest kept, so a long image-heavy conversation stays below the upstream provider's per-request image limit instead of failing every later turn.

## Requirements

### Requirement: Payloads sent to the model carry at most the configured number of images

Before every chat request is sent to the model, WebUI SHALL keep at most `CHAT_MAX_IMAGES_PER_REQUEST` image parts (`image_url` and `input_image`) across the request's messages, keeping the newest ones, and SHALL replace each older image part with a text part stating that an earlier image was omitted to stay within the per-request image limit. It SHALL NOT change any other part, message, role or order, and SHALL NOT change stored chat history. `CHAT_MAX_IMAGES_PER_REQUEST` defaults to 30; a value that is not a positive integer SHALL fail startup.

#### Scenario: Older images are replaced once the budget is exceeded

- **WHEN** a request's messages carry 3 user images followed by 40 tool-result images and the limit is 30
- **THEN** the payload sent carries the newest 30 images, the 13 older image parts are text placeholders, and every other part and message is unchanged

#### Scenario: A payload within the budget is unchanged

- **WHEN** a request carries 30 images and the limit is 30
- **THEN** the payload is sent unchanged

#### Scenario: An invalid limit fails startup

- **WHEN** `CHAT_MAX_IMAGES_PER_REQUEST` is `0`, `-1`, `abc` or `3.5`
- **THEN** WebUI refuses to start with an error naming the variable
