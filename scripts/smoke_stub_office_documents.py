"""Configured DOCX content and lifecycle HTTP regressions for the Office stub."""

from __future__ import annotations

import hashlib
import io
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path
from xml.etree import ElementTree

from ocu_stub_office import office_document
from smoke_stub_office import (
    _close,
    _create,
    _entry,
    _outputs,
    _request,
    _restore,
    _seg,
    _status,
    _versions,
    _write_fixtures,
    assert_history_restored,
    fail,
    start_stub,
    stop_stub,
)


@contextmanager
def _StubContext(
    script: Path,
    mapping: dict[str, str],
    env: dict[str, str] | None = None,
    *,
    payload: bytes | None = None,
):
    fixtures = _write_fixtures(mapping)
    document = tempfile.NamedTemporaryFile(prefix='ocu-office-valid-', suffix='.docx', delete=False)
    document.write(office_document() if payload is None else payload)
    document.close()
    merged = {
        'OCU_STUB_FIXTURES': str(fixtures),
        'OCU_STUB_ASSETS': '/nonexistent-ocu-smoke-assets',
        'OCU_STUB_DOCX': document.name,
    }
    if env:
        merged.update(env)
    proc = None
    record = None
    try:
        proc, base, record = start_stub(script, merged)
        yield base
    finally:
        if proc is not None and record is not None:
            stop_stub(proc, record)
        fixtures.unlink(missing_ok=True)
        Path(document.name).unlink(missing_ok=True)


def _preservation_document() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(office_document())) as source, zipfile.ZipFile(buffer, 'w') as target:
        target.comment = b'configured package comment'
        for info in source.infolist():
            content = source.read(info)
            if info.filename == 'word/document.xml':
                content = content.replace(
                    b'<w:body>',
                    b'<w:body xmlns:fixture="urn:office-fixture" fixture:keep="yes">',
                ).replace(
                    b'</w:body>',
                    b'<!--preserve comment--><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body>',
                )
            target.writestr(info, content)
        extra = zipfile.ZipInfo('customXml/fixture.xml', date_time=(2001, 2, 3, 4, 5, 6))
        extra.comment = b'preserve member comment'
        extra.external_attr = 0o640 << 16
        target.writestr(extra, b'<fixture xmlns="urn:office-fixture">Keep unrelated content</fixture>')
    return buffer.getvalue()


def _assert_version_content(record: dict, content: bytes) -> None:
    if (record['sha256'], record['size']) != (hashlib.sha256(content).hexdigest(), len(content)):
        fail(f'version metadata does not describe downloaded bytes {record}')


def _assert_package_parts(source: zipfile.ZipFile, changed: zipfile.ZipFile, scenario: str) -> None:
    if changed.testzip() is not None or changed.namelist() != source.namelist():
        fail(f'{scenario} autosave changed or damaged package members')
    if changed.comment != source.comment:
        fail(f'{scenario} autosave lost package comment')
    for info in source.infolist():
        actual = changed.getinfo(info.filename)
        for field in ('date_time', 'compress_type', 'comment', 'extra', 'external_attr'):
            if getattr(actual, field) != getattr(info, field):
                fail(f'{scenario} autosave changed {info.filename} metadata {field}')
        content = changed.read(info.filename)
        if info.filename != 'word/document.xml' and content != source.read(info):
            fail(f'{scenario} autosave changed unrelated part {info.filename}')
        if info.filename.endswith('.xml') or info.filename.endswith('.rels'):
            ElementTree.fromstring(content)


def _assert_document_content(original: bytes, changed: bytes, scenario: str) -> None:
    namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    before = ElementTree.fromstring(
        original, parser=ElementTree.XMLParser(target=ElementTree.TreeBuilder(insert_comments=True))
    )
    after = ElementTree.fromstring(
        changed, parser=ElementTree.XMLParser(target=ElementTree.TreeBuilder(insert_comments=True))
    )
    body = after.find('w:body', namespace)
    if body is None:
        fail(f'{scenario} autosave lost document body')
    phrase = f'Verified Office autosave ({scenario})'
    additions = [
        paragraph
        for paragraph in body.findall('w:p', namespace)
        if ''.join(node.text or '' for node in paragraph.findall('.//w:t', namespace)) == phrase
    ]
    if len(additions) != 1:
        fail(f'{scenario} autosave missing recognizable content {phrase}')
    body.remove(additions[0])
    if ElementTree.tostring(after) != ElementTree.tostring(before):
        fail(f'{scenario} autosave changed preexisting document XML')


def _assert_autosave_package(original: bytes, autosave: bytes, scenario: str) -> None:
    if original == autosave:
        fail(f'{scenario} autosave did not change configured content')
    with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(io.BytesIO(autosave)) as changed:
        _assert_package_parts(source, changed, scenario)
        _assert_document_content(source.read('word/document.xml'), changed.read('word/document.xml'), scenario)


def _configured_workspace(base: str, chat: str, original: bytes) -> tuple[dict, str | None, dict]:
    listing, etag = _outputs(base, chat)
    entry = _entry(listing, 'report.docx')
    file_id = entry['file_id']
    status, _, workspace = _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')
    if status != 200 or workspace != original:
        fail(f'{chat} workspace did not preserve configured DOCX bytes')
    versions = _versions(base, chat, file_id)
    if versions[0] != 200:
        fail(f'{chat} versions HTTP {versions[0]}')
    initial = versions[2]
    records = initial['versions']
    shape = [(item['number'], item['parent'], item['source'], item['published']) for item in records]
    if shape != [(1, None, 'workspace', True), (2, 1, 'autosave', False)]:
        fail(f'{chat} changed seeded history {initial}')
    if initial['file_id'] != file_id or initial['published_version'] != 1:
        fail(f'{chat} changed seeded identity or published version {initial}')
    _assert_version_content(records[0], workspace)
    if (entry['hash'], entry['size']) != (records[0]['sha256'], records[0]['size']):
        fail(f'{chat} workspace listing metadata mismatch')
    return listing, etag, initial


