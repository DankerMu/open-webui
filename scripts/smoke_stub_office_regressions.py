"""Focused HTTP regressions for Office stub review findings.

Default selectors pin HTTP status, bodies and policies on one running stub.
`--old-script` remains an opt-in before/after preview comparison.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

from smoke_stub_office import (
    OFFICE_SCENARIOS,
    _close,
    _create,
    _entry,
    _file_id,
    _outputs,
    _request,
    _resolve,
    _restore,
    _save,
    _seg,
    _status,
    _strip_times,
    _upload_docx,
    _versions,
    _write_fixtures,
    assert_create_schema,
    assert_history_restored,
    fail,
    start_stub,
    stop_stub,
)

log = logging.getLogger('smoke-stub-office-regressions')
NONCE_RE = re.compile(r'nonce-[A-Za-z0-9_-]+')
TIME_HEADER = {'date', 'last-modified'}
DEFAULT_SELECTORS = (
    'r1-methods',
    'r2-identity',
    'r3-namespace',
    'r4-readonly',
    'r7-ended-conflict',
    'r8-revision',
    'history-restore',
    'missing-field',
    'concurrent-create',
    'embed-baseline',
)


def _multipart(name: str, payload: bytes) -> tuple[bytes, dict]:
    envelope = (
        b'--smoke-boundary\r\nContent-Disposition: form-data; name="file"; '
        b'filename="ignored.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'
        + payload
        + b'\r\n--smoke-boundary--\r\n'
    )
    return envelope, {'Content-Type': 'multipart/form-data; boundary=smoke-boundary'}


def _upload(base: str, chat: str, name: str, payload: bytes) -> dict:
    data, headers = _multipart(name, payload)
    path = f'/api/uploads/{_seg(chat)}/{_seg(name)}'
    status, _, body = _request(base, path, method='POST', data=data, headers=headers)
    if status != 200:
        fail(f'upload {name} HTTP {status}')
    return json.loads(body)


def _snapshot(base: str, chat: str, file_id: str, session_id: str | None) -> dict:
    listing, etag = _outputs(base, chat)
    versions = _versions(base, chat, file_id)
    status = (None, None, None) if session_id is None else _status(base, chat, session_id)
    path = next((entry['path'] for entry in listing['files'] if entry['file_id'] == file_id), None)
    download = _request(base, f'/files/{_seg(chat)}/{_seg(path)}') if path else (None, None, None)
    return {
        'listing': listing,
        'etag': etag,
        'versions': versions[2] if versions[0] == 200 else versions,
        'status': status[2] if status[0] == 200 else status,
        'bytes': download[2],
    }


def _unchanged(before: dict, after: dict, message: str) -> None:
    if after != before:
        fail(message)


def _office_file(base: str, chat: str, path: str = 'report.docx') -> str:
    return _file_id(_outputs(base, chat)[0], path)


@contextmanager
def _StubContext(script: Path, mapping: dict[str, str], env: dict[str, str] | None = None):
    fixtures = _write_fixtures(mapping)
    document = tempfile.NamedTemporaryFile(prefix='ocu-office-valid-', suffix='.docx', delete=False)
    document.write(b'PK\x03\x04configured-office-fixture')
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


def assert_wrong_methods(base: str) -> None:
    chat = 'office'
    file_id = _office_file(base, chat)
    session_id = _create(base, chat, file_id)[2]['session_id']
    before = _snapshot(base, chat, file_id, session_id)
    routes = (
        f'/api/office/{_seg(chat)}/documents/{_seg(file_id)}/sessions',
        f'/api/office/{_seg(chat)}/sessions/{_seg(session_id)}',
        f'/api/office/{_seg(chat)}/sessions/{_seg(session_id)}/save',
        f'/api/office/{_seg(chat)}/sessions/{_seg(session_id)}/close',
        f'/api/office/{_seg(chat)}/sessions/{_seg(session_id)}/resolve',
        f'/api/office/{_seg(chat)}/documents/{_seg(file_id)}/versions',
        f'/api/office/{_seg(chat)}/documents/{_seg(file_id)}/restore',
    )
    allowed = {
        routes[0]: {'POST'},
        routes[1]: {'GET'},
        routes[2]: {'POST'},
        routes[3]: {'POST'},
        routes[4]: {'POST'},
        routes[5]: {'GET'},
        routes[6]: {'POST'},
    }
    for path in routes:
        for method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'):
            if method in allowed[path]:
                continue
            status, _, _ = _request(base, path, method=method, data=b'{}')
            if status != 404:
                fail(f'{method} {path} expected 404, got {status}')
    _unchanged(before, _snapshot(base, chat, file_id, session_id), 'wrong Office method mutated state')
    launch_before = _request(base, f'/internal/describe/{_seg("stopped")}')
    if _request(base, f'/internal/launch/{_seg("stopped")}', method='PUT')[0] != 404:
        fail('PUT launch executed POST')
    if json.loads(_request(base, f'/internal/describe/{_seg("stopped")}')[2]) != json.loads(launch_before[2]):
        fail('wrong-method launch mutated describe')
    upload_before = _outputs(base, 'upload-method')[0]
    data, headers = _multipart('wrong.docx', b'payload')
    if _request(
        base,
        f'/api/uploads/{_seg("upload-method")}/{_seg("wrong.docx")}',
        method='PUT',
        data=data,
        headers=headers,
    )[0] != 404:
        fail('PUT upload executed POST')
    if _outputs(base, 'upload-method')[0] != upload_before:
        fail('wrong-method upload mutated listing')
    if _request(base, f'/terminal/{_seg("running")}/start-ttyd', method='PATCH')[0] != 404:
        fail('PATCH terminal action executed POST')


def assert_unknown_identity(base: str) -> None:
    foreign_id, _ = _upload_docx(base, 'beta', 'beta-only.docx')
    for chat in OFFICE_SCENARIOS:
        sibling = _snapshot(base, 'beta', foreign_id, None)
        listing, _ = _outputs(base, chat)
        local = _file_id(listing, 'report.docx')
        before_versions = _versions(base, chat, local)[2]
        before_listing, _ = _outputs(base, chat)
        before_bytes = _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')[2]
        for file_id in ('missing', 'not-a-file', foreign_id):
            if _versions(base, chat, file_id)[0] != 404:
                fail(f'{chat} versions accepted {file_id}')
            if _restore(base, chat, file_id, 1)[0] != 404:
                fail(f'{chat} restore accepted {file_id}')
            if _create(base, chat, file_id)[0] != 404:
                fail(f'{chat} create accepted {file_id}')
        after_listing, _ = _outputs(base, chat)
        if after_listing != before_listing:
            fail(f'{chat} unknown IDs mutated listing')
        if _versions(base, chat, local)[2] != before_versions:
            fail(f'{chat} unknown IDs mutated history')
        if _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')[2] != before_bytes:
            fail(f'{chat} unknown IDs mutated bytes')
        _unchanged(sibling, _snapshot(base, 'beta', foreign_id, None), 'foreign IDs mutated sibling chat')
    _assert_encoded_identities(base)


def _assert_encoded_identities(base: str) -> None:
    save_chat = 'office_save_as'
    file_id = _office_file(base, save_chat)
    created = _create(base, save_chat, file_id)
    if created[0] != 201 or any(entry['path'] == 'report.docx' for entry in _outputs(base, save_chat)[0]['files']):
        fail(f'save_as real ID open failed {created}')
    _close(base, save_chat, created[2]['session_id'])
    saved_id = _status(base, save_chat, created[2]['session_id'])[2]['saved_as']['file_id']
    listed_id = _office_file(base, save_chat, 'report (2).docx')
    if saved_id != listed_id:
        fail(f'save_as listing file_id {listed_id} differs from status {saved_id}')
    versions = _versions(base, save_chat, saved_id)
    if versions[0] != 200 or versions[2]['file_id'] != saved_id:
        fail(f'save_as encoded versions {versions[0]} {versions[2]}')
    encoded_create = _create(base, save_chat, saved_id)
    if encoded_create[0] != 201:
        fail(f'save_as encoded create {encoded_create}')
    percent_name = 'brief%20note.docx'
    percent_id, percent_listing = _upload_docx(base, 'encoded-percent', percent_name)
    stored = next(entry for entry in percent_listing['files'] if entry['file_id'] == percent_id)
    if stored['path'] != percent_name:
        fail(f'percent filename stored path changed {stored}')
    percent_create = _create(base, 'encoded-percent', percent_id)
    if percent_create[0] != 201 or percent_create[2]['file_id'] != percent_id:
        fail(f'percent encoded create {percent_create}')
    if _versions(base, 'encoded-percent', percent_id)[0] != 200:
        fail('percent encoded versions rejected listed file_id')


def assert_shared_namespace(base: str) -> None:
    chat = 'office_conflict'
    file_id = _office_file(base, chat)
    original = _entry(_outputs(base, chat)[0], 'report.docx')
    original_bytes = _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')[2]
    session_id = _create(base, chat, file_id)[2]['session_id']
    _save(base, chat, session_id, 'publish')
    _resolve(base, chat, session_id, 'save_as')
    listing, _ = _outputs(base, chat)
    created = _entry(listing, 'report (2).docx')
    uploaded = _upload(base, chat, 'report (2).docx', b'uploaded-after-save-as')
    if uploaded['filename'] == 'report (2).docx':
        fail('upload reused Office-created name')
    after, _ = _outputs(base, chat)
    names = {entry['path'] for entry in after['files']}
    if created['path'] not in names or uploaded['filename'] not in names:
        fail(f'colliding names not both listed {names}')
    if _entry(after, 'report.docx') != original:
        fail('upload after save-as mutated original')
    if _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')[2] != original_bytes:
        fail('upload after save-as mutated original bytes')
    if _request(base, f'/files/{_seg(chat)}/{_seg(created["path"])}')[2] == b'uploaded-after-save-as':
        fail('Office file served uploaded bytes')
    if _request(base, f'/files/{_seg(chat)}/{_seg(uploaded["filename"])}')[2] != b'uploaded-after-save-as':
        fail('uploaded bytes not retrievable')
    _assert_automatic_namespace(base)
    _assert_racing_namespace(base)


def _assert_automatic_namespace(base: str) -> None:
    auto = 'office_save_as-ns'
    auto_id = _office_file(base, auto)
    auto_session = _create(base, auto, auto_id)[2]['session_id']
    _close(base, auto, auto_session)
    auto_name = _status(base, auto, auto_session)[2]['saved_as']['path']
    second = _upload(base, auto, auto_name, b'auto-upload')
    if second['filename'] == auto_name:
        fail('upload reused automatic save-as name')
    if _request(base, f'/files/{_seg(auto)}/{_seg(second["filename"])}')[2] != b'auto-upload':
        fail('automatic save-as upload lost bytes')


def _assert_racing_namespace(base: str) -> None:
    race_chat = 'office_conflict-race'
    race_id = _office_file(base, race_chat)
    race_session = _create(base, race_chat, race_id)[2]['session_id']
    _save(base, race_chat, race_session, 'publish')

    def claim(kind: str):
        if kind == 'upload':
            return _upload(base, race_chat, 'report (2).docx', b'race-upload')['filename']
        return _resolve(base, race_chat, race_session, 'save_as')[2]['path']

    with ThreadPoolExecutor(max_workers=2) as pool:
        names = list(pool.map(claim, ('upload', 'save')))
    if len(set(names)) != 2:
        fail(f'concurrent claims collided {names}')
    listing, _ = _outputs(base, race_chat)
    entries = [_entry(listing, name) for name in names]
    if entries[0]['file_id'] == entries[1]['file_id']:
        fail('concurrent claims shared identity')
    if _request(base, f'/files/{_seg(race_chat)}/{_seg(names[0])}')[2] != b'race-upload':
        fail('concurrent upload content lost')


def _file_response(base: str, chat: str, name: str):
    status, headers, body = _request(base, f'/files/{_seg(chat)}/{_seg(name)}')
    filtered = {key.lower(): value for key, value in headers.items() if key.lower() not in TIME_HEADER}
    return status, filtered, body


def assert_readonly_history(base: str) -> None:
    cases = (
        ('corrupt', 'corrupt.docx'),
        ('valid', 'valid.docx'),
        ('corrupt', 'page.html'),
        ('running-html', 'page.html'),
    )
    mapping_chat = {'running-html': 'running'}
    for chat, name in cases:
        target = mapping_chat.get(chat, chat)
        before = _file_response(base, target, name)
        listing, _ = _outputs(base, target)
        file_id = _file_id(listing, name)
        versions = _versions(base, target, file_id)
        if versions[0] != 200:
            fail(f'versions {target}/{name} {versions[0]} {versions[2]}')
        after = _file_response(base, target, name)
        if after != before:
            fail(f'history read changed {target}/{name}')
        if chat == 'corrupt' and name.endswith('.docx') and after[2] != b'not a ZIP document':
            fail('corrupt fixture was repaired by history read')
        if name.endswith('.html'):
            content_type = after[1].get('content-type', '')
            if 'text/html' not in content_type:
                fail(f'HTML MIME changed after versions {content_type}')


def assert_ended_conflict(base: str) -> None:
    for action, chat in (('save_as', 'office_conflict-ended'), ('overwrite', 'office_conflict-ended-ow')):
        _assert_ended_conflict_action(base, action, chat)
    live = 'office_conflict-live'
    live_id = _office_file(base, live)
    live_bytes = _request(base, f'/files/{_seg(live)}/{_seg("report.docx")}')[2]
    live_session = _create(base, live, live_id)[2]['session_id']
    _save(base, live, live_session, 'publish')
    live_resolve = _resolve(base, live, live_session, 'overwrite')
    if live_resolve[0] != 200 or live_resolve[2]['state'] != 'editing':
        fail(f'live resolve {live_resolve}')
    _assert_overwrite_history(base, live, live_id, live_bytes)



def _assert_ended_conflict_action(base: str, action: str, chat: str) -> None:
    file_id = _office_file(base, chat)
    original_bytes = _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')[2]
    session_id = _create(base, chat, file_id)[2]['session_id']
    _save(base, chat, session_id, 'publish')
    _assert_conflict_close_history(base, chat, file_id, session_id)
    joined = _create(base, chat, file_id)
    if joined[0] != 200 or joined[2].get('editor_config') is not None or joined[2]['state'] != 'conflict':
        fail(f'ended conflict join {joined}')
    resolved = _resolve(base, chat, session_id, action)
    if resolved[0] != 200 or resolved[2]['state'] != 'closed':
        fail(f'ended resolve {action} {resolved}')
    if _status(base, chat, session_id)[2]['state'] != 'closed':
        fail(f'ended resolve left {action} open')
    if action == 'save_as' and _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')[2] != original_bytes:
        fail('ended save_as mutated original bytes')
    if action == 'overwrite':
        _assert_overwrite_history(base, chat, file_id, original_bytes)



def _assert_conflict_close_history(base: str, chat: str, file_id: str, session_id: str) -> None:
    first = _close(base, chat, session_id)
    if first[0] != 202 or first[2]['state'] != 'conflict':
        fail(f'conflict close {first}')
    versions = _versions(base, chat, file_id)[2]
    open_session = versions['open_session'] or {}
    if open_session.get('editor_ended') is not True or open_session.get('state') != 'conflict':
        fail(f'ended conflict listing {versions}')
    if len(versions['versions']) != 2:
        fail(f'conflict close stored a phantom version {versions}')
    if versions['published_version'] != 1 or versions['versions'][1]['source'] != 'save':
        fail(f'conflict close mutated published history {versions}')
    repeat = _close(base, chat, session_id)
    if repeat[0] != 202 or repeat[2] != first[2]:
        fail(f'repeat conflict close changed {repeat}')
    if _versions(base, chat, file_id)[2]['versions'] != versions['versions']:
        fail('repeat conflict close stored a new version')


def _assert_overwrite_history(base: str, chat: str, file_id: str, original_bytes: bytes) -> None:
    history = _versions(base, chat, file_id)[2]
    records = history['versions']
    if [record['source'] for record in records] != ['workspace', 'save']:
        fail(f'overwrite history sources {records}')
    if any(not record['published'] for record in records):
        fail(f'overwrite left unpublished records {records}')
    if history['published_version'] != records[-1]['number'] or records[-1]['number'] != 2:
        fail(f'overwrite published_version {history}')
    if records[0]['number'] != 1 or records[0]['parent'] is not None or records[0]['source'] != 'workspace':
        fail(f'overwrite mutated original workspace record {records[0]}')
    content = _request(base, f'/files/{_seg(chat)}/{_seg("report.docx")}')[2]
    if hashlib.sha256(content).hexdigest() != records[-1]['sha256']:
        fail('overwrite did not publish the user version')
    if content == original_bytes:
        fail('overwrite left original workspace bytes')


def assert_listing_revision(base: str) -> None:
    chat = 'office_conflict-rev'
    listing, etag = _outputs(base, chat)
    original = _entry(listing, 'report.docx')
    session_id = _create(base, chat, original['file_id'])[2]['session_id']
    _save(base, chat, session_id, 'publish')
    _resolve(base, chat, session_id, 'save_as')
    after, after_etag = _outputs(base, chat)
    if after['revision'] <= listing['revision'] or after_etag == etag:
        fail('manual save-as did not advance listing revision/ETag')
    if _entry(after, 'report.docx') != original:
        fail('manual save-as mutated original entry')
    if _request(base, f'/api/outputs/{_seg(chat)}', headers={'If-None-Match': after_etag})[0] != 304:
        fail('save-as ETag did not condition later listing')
    auto = 'office_save_as-rev'
    before, _ = _outputs(base, auto)
    created = _create(base, auto, _office_file(base, auto))
    opened, _ = _outputs(base, auto)
    if opened['revision'] <= before['revision']:
        fail('modeled deletion did not advance revision')
    _close(base, auto, created[2]['session_id'])
    closed, _ = _outputs(base, auto)
    if closed['revision'] <= opened['revision']:
        fail('automatic save-as addition did not advance revision')


def assert_missing_field_http(base: str) -> None:
    created = _create(base, 'office', _office_file(base, 'office'))
    assert_create_schema(created[2])
    status = _status(base, 'office', created[2]['session_id'])[2]
    for key in (
        'session_id', 'file_id', 'document_key', 'state', 'save_seq', 'last_committed_seq', 'last_published_seq'
    ):
        if key not in status:
            fail(f'status missing {key}')
    versions = _versions(base, 'office', created[2]['file_id'])[2]
    for key in ('file_id', 'published_version', 'open_session', 'versions'):
        if key not in versions:
            fail(f'versions missing {key}')
    expected = {
        'state': 'editing', 'reason': None, 'save_seq': 0, 'last_committed_seq': 0,
        'last_published_seq': 0, 'workspace_changed': False, 'saved_as': None,
    }
    if any(status.get(key) != value for key, value in expected.items()):
        fail(f'initial status differs from fresh-session contract {status}')
    if status['document_key'] != created[2]['document_key'] or versions['file_id'] != created[2]['file_id']:
        fail('status/history identity differs from create')


def assert_concurrent_first_create(base: str) -> None:
    file_id = _office_file(base, 'office-race')
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: _create(base, 'office-race', file_id), range(4)))
    created = [body for status, _, body, _ in results if status == 201]
    joined = [body for status, _, body, _ in results if status == 200]
    if len(created) != 1 or len(joined) != 3:
        fail(f'concurrent first create allocation {[(row[0], row[2].get("joined")) for row in results]}')
    session_ids = {body['session_id'] for body in created + joined}
    if len(session_ids) != 1:
        fail(f'concurrent first create diverged {session_ids}')


def _normalize_embed(status: int, headers: dict, body: bytes):
    filtered = {key.lower(): value for key, value in headers.items() if key.lower() not in TIME_HEADER}
    text = body.decode('utf-8', 'replace')
    nonce = NONCE_RE.search(filtered.get('content-security-policy', ''))
    if nonce:
        token = nonce.group()[6:]
        filtered = {key: value.replace(token, 'NORMALIZED-NONCE') for key, value in filtered.items()}
        text = text.replace(token, 'NORMALIZED-NONCE')
    return status, filtered, text


def _preview_headers(headers: dict) -> dict:
    return {key.lower(): value for key, value in headers.items() if key.lower() not in TIME_HEADER}


def _configured_assets() -> str | None:
    assets = os.environ.get('OCU_STUB_ASSETS')
    if assets and Path(assets).is_dir():
        return assets
    for root in ('.run/local-test/build/ocu/computer-use-server', '.run/vps-test/build/ocu/computer-use-server'):
        if (Path(root) / 'app.py').is_file() and (Path(root) / 'static').is_dir():
            return str((Path(root) / 'static').resolve())
    return None


def _placeholder_preview(base: str, mode: str):
    path = f'/preview/{_seg("preview")}' if mode == 'standalone' else f'/preview/{_seg("preview")}?embed={mode}'
    return _request(base, path)


def _assert_placeholder_page(mode: str, status: int, headers: dict, body: bytes) -> None:
    if status != 200:
        fail(f'placeholder embed={mode} HTTP {status}')
    filtered = _preview_headers(headers)
    if filtered.get('content-type') != 'text/html; charset=utf-8':
        fail(f'placeholder embed={mode} content-type {filtered.get("content-type")}')
    if filtered.get('content-security-policy') != "default-src 'self'":
        fail(f'placeholder embed={mode} CSP {filtered.get("content-security-policy")}')
    text = body.decode()
    if 'id="ocu-stub-preview"' not in text or 'ocu-office-simulate-modification' in text:
        fail(f'placeholder embed={mode} served the wrong page')
    if '/ocu/static/preview.js' not in text:
        fail(f'placeholder embed={mode} missing prefixed static')
    if 'data-chat-id="preview"' not in text:
        fail(f'placeholder embed={mode} missing chat identity')
    if 'data-api-url="/ocu/api/outputs/preview"' not in text:
        fail(f'placeholder embed={mode} missing outputs URL')
    if 'data-files-base="/ocu/files/preview"' not in text:
        fail(f'placeholder embed={mode} missing files base')
    if 'data-describe-url="/api/v1/ocu/workspaces/preview"' not in text:
        fail(f'placeholder embed={mode} missing describe URL')


def _assert_office_distinct(base: str) -> None:
    status, headers, body = _request(base, f'/preview/{_seg("preview")}?embed=office')
    if status != 200:
        fail(f'embed=office HTTP {status}')
    text = body.decode()
    if 'ocu-office-simulate-modification' not in text or 'id="ocu-stub-preview"' in text:
        fail('embed=office did not serve the Office host page')
    csp = headers.get('Content-Security-Policy') or headers.get('content-security-policy') or ''
    if csp == "default-src 'self'":
        fail('embed=office reused the placeholder CSP')


def _assert_configured_preview(base: str) -> None:
    files = _normalize_embed(*_request(base, f'/preview/{_seg("preview")}?embed=files'))
    browser = _normalize_embed(*_request(base, f'/preview/{_seg("preview")}?embed=browser'))
    terminal = _normalize_embed(*_request(base, f'/preview/{_seg("preview")}?embed=terminal'))
    if files[0] != 200 or browser[0] != 200 or terminal[0] != 200:
        fail(f'configured-asset preview HTTP {(files[0], browser[0], terminal[0])}')
    files_csp = files[1].get('content-security-policy', '')
    browser_csp = browser[1].get('content-security-policy', '')
    terminal_csp = terminal[1].get('content-security-policy', '')
    if 'nonce-' in files_csp.lower() or 'NORMALIZED-NONCE' in files_csp:
        fail(f'configured files preview used a nonce CSP {files_csp}')
    if 'script-src' not in browser_csp or 'NORMALIZED-NONCE' not in browser_csp:
        fail(f'configured browser preview missing nonce CSP {browser_csp}')
    if browser_csp != terminal_csp:
        fail('configured browser/terminal preview policies diverged')
    if files[1].get('cache-control') != 'no-cache, no-store, must-revalidate':
        fail(f'configured files preview cache {files[1].get("cache-control")}')
    if files == browser:
        fail('configured files preview matched browser policy')


def assert_preview_contract(base: str, script: Path) -> None:
    pages = {}
    for mode in ('files', 'browser', 'terminal', 'standalone'):
        pages[mode] = _placeholder_preview(base, mode)
        _assert_placeholder_page(mode, *pages[mode])
    if pages['files'][2] != pages['browser'][2] or pages['browser'][2] != pages['terminal'][2]:
        fail('placeholder preview modes diverged')
    if pages['standalone'][2] != pages['files'][2]:
        fail('standalone preview diverged from files mode')
    _assert_office_distinct(base)
    assets = _configured_assets()
    if not assets:
        log.info('asset-mode coverage skipped, placeholder contract only')
        return
    with _StubContext(script, {'preview': 'office'}, {'OCU_STUB_ASSETS': assets}) as asset_base:
        _assert_configured_preview(asset_base)
    log.info('configured-asset preview coverage passed')


def assert_embed_baseline(old_script: Path, new_script: Path) -> None:
    mapping = {'preview': 'office'}
    assets = os.environ.get('OCU_STUB_ASSETS')
    if not assets:
        for root in ('.run/local-test/build/ocu/computer-use-server', '.run/vps-test/build/ocu/computer-use-server'):
            if (Path(root) / 'app.py').is_file() and (Path(root) / 'static').is_dir():
                assets = str(Path(root, 'static').resolve())
                break
    for asset_mode in [None] + ([assets] if assets else []):
        _compare_embed_mode(old_script, new_script, mapping, asset_mode)


def _compare_embed_mode(old_script: Path, new_script: Path, mapping: dict, assets: str | None) -> None:
    env = {'OCU_STUB_ASSETS': assets} if assets else {}
    captured = {}
    for label, script in (('old', old_script), ('new', new_script)):
        with _StubContext(script, mapping, env) as base:
            captured[label] = {
                mode: _normalize_embed(*_request(base, f'/preview/{_seg("preview")}?embed={mode}'))
                for mode in ('files', 'browser', 'terminal', '')
            }
            captured[label]['standalone'] = _normalize_embed(*_request(base, f'/preview/{_seg("preview")}'))
            if any(response[0] != 200 for response in captured[label].values()):
                fail(f'{label} embed comparison did not receive successful pages')
    if captured['old'] != captured['new']:
        fail(f'non-Office embed responses diverged {captured["old"]} vs {captured["new"]}')


def replay_transcript(base: str) -> list:
    snapshot = []
    office = _office_file(base, 'replay-office')
    created = _create(base, 'replay-office', office)
    snapshot.append(('create', created[0], _strip_times(created[2])))
    persist = _save(base, 'replay-office', created[2]['session_id'], 'persist')
    snapshot.append(('persist', persist[0], _strip_times(persist[2])))
    snapshot.append(('status-persist', *_strip_pair(_status(base, 'replay-office', created[2]['session_id']))))
    snapshot.append(('versions-persist', *_strip_pair(_versions(base, 'replay-office', office))))
    snapshot.append(('outputs-persist', _strip_times(_outputs(base, 'replay-office')[0])))
    publish = _save(base, 'replay-office', created[2]['session_id'], 'publish')
    snapshot.append(('publish', publish[0], _strip_times(publish[2])))
    snapshot.append(('status-publish', *_strip_pair(_status(base, 'replay-office', created[2]['session_id']))))
    snapshot.append(('versions-publish', *_strip_pair(_versions(base, 'replay-office', office))))
    snapshot.append(('outputs-publish', _strip_times(_outputs(base, 'replay-office')[0])))
    closed = _close(base, 'replay-office', created[2]['session_id'])
    snapshot.append(('close', closed[0], _strip_times(closed[2])))
    snapshot.append(('status-close', *_strip_pair(_status(base, 'replay-office', created[2]['session_id']))))
    restored = _restore(base, 'replay-office', office, 1)
    snapshot.append(('restore', restored[0], _strip_times(restored[2])))
    snapshot.append(('versions-restore', *_strip_pair(_versions(base, 'replay-office', office))))
    conflict_id = _office_file(base, 'replay-office_conflict')
    conflict = _create(base, 'replay-office_conflict', conflict_id)
    _save(base, 'replay-office_conflict', conflict[2]['session_id'], 'publish')
    snapshot.append((
        'conflict-status', *_strip_pair(_status(base, 'replay-office_conflict', conflict[2]['session_id']))
    ))
    saved = _resolve(base, 'replay-office_conflict', conflict[2]['session_id'], 'save_as')
    snapshot.append(('conflict-save_as', saved[0], _strip_times(saved[2])))
    overwrite_id = _office_file(base, 'replay-conflict-overwrite')
    overwrite_session = _create(base, 'replay-conflict-overwrite', overwrite_id)[2]['session_id']
    _save(base, 'replay-conflict-overwrite', overwrite_session, 'publish')
    overwritten = _resolve(base, 'replay-conflict-overwrite', overwrite_session, 'overwrite')
    snapshot.append(('conflict-overwrite', overwritten[0], _strip_times(overwritten[2])))
    unsupported = _create(base, 'replay-office_unsupported', _office_file(base, 'replay-office_unsupported'))
    snapshot.append(('unsupported', unsupported[0], _strip_times(unsupported[2])))
    orphaned = _create(base, 'replay-office_orphaned', _office_file(base, 'replay-office_orphaned'))
    snapshot.append(('orphaned-create', orphaned[0], _strip_times(orphaned[2])))
    snapshot.append((
        'orphaned-status', *_strip_pair(_status(base, 'replay-office_orphaned', orphaned[2]['session_id']))
    ))
    save_as_id = _office_file(base, 'replay-office_save_as')
    save_as = _create(base, 'replay-office_save_as', save_as_id)
    snapshot.append(('save_as-create', save_as[0], _strip_times(save_as[2])))
    snapshot.append(('save_as-open-outputs', _strip_times(_outputs(base, 'replay-office_save_as')[0])))
    closed_save_as = _close(base, 'replay-office_save_as', save_as[2]['session_id'])
    snapshot.append(('save_as-close', closed_save_as[0], _strip_times(closed_save_as[2])))
    unpublished_id = _office_file(base, 'replay-office_unpublished')
    snapshot.append((
        'unpublished-versions', *_strip_pair(_versions(base, 'replay-office_unpublished', unpublished_id))
    ))
    unpublished_restore = _restore(base, 'replay-office_unpublished', unpublished_id, 2)
    snapshot.append(('unpublished-restore', unpublished_restore[0], _strip_times(unpublished_restore[2])))
    stale_id = _office_file(base, 'replay-office_stale')
    snapshot.append(('stale-versions', *_strip_pair(_versions(base, 'replay-office_stale', stale_id))))
    stale = _create(base, 'replay-office_stale', stale_id)
    snapshot.append(('stale-create', stale[0], _strip_times(stale[2])))
    recreated = _create(base, 'replay-office_stale', stale_id)
    snapshot.append(('stale-recreate', *_strip_pair(recreated)))
    final_resources = (
        ('replay-office', office, created[2]['session_id']),
        ('replay-office_conflict', saved[2]['file_id'], conflict[2]['session_id']),
        ('replay-conflict-overwrite', overwrite_id, overwrite_session),
        ('replay-office_unsupported', _office_file(base, 'replay-office_unsupported'), None),
        ('replay-office_orphaned', orphaned[2]['file_id'], orphaned[2]['session_id']),
        ('replay-office_save_as', _office_file(base, 'replay-office_save_as', 'report (2).docx'),
         save_as[2]['session_id']),
        ('replay-office_unpublished', unpublished_id, None),
        ('replay-office_stale', stale_id, recreated[2]['session_id']),
    )
    for chat, file_id, session_id in final_resources:
        snapshot.append((chat, _strip_times(_snapshot(base, chat, file_id, session_id))))
    return snapshot


def _strip_pair(result):
    return result[0], _strip_times(result[2])


def named_regression_mapping() -> dict[str, str]:
    mapping = {name: name for name in OFFICE_SCENARIOS}
    mapping.update(
        {
            'beta': 'office',
            'office_save_as-ns': 'office_save_as',
            'office_conflict-race': 'office_conflict',
            'corrupt': 'corrupt',
            'valid': 'valid',
            'office_conflict-ended': 'office_conflict',
            'office_conflict-ended-ow': 'office_conflict',
            'office_conflict-live': 'office_conflict',
            'office_conflict-rev': 'office_conflict',
            'office_save_as-rev': 'office_save_as',
            'office-race': 'office',
        }
    )
    mapping.update({f'replay-{name}': name for name in OFFICE_SCENARIOS})
    mapping['replay-conflict-overwrite'] = 'office_conflict'
    return mapping


def run_selector(name: str, *, script: Path, old_script: Path | None = None, base: str | None = None) -> None:
    if name == 'schema-create':
        if base is None:
            fail('schema-create requires a running stub')
        assert_missing_field_http(base)
        return
    if name == 'embed-baseline':
        if old_script is not None:
            assert_embed_baseline(old_script, script)
            return
        if base is None:
            fail('embed-baseline requires a running stub')
        assert_preview_contract(base, script)
        return
    if base is None:
        fail(f'{name} requires a running stub')
    {
        'r1-methods': assert_wrong_methods,
        'r2-identity': assert_unknown_identity,
        'r3-namespace': assert_shared_namespace,
        'r4-readonly': assert_readonly_history,
        'r7-ended-conflict': assert_ended_conflict,
        'r8-revision': assert_listing_revision,
        'history-restore': assert_restore_http,
        'missing-field': assert_missing_field_http,
        'concurrent-create': assert_concurrent_first_create,
    }[name](base)


def assert_restore_http(base: str) -> None:
    file_id = _office_file(base, 'office_unpublished')
    listing = _versions(base, 'office_unpublished', file_id)[2]
    before = listing['versions']
    if len(before) != 2 or [record['source'] for record in before] != ['workspace', 'autosave']:
        fail(f'unpublished restore prefix {before}')
    selected = before[-1]
    result = _restore(base, 'office_unpublished', file_id, selected['number'])
    if result[0] != 200:
        fail(f'restore HTTP {result[0]}')
    after_listing = _versions(base, 'office_unpublished', file_id)[2]
    after = after_listing['versions']
    assert_history_restored(before, after, selected)
    if len(after) != 3 or after[-1]['source'] != 'restore' or after[1]['source'] != 'autosave':
        fail(f'restore inserted an intermediate workspace version {after}')
    if after_listing['published_version'] != after[-1]['number']:
        fail(f'restore published_version {after_listing}')
    content = _request(base, f'/files/{_seg("office_unpublished")}/{_seg("report.docx")}')[2]
    if hashlib.sha256(content).hexdigest() != selected['sha256'] or len(content) != selected['size']:
        fail('restore did not serve selected content')


def run_regressions(script: Path, *, old_script: Path | None = None, selectors: tuple[str, ...] | None = None) -> None:
    chosen = selectors or DEFAULT_SELECTORS
    if old_script is None and os.environ.get('OCU_STUB_OLD_SCRIPT'):
        old_script = Path(os.environ['OCU_STUB_OLD_SCRIPT'])
    for name in chosen:
        if name == 'embed-baseline' and old_script is not None:
            run_selector(name, script=script, old_script=old_script)
        else:
            with _StubContext(script, named_regression_mapping()) as base:
                run_selector(name, script=script, old_script=old_script, base=base)
        log.info('office regression: %s passed', name)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    parser = argparse.ArgumentParser()
    parser.add_argument('--script', default=str(Path(__file__).with_name('ocu-stub.py')))
    parser.add_argument('--old-script')
    parser.add_argument('--selector', action='append', dest='selectors')
    parser.add_argument('--base')
    args = parser.parse_args(argv)
    script = Path(args.script)
    old_script = Path(args.old_script) if args.old_script else None
    selectors = tuple(args.selectors) if args.selectors else DEFAULT_SELECTORS
    if args.base:
        for name in selectors:
            run_selector(name, script=script, old_script=old_script, base=args.base.rstrip('/'))
        return 0
    run_regressions(script, old_script=old_script, selectors=selectors)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
