"""Generated image and speech file names carry a real extension (#721).

Seams: `upload_image` and `upload_audio` with WebUI's `upload_file_handler` replaced by a fake
that records the file name, and the fork's `_clean_name`. Expected names are literals from the
fixture (tasks.md), not from `mimetypes`, whose table differs between macOS and Ubuntu.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

REQUEST = SimpleNamespace(app=SimpleNamespace(url_path_for=lambda name, id: f'/files/{id}'))
USER = SimpleNamespace(id='user-id')


def _upload(monkeypatch, module, call, content_type) -> str:
    """Run `call` with the upload handler replaced; return the file name it uploaded."""
    names = []

    async def upload_file_handler(request, file, metadata, process, user):
        names.append(file.filename)
        return SimpleNamespace(id='file-id', filename=file.filename, meta={})

    monkeypatch.setattr(module, 'upload_file_handler', upload_file_handler)
    # No chat_id or message_id: the file is not linked to a chat message.
    asyncio.run(call(REQUEST, b'bytes', content_type, {}, USER))
    assert len(names) == 1
    return names[0]


@pytest.mark.parametrize(
    ('content_type', 'expected'),
    [
        ('image/png; charset=binary', 'generated-image.png'),
        ('image/jpg', 'generated-image.jpg'),
        ('image/x-unknown', 'generated-image.png'),
        ('image/png', 'generated-image.png'),
        ('IMAGE/PNG', 'generated-image.png'),
        ('image/jpeg', 'generated-image.jpg'),
        ('image/webp', 'generated-image.webp'),
        ('image/gif', 'generated-image.gif'),
    ],
)
def test_generated_image_name_has_the_content_type_extension(monkeypatch, content_type, expected):
    from open_webui.routers import images

    assert _upload(monkeypatch, images, images.upload_image, content_type) == expected


@pytest.mark.parametrize(
    ('content_type', 'expected'),
    [
        ('audio/wav', 'generated-.wav'),
        ('audio/x-unknown', 'generated-.wav'),
        ('audio/mpeg', 'generated-.mp3'),
    ],
)
def test_generated_speech_name_has_the_content_type_extension(monkeypatch, content_type, expected):
    from open_webui.utils import files

    assert _upload(monkeypatch, files, files.upload_audio, content_type) == expected


@pytest.mark.parametrize(
    ('content_type', 'expected'),
    [
        ('image/png; charset=binary', 'cat.png'),
        ('image/jpg', 'cat.jpg'),
        ('image/png', 'cat.png'),
    ],
)
def test_named_image_keeps_its_extension(content_type, expected):
    from open_webui.utils.ocu_image_workspace import _clean_name

    assert _clean_name('cat', content_type) == expected