def _retire_stale_session(base: str, chat: str, file_id: str, initial: dict) -> str:
    old_session = initial['open_session']
    if old_session is None or old_session['state'] != 'editing' or old_session['editor_ended']:
        fail(f'{chat} lost seeded open session {initial}')
    refused = _create(base, chat, file_id)
    if refused[0] != 409 or refused[2] != {'reason': 'unpublished_version'}:
        fail(f'{chat} first create did not refuse stale session {refused}')
    refreshed = _versions(base, chat, file_id)[2]
    if refreshed['open_session'] is not None or refreshed['versions'] != initial['versions']:
        fail(f'{chat} refusal changed history or retained old session')
    return old_session['session_id']


def _retry_stale_session(base: str, chat: str, file_id: str, old_id: str, records: list) -> str:
    retired = _status(base, chat, old_id)
    if retired[0] != 200 or retired[2]['state'] != 'orphaned' or retired[2]['reason'] != 'editor_state_lost':
        fail(f'{chat} stale session was not retired {retired}')
    created = _create(base, chat, file_id)
    if created[0] != 201 or created[2]['session_id'] == old_id:
        fail(f'{chat} retry did not create a new session {created}')
    if _versions(base, chat, file_id)[2]['versions'] != records:
        fail(f'{chat} retry published or changed autosave history')
    return created[2]['session_id']


def _publish_stale_autosave(base: str, chat: str, file_id: str, session_id: str, records: list) -> dict:
    closed = _close(base, chat, session_id)
    if closed[0] != 202 or closed[2]['state'] != 'closed':
        fail(f'{chat} close did not publish existing autosave {closed}')
    published = _versions(base, chat, file_id)[2]
    if published['versions'] != [records[0], dict(records[1], published=True)] or published['published_version'] != 2:
        fail(f'{chat} close changed autosave content/history {published}')
    return published


def _restore_unpublished_autosave(base: str, chat: str, file_id: str, initial: dict) -> dict:
    if initial['open_session'] is not None:
        fail(f'{chat} unexpectedly seeded an open session')
    restored = _restore(base, chat, file_id, 2)
    if restored[0] != 200 or restored[2] != {'file_id': file_id, 'number': 3, 'published': True}:
        fail(f'{chat} restore result {restored}')
    records = initial['versions']
    published = _versions(base, chat, file_id)[2]
    assert_history_restored(records, published['versions'], records[1])
    if len(published['versions']) != 3 or published['published_version'] != 3:
        fail(f'{chat} restore inserted unexpected history {published}')
    if published['versions'][-1]['parent'] != 2 or published['open_session'] is not None:
        fail(f'{chat} restore changed ancestry/session state {published}')
    return published


def _assert_published_listing(base: str, chat: str, listing: dict, etag: str | None, autosave: bytes) -> None:
    entry = _entry(listing, 'report.docx')
    after, after_etag = _outputs(base, chat)
    updated = _entry(after, 'report.docx')
    if (
        updated['file_id'] != entry['file_id']
        or updated['hash'] != hashlib.sha256(autosave).hexdigest()
        or updated['size'] != len(autosave)
    ):
        fail(f'{chat} published listing identity/metadata mismatch')
    if after['revision'] <= listing['revision'] or updated['revision'] <= entry['revision'] or after_etag == etag:
        fail(f'{chat} publication did not advance workspace revision')


def _renderable_scenario(base: str, scenario: str, original: bytes) -> bytes:
    chat = f'office_{scenario}'
    listing, etag, initial = _configured_workspace(base, chat, original)
    file_id = initial['file_id']
    records = initial['versions']
    download = f'/files/{_seg(chat)}/{_seg("report.docx")}'
    if scenario == 'stale':
        old_id = _retire_stale_session(base, chat, file_id, initial)
        new_id = _retry_stale_session(base, chat, file_id, old_id, records)
        if _request(base, download)[2] != original or _outputs(base, chat) != (listing, etag):
            fail(f'{chat} refusal/retry overwrote current workspace')
        published = _publish_stale_autosave(base, chat, file_id, new_id, records)
    else:
        published = _restore_unpublished_autosave(base, chat, file_id, initial)
    status, _, autosave = _request(base, download)
    if status != 200:
        fail(f'{chat} published autosave download HTTP {status}')
    _assert_version_content(records[1], autosave)
    _assert_version_content(published['versions'][-1], autosave)
    _assert_autosave_package(original, autosave, scenario)
    _assert_published_listing(base, chat, listing, etag, autosave)
    if scenario == 'unpublished':
        created = _create(base, chat, file_id)
        if created[0] != 201:
            fail(f'{chat} session creation after restore failed {created}')
        if (
            _versions(base, chat, file_id)[2]['versions'] != published['versions']
            or _request(base, download)[2] != autosave
        ):
            fail(f'{chat} creation after restore changed published content/history')
    return autosave


def assert_renderable_seeds(script: Path) -> None:
    canonical = office_document()
    if canonical != office_document():
        fail('canonical configured DOCX generation is not deterministic')
    mapping = {'office_unpublished': 'office_unpublished', 'office_stale': 'office_stale'}
    for original in (canonical, _preservation_document()):
        captured = []
        for _ in range(2):
            with _StubContext(script, mapping, payload=original) as base:
                captured.append(
                    {scenario: _renderable_scenario(base, scenario, original) for scenario in ('unpublished', 'stale')}
                )
        if captured[0] != captured[1]:
            fail('identical configured DOCX inputs produced nondeterministic autosave bytes')
