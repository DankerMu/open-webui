"""Per-request image cap on the payload sent to the model (#936).

Every request replays every earlier image (user uploads and flattened tool-result images), so a
long chat eventually carries more images than the upstream accepts and every request fails.
`cap_images` keeps the newest images and replaces each older one, in place, with a text part.
"""

from __future__ import annotations

import os
import re

DEFAULT_IMAGE_LIMIT = 30

OMITTED = (
    'An earlier image was omitted here to stay within the per-request image limit. '
    'If you still need it, open the file again with a tool.'
)

# Image part type -> the text part type that replaces it in the same message.
_PLACEHOLDER_TYPES = {'image_url': 'text', 'input_image': 'input_text'}


def parse_image_limit(value: str | None) -> int:
    """Unset means the default; anything but a positive decimal integer fails startup loudly."""
    if value is None:
        return DEFAULT_IMAGE_LIMIT
    if not re.fullmatch(r'[0-9]+', value) or int(value) < 1:
        raise ValueError(f'CHAT_MAX_IMAGES_PER_REQUEST must be a positive integer, got {value!r}')
    return int(value)


# The production upstream rejects a request with more than 32 images, after which every request in
# the chat fails; 30 leaves headroom. Read at import so an invalid value stops the server at startup.
CHAT_MAX_IMAGES_PER_REQUEST = parse_image_limit(os.environ.get('CHAT_MAX_IMAGES_PER_REQUEST'))


def _image_positions(messages: list) -> list[tuple[int, int]]:
    """(message index, part index) of every image part, oldest first."""
    positions = []
    for message_index, message in enumerate(messages):
        content = message.get('content') if isinstance(message, dict) else None
        if not isinstance(content, list):
            continue
        for part_index, part in enumerate(content):
            if isinstance(part, dict) and part.get('type') in _PLACEHOLDER_TYPES:
                positions.append((message_index, part_index))
    return positions


def _placeholder(part: dict) -> dict:
    replacement = {'type': _PLACEHOLDER_TYPES[part['type']], 'text': OMITTED}
    if 'cache_control' in part:
        replacement['cache_control'] = part['cache_control']
    return replacement


def cap_images(messages: list, limit: int | None = None) -> list:
    """Return messages with at most `limit` image parts, keeping the newest.

    Never mutates its input: a message and its content list are copied only when a part in it is
    replaced, and a payload within the limit is returned as the same list.
    """
    limit = CHAT_MAX_IMAGES_PER_REQUEST if limit is None else limit
    positions = _image_positions(messages)
    omitted = positions[: max(len(positions) - limit, 0)]
    if not omitted:
        return messages

    capped = list(messages)
    for message_index, part_index in omitted:
        if capped[message_index] is messages[message_index]:
            capped[message_index] = {**messages[message_index], 'content': list(messages[message_index]['content'])}
        content = capped[message_index]['content']
        content[part_index] = _placeholder(content[part_index])
    return capped
