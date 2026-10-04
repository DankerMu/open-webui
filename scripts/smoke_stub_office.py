"""HTTP assertions for the OCU stub Office fixtures.

Width: seven routes, seven named scenarios, both conflict resolutions,
default/unassigned chats, isolation, concurrent joins, fresh-process replay,
forbidden methods/paths, private observations, public canaries, listing
identity and non-Office preservation cannot share one compact case without
losing a required clause.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote

log = logging.getLogger('smoke-stub-office')

OFFICE_SCENARIOS = (
    'office',
    'office_conflict',
    'office_unsupported',
    'office_orphaned',
    'office_save_as',
    'office_unpublished',
    'office_stale',
)
TIME_FIELDS = frozenset({'created_at', 'timestamp'})
CANARY = 'Tok!office-canary#$%'
MUTATION = {'X-Requested-With': 'ocu-workspace', 'Content-Type': 'application/json'}
CREATE_FIELDS = {'session_id', 'file_id', 'document_key', 'state', 'joined', 'editor_config'}


def fail(message: str) -> None:
    raise AssertionError(message)


def _request(base: str, path: str, *, method: str = 'GET', data: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        return response.status, dict(response.headers), response.read()


def _json(base: str, path: str, *, method: str = 'GET', payload: dict | None = None, headers: dict | None = None):
    data = None if payload is None else json.dumps(payload).encode()
    merged = dict(MUTATION if method != 'GET' else {})
    if headers:
        merged.update(headers)
    status, response_headers, body = _request(base, path, method=method, data=data, headers=merged)
    parsed = json.loads(body.decode()) if body else {}
    return status, response_headers, parsed, body


def _file_id(listing: dict, path: str) -> str:
    return next(entry['file_id'] for entry in listing['files'] if entry['path'] == path)


def _entry(listing: dict, path: str) -> dict:
    return next(entry for entry in listing['files'] if entry['path'] == path)


def _strip_times(value):
    if isinstance(value, dict):
        return {key: _strip_times(item) for key, item in value.items() if key not in TIME_FIELDS}
    if isinstance(value, list):
        return [_strip_times(item) for item in value]
    return value


def copy_version(record: dict) -> dict:
    return {key: record[key] for key in ('number', 'parent', 'source', 'sha256', 'size', 'published')}


def _wait(base: str) -> None:
    for _ in range(50):
        try:
            status, _, _ = _request(base, '/internal/describe/running')
            if status == 200:
                return
        except OSError:
            time.sleep(0.05)
    fail('stub not ready')


def start_stub(script: Path, env: dict[str, str]) -> tuple[subprocess.Popen, str, Path]:
    port_sock = socket.socket()
    port_sock.bind(('127.0.0.1', 0))
    port = port_sock.getsockname()[1]
    port_sock.close()
    handle, record_name = tempfile.mkstemp(prefix='ocu-stub-office-')
    os.close(handle)
    record = Path(record_name)
    merged = os.environ.copy()
    merged.update(env)
    merged.update(
        {
            'OCU_STUB_PORT': str(port),
            'OCU_PUBLIC_PREFIX': '/ocu',
            'OCU_STUB_RECORD': str(record),
            'PYTHONPATH': str(script.parent) + os.pathsep + merged.get('PYTHONPATH', ''),
        }
    )
    proc = subprocess.Popen(
        [sys.executable, str(script)],
        env=merged,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f'http://127.0.0.1:{port}'
    try:
        _wait(base)
    except Exception:
        proc.kill()
        proc.wait(timeout=5)
        record.unlink(missing_ok=True)
        raise
    return proc, base, record


def stop_stub(proc: subprocess.Popen, record: Path) -> None:
    proc.kill()
    proc.wait(timeout=5)
    record.unlink(missing_ok=True)


def _write_fixtures(mapping: dict[str, str]) -> Path:
    handle, name = tempfile.mkstemp(prefix='ocu-office-fixtures-', suffix='.json')
    os.close(handle)
    path = Path(name)
    path.write_text(json.dumps(mapping), encoding='utf-8')
    return path


def _observations(record: Path) -> list[dict]:
    if not record.exists():
        return []
    return [json.loads(line) for line in record.read_text(encoding='utf-8').splitlines() if line]


def _assert_canary_absent(headers: dict, body: bytes) -> None:
    blob = json.dumps({key.lower(): value for key, value in headers.items()}) + body.decode('utf-8', 'replace')
    if CANARY.lower() in blob.lower() or 'authorization' in {key.lower() for key in headers}:
        fail('public Office response leaked a credential canary')


def _upload_docx(base: str, chat: str, name: str = 'brief.docx') -> tuple[str, dict]:
    payload = b'PK\x03\x04uploaded-office'
    envelope = (
        b'--smoke-boundary\r\nContent-Disposition: form-data; name="file"; '
        b'filename="ignored.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'
        + payload
        + b'\r\n--smoke-boundary--\r\n'
    )
    status, _, body = _request(
        base,
        f'/api/uploads/{chat}/{quote(name)}',
        method='POST',
        data=envelope,
        headers={'Content-Type': 'multipart/form-data; boundary=smoke-boundary'},
    )
    if status != 200:
        fail(f'upload {name} HTTP {status}')
    listing = json.loads(_request(base, f'/api/outputs/{chat}')[2])
    stored = json.loads(body)['filename']
    return _file_id(listing, stored), listing


def _create(base: str, chat: str, file_id: str):
    return _json(base, f'/api/office/{chat}/documents/{file_id}/sessions', method='POST', payload={})


def _status(base: str, chat: str, session_id: str):
    return _json(base, f'/api/office/{chat}/sessions/{session_id}')


def _save(base: str, chat: str, session_id: str, intent: str):
    return _json(base, f'/api/office/{chat}/sessions/{session_id}/save', method='POST', payload={'intent': intent})


def _close(base: str, chat: str, session_id: str):
    return _json(base, f'/api/office/{chat}/sessions/{session_id}/close', method='POST', payload={})


def _resolve(base: str, chat: str, session_id: str, action: str):
    return _json(
        base,
        f'/api/office/{chat}/sessions/{session_id}/resolve',
        method='POST',
        payload={'action': action},
    )


def _versions(base: str, chat: str, file_id: str):
    return _json(base, f'/api/office/{chat}/documents/{file_id}/versions')


def _restore(base: str, chat: str, file_id: str, number: int):
    return _json(base, f'/api/office/{chat}/documents/{file_id}/restore', method='POST', payload={'number': number})


def _outputs(base: str, chat: str):
    status, headers, body = _request(base, f'/api/outputs/{chat}')
    if status != 200:
        fail(f'outputs {chat} HTTP {status}')
    return json.loads(body), headers.get('ETag') or headers.get('etag')


def assert_unknown_paths(base: str) -> None:
    chat = 'office-unknown'
    file_id = 'missing'
    session = 'missing'
    cases = (
        ('GET', f'/api/office/{chat}/documents/{file_id}/sessions'),
        ('PUT', f'/api/office/{chat}/documents/{file_id}/sessions'),
        ('DELETE', f'/api/office/{chat}/sessions/{session}'),
        ('POST', f'/api/office/{chat}/sessions/{session}'),
        ('GET', f'/api/office/{chat}/sessions/{session}/save'),
        ('PATCH', f'/api/office/{chat}/sessions/{session}/close'),
        ('GET', f'/api/office/{chat}/sessions/{session}/resolve'),
        ('POST', f'/api/office/{chat}/documents/{file_id}/versions'),
        ('GET', f'/api/office/{chat}/documents/{file_id}/restore'),
        ('GET', f'/api/office/{chat}/callback/{session}'),
        ('POST', f'/api/office/{chat}/source/{session}'),
        ('OPTIONS', f'/api/office/{chat}/documents/{file_id}/sessions'),
        ('HEAD', f'/api/office/{chat}/sessions/{session}'),
    )
    for method, path in cases:
        status, _, _ = _request(base, path, method=method)
        if status != 404:
            fail(f'{method} {path} expected 404, got {status}')


def assert_host_page(base: str, chat: str) -> None:
    status, headers, body = _request(base, f'/preview/{chat}?embed=office')
    if status != 200:
        fail(f'embed=office HTTP {status}')
    text = body.decode()
    if 'ocu-office-simulate-modification' not in text:
        fail('office host page missing modification control')
    if 'http://' in text or 'https://' in text:
        fail('office host page referenced a non-stub origin')
    csp = headers.get('Content-Security-Policy') or headers.get('content-security-policy') or ''
    if 'connect-src' in csp and "'self'" not in csp:
        fail('office host CSP missing same-origin connect-src')
    for mode in ('files', 'browser', 'terminal'):
        other = _request(base, f'/preview/{chat}?embed={mode}')
        if other[0] != 200:
            fail(f'embed={mode} HTTP {other[0]}')
        if b'ocu-office-simulate-modification' in other[2]:
            fail(f'embed={mode} served the Office host page')


def _assert_create_and_join(base: str, chat: str, file_id: str) -> dict:
    created = _create(base, chat, file_id)
    if created[0] != 201 or created[2].get('joined') is not False:
        fail(f'default create {created[0]} {created[2]}')
    if set(created[2]) < CREATE_FIELDS:
        fail(f'create missing fields {created[2].keys()}')
    session_id = created[2]['session_id']
    joined = _create(base, chat, file_id)
    if joined[0] != 200 or joined[2].get('joined') is not True or joined[2]['session_id'] != session_id:
        fail(f'default join {joined[0]} {joined[2]}')
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: _create(base, chat, file_id)[2]['session_id'], range(4)))
    if set(results) != {session_id}:
        fail(f'concurrent joins diverged {results}')
    return created[2]


def _assert_persist_and_publish(
    base: str,
    chat: str,
    file_id: str,
    session_id: str,
    listing_before: dict,
    etag_before: str | None,
):
    original_path = next(entry['path'] for entry in listing_before['files'] if entry['file_id'] == file_id)
    persist = _save(base, chat, session_id, 'persist')
    if persist[0] != 202 or persist[2].get('intent') != 'persist':
        fail(f'persist {persist[0]} {persist[2]}')
    listing_persist, etag_persist = _outputs(base, chat)
    if listing_persist['revision'] != listing_before['revision'] or etag_persist != etag_before:
        fail('persist changed outputs listing')
    if _entry(listing_persist, original_path) != _entry(listing_before, original_path):
        fail('persist changed file listing identity')
    versions = _versions(base, chat, file_id)[2]
    if versions['versions'][-1]['source'] != 'autosave' or versions['versions'][-1]['published'] is not False:
        fail(f'persist versions {versions}')
    earlier = [copy_version(record) for record in versions['versions']]
    publish = _save(base, chat, session_id, 'publish')
    if publish[0] != 202:
        fail(f'publish {publish[0]} {publish[2]}')
    status = _status(base, chat, session_id)[2]
    if status['state'] != 'editing' or status['last_published_seq'] != publish[2]['save_seq']:
        fail(f'publish status {status}')
    listing_after, _ = _outputs(base, chat)
    if listing_after['revision'] <= listing_before['revision']:
        fail('publish did not raise listing revision')
    if _entry(listing_after, original_path)['file_id'] != file_id:
        fail('publish changed file_id')
    versions_after = _versions(base, chat, file_id)[2]
    if not any(record['source'] == 'save' and record['published'] for record in versions_after['versions']):
        fail(f'publish versions {versions_after}')
    return earlier, versions_after


def _assert_close_and_restore(
    base: str,
    chat: str,
    file_id: str,
    session_id: str,
    earlier: list,
    versions_after: dict,
):
    close = _close(base, chat, session_id)
    if close[0] != 202:
        fail(f'close {close[0]} {close[2]}')
    closed = _status(base, chat, session_id)[2]
    if closed['state'] != 'closed':
        fail(f'closed status {closed}')
    restore_number = versions_after['versions'][0]['number']
    restored = _restore(base, chat, file_id, restore_number)
    if restored[0] != 200 or restored[2].get('published') is not True:
        fail(f'restore {restored[0]} {restored[2]}')
    history = _versions(base, chat, file_id)[2]['versions']
    if history[-1]['source'] != 'restore' or history[-1]['published'] is not True:
        fail(f'restore versions {history}')
    for index, record in enumerate(earlier):
        current = copy_version(history[index])
        mutated = current != record and history[index]['number'] == record['number']
        if mutated and history[index]['source'] != record['source']:
            fail('restore mutated earlier versions')


def _assert_default_round_trip(base: str, chat: str, file_id: str) -> dict:
    listing_before, etag_before = _outputs(base, chat)
    created = _assert_create_and_join(base, chat, file_id)
    earlier, versions_after = _assert_persist_and_publish(
        base, chat, file_id, created['session_id'], listing_before, etag_before
    )
    _assert_close_and_restore(base, chat, file_id, created['session_id'], earlier, versions_after)
    return created


def named_office_mapping() -> dict[str, str]:
    mapping = {name: name for name in OFFICE_SCENARIOS}
    mapping['office_conflict-overwrite'] = 'office_conflict'
    mapping['office_unpublished-restore'] = 'office_unpublished'
    return mapping


def assert_office_conflict(base: str, chat: str) -> None:
    listing, _ = _outputs(base, chat)
    file_id = _file_id(listing, 'report.docx')
    original = _entry(listing, 'report.docx')
    original_bytes = _request(base, f'/files/{chat}/report.docx')[2]
    session_id = _create(base, chat, file_id)[2]['session_id']
    _save(base, chat, session_id, 'publish')
    conflicted = _status(base, chat, session_id)[2]
    if conflicted['state'] != 'conflict':
        fail(f'conflict status {conflicted}')
    saved = _resolve(base, chat, session_id, 'save_as')
    if saved[0] != 200 or saved[2]['state'] != 'editing':
        fail(f'save_as resolve {saved}')
    after_save_as, _ = _outputs(base, chat)
    if _entry(after_save_as, 'report.docx')['revision'] != original['revision']:
        fail('save_as mutated original listing identity')
    if _request(base, f'/files/{chat}/report.docx')[2] != original_bytes:
        fail('save_as mutated original bytes')
    if 'report (2).docx' not in {entry['path'] for entry in after_save_as['files']}:
        fail('save_as missing deduplicated name')
    log.info('office_conflict')
    other_chat = f'{chat}-overwrite'
    listing_b, _ = _outputs(base, other_chat)
    file_b = _file_id(listing_b, 'report.docx')
    session_b = _create(base, other_chat, file_b)[2]['session_id']
    _save(base, other_chat, session_b, 'publish')
    before = _entry(_outputs(base, other_chat)[0], 'report.docx')
    overwritten = _resolve(base, other_chat, session_b, 'overwrite')
    if overwritten[0] != 200 or overwritten[2]['state'] != 'editing':
        fail(f'overwrite resolve {overwritten}')
    after, _ = _outputs(base, other_chat)
    if _entry(after, 'report.docx')['revision'] <= before['revision']:
        fail('overwrite did not raise revision')
    if any(entry['path'] == 'report (2).docx' for entry in after['files']):
        fail('overwrite created a new name')
    log.info('office_conflict overwrite')


def assert_office_unsupported(base: str, chat: str) -> None:
    listing, _ = _outputs(base, chat)
    file_id = _file_id(listing, 'report.docx')
    status, _, body, _ = _create(base, chat, file_id)
    if status != 415 or body.get('reason') != 'unsupported_type':
        fail(f'unsupported {status} {body}')
    versions = _versions(base, chat, file_id)[2]
    if versions.get('open_session') is not None:
        fail(f'unsupported created a session {versions}')
    log.info('office_unsupported')


def assert_office_orphaned(base: str, chat: str) -> None:
    listing, _ = _outputs(base, chat)
    file_id = _file_id(listing, 'report.docx')
    first = _create(base, chat, file_id)[2]
    status = _status(base, chat, first['session_id'])[2]
    if status['state'] != 'orphaned':
        fail(f'orphaned status {status}')
    second = _create(base, chat, file_id)[2]
    if second['session_id'] == first['session_id'] or second.get('joined') is not False:
        fail(f'orphaned recreate {second}')
    log.info('office_orphaned')


def assert_office_save_as(base: str, chat: str) -> None:
    versions = _versions(base, chat, 'seed')
    if versions[0] != 200:
        fail(f'save_as versions seed {versions[0]} {versions[2]}')
    file_id = versions[2]['file_id']
    created = _create(base, chat, file_id)
    if created[0] != 201:
        fail(f'save_as create {created[0]} {created[2]}')
    open_listing, _ = _outputs(base, chat)
    if any(entry['path'] == 'report.docx' for entry in open_listing['files']):
        fail('save_as still lists report.docx after open')
    _close(base, chat, created[2]['session_id'])
    closed = _status(base, chat, created[2]['session_id'])[2]
    if closed['state'] != 'closed' or not closed.get('saved_as'):
        fail(f'save_as status {closed}')
    after, _ = _outputs(base, chat)
    names = {entry['path'] for entry in after['files']}
    if 'report.docx' in names or 'report (2).docx' not in names:
        fail(f'save_as listing {names}')
    if _entry(after, 'report (2).docx')['file_id'] != closed['saved_as']['file_id']:
        fail('save_as status file_id mismatch')
    if closed['saved_as']['path'] != 'report (2).docx':
        fail(f'save_as path {closed["saved_as"]}')
    log.info('office_save_as')


def assert_office_unpublished(base: str, chat: str) -> None:
    listing, _ = _outputs(base, chat)
    file_id = _file_id(listing, 'report.docx')
    versions = _versions(base, chat, file_id)[2]
    if versions['open_session'] is not None:
        fail(f'unpublished open_session {versions}')
    if versions['versions'][-1]['source'] != 'autosave' or versions['versions'][-1]['published'] is not False:
        fail(f'unpublished versions {versions}')
    restore_chat = f'{chat}-restore'
    restore_listing, _ = _outputs(base, restore_chat)
    restore_id = _file_id(restore_listing, 'report.docx')
    restore_versions = _versions(base, restore_chat, restore_id)[2]
    restored = _restore(base, restore_chat, restore_id, restore_versions['versions'][-1]['number'])
    if restored[0] != 200:
        fail(f'unpublished restore {restored}')
    after, _ = _outputs(base, restore_chat)
    if after['revision'] <= restore_listing['revision']:
        fail('unpublished restore did not raise revision')
    history = _versions(base, restore_chat, restore_id)[2]['versions']
    if history[-1]['source'] != 'restore' or history[-1]['published'] is not True:
        fail(f'unpublished restore versions {history}')
    created = _create(base, chat, file_id)
    if created[0] != 201:
        fail(f'unpublished create without restore {created}')
    unchanged = _versions(base, chat, file_id)[2]
    first = [copy_version(record) for record in unchanged['versions'][:2]]
    second = [copy_version(record) for record in versions['versions'][:2]]
    if first != second:
        fail('unpublished create without restore changed history')
    log.info('office_unpublished')


def assert_office_stale(base: str, chat: str) -> None:
    listing, _ = _outputs(base, chat)
    file_id = _file_id(listing, 'report.docx')
    first_versions = _versions(base, chat, file_id)[2]
    open_session = first_versions.get('open_session') or {}
    if open_session.get('state') != 'editing' or open_session.get('editor_ended') is not False:
        fail(f'stale first listing {first_versions}')
    if first_versions['versions'][-1]['published'] is not False:
        fail(f'stale newest published {first_versions}')
    refused = _create(base, chat, file_id)
    if refused[0] != 409 or refused[2].get('reason') != 'unpublished_version':
        fail(f'stale first create {refused}')
    second_versions = _versions(base, chat, file_id)[2]
    if second_versions.get('open_session') is not None:
        fail(f'stale second listing {second_versions}')
    after = [copy_version(record) for record in second_versions['versions']]
    before = [copy_version(record) for record in first_versions['versions']]
    if after != before:
        fail('stale versions changed after refusal')
    created = _create(base, chat, file_id)
    if created[0] != 201:
        fail(f'stale second create {created}')
    log.info('office_stale')


def assert_named_office(script: Path) -> None:
    fixtures = _write_fixtures(named_office_mapping())
    proc = None
    record = None
    try:
        proc, base, record = start_stub(script, {'OCU_STUB_FIXTURES': str(fixtures)})
        assert_office_conflict(base, 'office_conflict')
        assert_office_unsupported(base, 'office_unsupported')
        assert_office_orphaned(base, 'office_orphaned')
        assert_office_save_as(base, 'office_save_as')
        assert_office_unpublished(base, 'office_unpublished')
        assert_office_stale(base, 'office_stale')
        created = _create(base, 'office', _file_id(_outputs(base, 'office')[0], 'report.docx'))
        if created[0] != 201:
            fail(f'office default named {created}')
        log.info('office')
    finally:
        if proc is not None and record is not None:
            stop_stub(proc, record)
        fixtures.unlink(missing_ok=True)


def _snapshot_replay(base: str, chat: str, file_id: str) -> list:
    created = _create(base, chat, file_id)
    snapshot = [(created[0], _strip_times(created[2]))]
    persist = _save(base, chat, created[2]['session_id'], 'persist')
    snapshot.append((persist[0], _strip_times(persist[2])))
    publish = _save(base, chat, created[2]['session_id'], 'publish')
    snapshot.append((publish[0], _strip_times(publish[2])))
    return snapshot


def _office_snapshot(base: str, chat: str, file_id: str, session_id: str) -> tuple:
    versions = _versions(base, chat, file_id)
    listing, _ = _outputs(base, chat)
    status = _status(base, chat, session_id)
    return (
        versions[0],
        _strip_times(versions[2]),
        _strip_times(listing),
        status[0],
        _strip_times(status[2]),
    )


def _assert_foreign_resources(base: str, alpha_session: str, beta_session: str) -> None:
    if alpha_session == beta_session:
        fail('alpha and beta shared a session_id')
    if _status(base, 'alpha', beta_session)[0] != 404:
        fail('foreign session_id was accepted')
    foreign_id, _ = _upload_docx(base, 'beta', 'beta-only.docx')
    alpha_ids = {entry['file_id'] for entry in _outputs(base, 'alpha')[0]['files']}
    if foreign_id in alpha_ids:
        fail('beta-only file_id appeared in alpha listing')
    if _create(base, 'alpha', foreign_id)[0] != 404:
        fail('foreign file_id was accepted')


def assert_isolation_and_replay(script: Path) -> None:
    fixtures = _write_fixtures({'alpha': 'office', 'beta': 'office_orphaned', 'replay': 'office'})
    env = {'OCU_STUB_FIXTURES': str(fixtures)}
    first, base, record = start_stub(script, env)
    try:
        shared_id = _file_id(_outputs(base, 'alpha')[0], 'report.docx')
        if shared_id != _file_id(_outputs(base, 'beta')[0], 'report.docx'):
            fail('alpha and beta did not share the fixture file_id')
        created_beta = _create(base, 'beta', shared_id)
        if created_beta[0] != 201:
            fail(f'beta create {created_beta[0]} {created_beta[2]}')
        beta_session = created_beta[2]['session_id']
        beta_status = _status(base, 'beta', beta_session)[2]
        if beta_status['state'] != 'orphaned':
            fail('beta isolation lost orphaned outcome')
        before = _office_snapshot(base, 'beta', shared_id, beta_session)
        alpha = _assert_default_round_trip(base, 'alpha', shared_id)
        if _office_snapshot(base, 'beta', shared_id, beta_session) != before:
            fail('alpha mutations leaked into beta')
        _assert_foreign_resources(base, alpha['session_id'], beta_session)
        rows = _observations(record)
        if not any('/api/office/' in row.get('target', '') for row in rows):
            fail('Office arrivals were not privately observed')
        public = _request(
            base,
            f'/api/office/alpha/sessions/{alpha["session_id"]}',
            headers={'Authorization': f'Bearer {CANARY}'},
        )
        _assert_canary_absent(public[1], public[2])
        snapshot = _snapshot_replay(base, 'replay', _file_id(_outputs(base, 'replay')[0], 'report.docx'))
    finally:
        stop_stub(first, record)
    second, base2, record2 = start_stub(script, env)
    try:
        replayed = _snapshot_replay(base2, 'replay', _file_id(_outputs(base2, 'replay')[0], 'report.docx'))
        if replayed != snapshot:
            fail(f'deterministic replay diverged {snapshot} vs {replayed}')
        page = _request(base2, '/preview/alpha?embed=office')
        if page[0] != 200 or b'ocu-office-simulate-modification' not in page[2]:
            fail('replay host page missing control')
    finally:
        stop_stub(second, record2)


def assert_non_office_preserved(base: str) -> None:
    status, _, body = _request(base, '/api/outputs/running')
    if status != 200 or b'/ocu/files/' not in body:
        fail('non-Office outputs listing changed')
    if _request(base, '/files/running/page.html')[0] != 200:
        fail('non-Office file serving changed')


def run_office_smoke(base: str, *, script: Path, record: Path | None = None) -> None:
    assert_unknown_paths(base)
    file_id, _listing = _upload_docx(base, 'unassigned-office')
    created = _assert_default_round_trip(base, 'unassigned-office', file_id)
    if created['file_id'] != file_id:
        fail('default create used a different file_id')
    assert_host_page(base, 'unassigned-office')
    if record is not None:
        rows = _observations(record)
        if not any(row.get('target', '').startswith('/api/office/') for row in rows):
            fail('Office requests missing from private observations')
    assert_named_office(script)
    assert_non_office_preserved(base)
    assert_isolation_and_replay(script)
    log.info('smoke-stub: office fixtures verified')


def _script_path() -> Path:
    if os.environ.get('OCU_STUB_SCRIPT'):
        return Path(os.environ['OCU_STUB_SCRIPT'])
    if len(sys.argv) > 2:
        return Path(sys.argv[2])
    return Path(__file__).with_name('ocu-stub.py')


def main() -> int:
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    script = _script_path()
    if len(sys.argv) > 1 and sys.argv[1].startswith('http'):
        base = sys.argv[1].rstrip('/')
        record = Path(os.environ['OCU_STUB_RECORD']) if os.environ.get('OCU_STUB_RECORD') else None
        run_office_smoke(base, script=script, record=record)
        return 0
    proc, base, record = start_stub(script, {})
    try:
        run_office_smoke(base, script=script, record=record)
    finally:
        stop_stub(proc, record)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
