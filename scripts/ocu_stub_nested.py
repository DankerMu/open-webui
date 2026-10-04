"""Deterministic nested workspace listing for the OCU stub tree scenario."""

from __future__ import annotations

from urllib.parse import quote

# Advertised bytes are independently specified so HTTP proof can compare them
# without reconstructing listing fiction.
NESTED_FILES: dict[str, tuple[str, str, bytes]] = {
    'packages/core/src/index.py': (
        'code',
        'text/x-python',
        b'print("ocu-stub nested index")\n',
    ),
    **{
        f'packages/core/src/mod-{index:02d}.py': (
            'code',
            'text/x-python',
            f'# ocu-stub nested module {index:02d}\n'.encode(),
        )
        for index in range(24)
    },
    'reports/summary.docx': (
        'docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        b'PK\x03\x04nested-summary-document',
    ),
    'reports/notes.txt': (
        'text',
        'text/plain',
        b'ocu-stub nested notes\n',
    ),
    'photo.png': (
        'image',
        'image/png',
        bytes.fromhex(
            '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4'
            '890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082'
        ),
    ),
    'page.html': (
        'html',
        'text/html',
        b'<!doctype html><html><body>ocu-stub nested page</body></html>',
    ),
    'notes.bin': ('binary', 'application/octet-stream', b'\x00\x01nested-bin'),
}


def nested_names() -> list[str]:
    return list(NESTED_FILES)


def nested_payload(name: str) -> tuple[bytes, str] | None:
    entry = NESTED_FILES.get(name)
    if entry is None:
        return None
    return entry[2], entry[1]


def nested_listing_entry(chat_id: str, name: str, prefix: str, revision: int, fixture_file) -> dict:
    kind, mime, payload = NESTED_FILES[name]
    entry = fixture_file(chat_id, name, revision)
    entry.update(
        file_id=f'fixture-{name}',
        path=name,
        name=name,
        url=f'{prefix}/files/{chat_id}/{quote(name, safe="/")}',
        type=kind,
        mime=mime,
        size=len(payload),
        hash='nested',
    )
    return entry
