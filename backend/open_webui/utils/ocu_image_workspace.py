"""Name generated images and save them into the chat's OCU workspace (#713).

`generate_image` and `edit_image` make two calls. `name_generated_images` runs right after the
image service returns, before the images are persisted to the message and emitted: a given
`name` becomes each image's file name (`Files.update_file_name_by_id`, column and metadata) and
entry name. `save_generated_images` runs after the emit, while the result is built: when the
workspace is enabled and the requester owns the saved chat, each image's bytes are read from
WebUI storage by file id and uploaded to OCU with the WebUI file id as the import receipt, so
the OCU wrapper's later attachment sync skips it. The `workspace_note` depends on whether the
image was emitted to the chat (`shown`): an emitted image must not be shown again, while one
returned without an event emitter was never shown (#724). An upload failure becomes a short
`workspace_error` and a warning; it never fails image generation.
"""

from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
import re
import unicodedata
from pathlib import Path

from open_webui.models.chats import Chats
from open_webui.models.files import Files
from open_webui.storage.provider import Storage
from open_webui.utils.chat_id import is_saved_chat_id
from open_webui.utils.ocu_client import OcuClient, OcuUnreachable, OcuUpstreamError
from open_webui.utils.ocu_sandbox_cleanup import workspace_enabled

log = logging.getLogger(__name__)

DEFAULT_NAME = 'generated-image'
MAX_NAME_CHARS = 60
# Where OCU mounts a chat's uploaded files inside its sandbox (docker_manager outputs bind).
WORKSPACE_FILES_DIR = '/mnt/user-data/files'
# Measured against the real model (#724); rewording voids that evidence.
WORKSPACE_NOTE = (
    'The image is already shown to the user. It is also saved in the chat workspace at the '
    'workspace_files paths, for use in later files. Do not show it again: no Markdown image, '
    'link or URL for it in your reply.'
)
# Without an event emitter the image was never shown, so the note must not claim it was.
UNSHOWN_WORKSPACE_NOTE = (
    'The image is saved in the chat workspace at the workspace_files paths. '
    'Do not embed the workspace_files paths as images.'
)
_SEPARATORS = re.compile(r'[/\\]')
_LINE_SPACES = re.compile(r'[\t\n\r\v\f]')
_SPACES = re.compile(r'\s+')


def _clean_name(name: str | None, content_type: str | None) -> str:
    """The file name for a generated image: the cleaned `name` plus the extension of `content_type`.

    NFC; tabs and line breaks become spaces; path separators and other control characters are
    dropped; whitespace runs become one space; no leading dots; at most MAX_NAME_CHARS characters
    before the extension. Empty becomes DEFAULT_NAME.
    """
    extension = mimetypes.guess_extension(content_type or '') or ''
    text = _LINE_SPACES.sub(' ', unicodedata.normalize('NFC', name or ''))
    text = ''.join(char for char in _SEPARATORS.sub('', text) if unicodedata.category(char) != 'Cc')
    text = _SPACES.sub(' ', text).strip().lstrip('.').strip()
    if extension and text.lower().endswith(extension):
        text = text[: -len(extension)].rstrip()
    text = text[:MAX_NAME_CHARS].rstrip()
    return f'{text or DEFAULT_NAME}{extension}'


def _reason(exc: Exception) -> str:
    # Class name and HTTP status only: transport text is not ours to vouch for.
    if isinstance(exc, OcuUnreachable):
        return 'OCU unreachable'
    if isinstance(exc, OcuUpstreamError):
        return f'OCU answered HTTP {exc.status}'
    if isinstance(exc, LookupError):
        return 'image file not found'
    return type(exc).__name__


async def _upload(client: OcuClient, chat_id: str, row, filename: str, content_type: str) -> str:
    local_path = await asyncio.to_thread(Storage.get_file, row.path)
    data = await asyncio.to_thread(Path(local_path).read_bytes)
    stored = await client.upload_file(chat_id, filename, data, row.id, content_type)
    return f'{WORKSPACE_FILES_DIR}/{stored}'


async def _may_upload(chat_id: str | None, user) -> bool:
    return workspace_enabled() and is_saved_chat_id(chat_id) and await Chats.is_chat_owner(chat_id, user.id)


def _result(paths: list[str], errors: list[str], total: int, shown: bool) -> dict:
    note = WORKSPACE_NOTE if shown else UNSHOWN_WORKSPACE_NOTE
    result = {'workspace_files': paths, 'workspace_note': note} if paths else {}
    if errors:
        reasons = '; '.join(dict.fromkeys(errors))
        result['workspace_error'] = f'{len(errors)} of {total} image(s) not saved to the workspace: {reasons}'
    return result


async def _owned_row(image: dict, user):
    """The file row behind an image entry, when the requester owns it and it has stored bytes."""
    file_id = image.get('id')
    row = await Files.get_file_by_id(file_id) if isinstance(file_id, str) else None
    if row is None or row.user_id != user.id or not row.path:
        raise LookupError(file_id)
    return row


def _content_type(image: dict, row) -> str:
    return image.get('content_type') or (row.meta or {}).get('content_type') or 'application/octet-stream'


async def name_generated_images(images: list[dict], name: str | None, user) -> list[dict]:
    """Give each image the cleaned `name`; update the entries in place and return `images`.

    Without a name or a user nothing changes. An image whose file row is missing, foreign, or
    whose rename fails keeps its name; that is logged and never fails generation.
    """
    if name is None or user is None:
        return images
    for image in images:
        try:
            row = await _owned_row(image, user)
            filename = _clean_name(name, _content_type(image, row))
            if row.filename != filename and await Files.update_file_name_by_id(row.id, filename) is None:
                raise RuntimeError('file name update failed')
            image['name'] = filename
        except Exception as exc:
            log.warning('Generated image %s kept its name: %s', image.get('id'), _reason(exc), exc_info=True)
    return images


async def save_generated_images(chat_id: str | None, user, images: list[dict], shown: bool = False) -> dict:
    """Upload the images into the chat's workspace; return the extra tool-result keys.

    `shown` is true when the images were emitted to the chat; it selects the workspace note.
    Empty when a gate did not pass: no user or images, workspace off, a temporary or channel
    chat, or a requester who does not own the chat.
    """
    if user is None or not images or not await _may_upload(chat_id, user):
        return {}
    client = _client(chat_id)
    if client is None:
        return _result([], ['OCU is not configured'] * len(images), len(images), shown)
    paths, errors = [], []
    try:
        for image in images:
            path, error = await _process(client, chat_id, user, image)
            paths.extend([path] if path else [])
            errors.extend([error] if error else [])
    finally:
        await client.aclose()
    return _result(paths, errors, len(images), shown)


def _client(chat_id: str) -> OcuClient | None:
    try:
        return OcuClient()
    except ValueError as exc:
        log.warning('Generated images not saved to the workspace of chat %s: %s', chat_id, exc)
        return None


async def _process(client: OcuClient, chat_id: str, user, image: dict) -> tuple[str | None, str | None]:
    """Upload one image under its file name; return (workspace path, None) or (None, reason)."""
    try:
        row = await _owned_row(image, user)
        filename = os.path.basename((row.meta or {}).get('name') or row.filename)
        return await _upload(client, chat_id, row, filename, _content_type(image, row)), None
    except Exception as exc:
        log.warning(
            'Generated image %s not saved to the workspace of chat %s: %s',
            image.get('id'),
            chat_id,
            _reason(exc),
            exc_info=True,
        )
        return None, _reason(exc)
