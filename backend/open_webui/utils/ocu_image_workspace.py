"""Name generated images and save them into the chat's OCU workspace (#713).

`generate_image` and `edit_image` call `save_generated_images` once, right after the image
service returns. A given `name` becomes each image's display name (Files metadata and the
returned entries). When the workspace is enabled and the requester owns the saved chat, each
image's bytes are read from WebUI storage by file id and uploaded to OCU with the WebUI file
id as the import receipt, so the OCU wrapper's later attachment sync skips it. Nothing here
fails image generation: an upload failure becomes a short `workspace_error` and a warning.
"""

from __future__ import annotations

import asyncio
import logging
import mimetypes
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
WORKSPACE_NOTE = 'The image is saved in the chat workspace at the workspace_files paths. It must not be embedded again.'
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


async def _rename(image: dict, row, filename: str) -> dict:
    if (row.meta or {}).get('name') == filename:
        return image
    if await Files.update_file_metadata_by_id(row.id, {'name': filename}) is None:
        log.warning('Generated image %s kept its name: metadata update failed', row.id)
        return image
    return {**image, 'name': filename}


async def _upload(client: OcuClient, chat_id: str, row, filename: str, content_type: str) -> str:
    local_path = await asyncio.to_thread(Storage.get_file, row.path)
    data = await asyncio.to_thread(Path(local_path).read_bytes)
    stored = await client.upload_file(chat_id, filename, data, row.id, content_type)
    return f'{WORKSPACE_FILES_DIR}/{stored}'


async def _may_upload(chat_id: str | None, user) -> bool:
    return workspace_enabled() and is_saved_chat_id(chat_id) and await Chats.is_chat_owner(chat_id, user.id)


def _result(paths: list[str], errors: list[str], total: int) -> dict:
    result = {'workspace_files': paths, 'workspace_note': WORKSPACE_NOTE} if paths else {}
    if errors:
        reasons = '; '.join(dict.fromkeys(errors))
        result['workspace_error'] = f'{len(errors)} of {total} image(s) not saved to the workspace: {reasons}'
    return result


async def save_generated_images(
    chat_id: str | None, user, images: list[dict], name: str | None = None
) -> tuple[list[dict], dict]:
    """Return the image entries (renamed when `name` is given) and the extra tool-result keys.

    The extra keys are empty when nothing was uploaded because a gate did not pass: no user,
    workspace off, a temporary or channel chat, or a requester who does not own the chat.
    """
    if user is None or not images:
        return images, {}
    upload = await _may_upload(chat_id, user)
    if name is None and not upload:
        return images, {}
    client = _client(chat_id) if upload else None
    entries, paths, errors = [], [], []
    try:
        for image in images:
            entry, path, error = await _process(client, chat_id, user, image, name)
            entries.append(entry)
            paths.extend([path] if path else [])
            errors.extend([error] if error else [])
    finally:
        if client is not None:
            await client.aclose()
    if upload and client is None:
        errors = ['OCU is not configured'] * len(images)
    return entries, (_result(paths, errors, len(images)) if upload else {})


def _client(chat_id: str) -> OcuClient | None:
    try:
        return OcuClient()
    except ValueError as exc:
        log.warning('Generated images not saved to the workspace of chat %s: %s', chat_id, exc)
        return None


async def _process(client, chat_id, user, image: dict, name: str | None) -> tuple[dict, str | None, str | None]:
    """One image: rename it when named, then upload it when a client is given; never raises."""
    entry = image
    file_id = image.get('id')
    try:
        row = await Files.get_file_by_id(file_id) if isinstance(file_id, str) else None
        if row is None or row.user_id != user.id or not row.path:
            raise LookupError(file_id)
        content_type = image.get('content_type') or (row.meta or {}).get('content_type') or 'application/octet-stream'
        filename = _clean_name(name, content_type)
        if name is not None:
            entry = await _rename(image, row, filename)
        if client is None:
            return entry, None, None
        return entry, await _upload(client, chat_id, row, filename, content_type), None
    except Exception as exc:
        log.warning('Generated image %s in chat %s not named or saved: %s', file_id, chat_id, _reason(exc))
        return entry, None, _reason(exc)
