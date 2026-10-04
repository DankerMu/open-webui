"""Deterministic Office fixtures for the OCU stub.

Responses follow the broker field names of ocu-office-sessions and
ocu-office-publish. Callbacks are not served; accepted saves and closes
complete their simulated persist/publish in the same request so HTTP smoke
can observe the specified status, versions and listing outcomes.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from collections.abc import Callable
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlparse

OFFICE_SCENARIOS = frozenset(
    {
        'office',
        'office_conflict',
        'office_unsupported',
        'office_orphaned',
        'office_save_as',
        'office_unpublished',
        'office_stale',
    }
)
DEFAULT_PATH = 'report.docx'
DEFAULT_BYTES = b'PK\x03\x04office-default-document'
OPEN_STATES = frozenset({'opening', 'editing', 'saving', 'closing', 'conflict'})
CREATED_AT = '1970-01-01T00:00:00Z'
OFFICE_MIME = {
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
DOC_SESSIONS_RE = re.compile(r'^/api/office/([^/]+)/documents/([^/]+)/sessions$')
DOC_VERSIONS_RE = re.compile(r'^/api/office/([^/]+)/documents/([^/]+)/versions$')
DOC_RESTORE_RE = re.compile(r'^/api/office/([^/]+)/documents/([^/]+)/restore$')
SESSION_STATUS_RE = re.compile(r'^/api/office/([^/]+)/sessions/([^/]+)$')
SESSION_SAVE_RE = re.compile(r'^/api/office/([^/]+)/sessions/([^/]+)/save$')
SESSION_CLOSE_RE = re.compile(r'^/api/office/([^/]+)/sessions/([^/]+)/close$')
SESSION_RESOLVE_RE = re.compile(r'^/api/office/([^/]+)/sessions/([^/]+)/resolve$')
OFFICE_SHAPED_RE = re.compile(r'^/api/office(?:/|$)')
ALLOWED_ROUTES = (
    ('POST', DOC_SESSIONS_RE),
    ('GET', SESSION_STATUS_RE),
    ('POST', SESSION_SAVE_RE),
    ('POST', SESSION_CLOSE_RE),
    ('POST', SESSION_RESOLVE_RE),
    ('GET', DOC_VERSIONS_RE),
    ('POST', DOC_RESTORE_RE),
)


class OfficeStore:
    def __init__(
        self,
        *,
        lock: Any,
        scenario_of: Callable[[str], str | None],
        prefix: str,
        fixture_file: Callable[..., dict],
        fixture_outputs: Callable[[str], dict],
        occupied_names: Callable[[str], set[str]],
        files: dict,
        uploads: dict,
        valid_office: Path,
        scenario_file: Callable[[str, str], tuple | None],
    ) -> None:
        self._lock = lock
        self._scenario_of = scenario_of
        self._prefix = prefix
        self._fixture_file = fixture_file
        self._fixture_outputs = fixture_outputs
        self._occupied_names = occupied_names
        self._files = files
        self._uploads = uploads
        self._valid_office = valid_office
        self._scenario_file = scenario_file
        self._chats: dict[str, dict] = {}
        self._hidden: dict[str, set[str]] = {}

    def office_scenario(self, chat_id: str) -> str | None:
        scenario = self._scenario_of(chat_id)
        if scenario in OFFICE_SCENARIOS:
            return scenario
        return None

    def overlay_listing(self, chat_id: str, body: dict) -> None:
        chat = self._ensure_chat(chat_id)
        hidden = self._hidden.get(chat_id, set())
        extra = chat['revision_bump']
        files = [entry for entry in body['files'] if entry.get('path') not in hidden]
        by_path = {entry.get('path'): index for index, entry in enumerate(files)}
        for document in chat['documents'].values():
            extra += int(document.get('revision_bump', 0))
            if document['path'] in hidden or not document.get('list'):
                continue
            listing = copy.deepcopy(document['listing'])
            if document['path'] in by_path:
                files[by_path[document['path']]] = listing
            else:
                by_path[document['path']] = len(files)
                files.append(listing)
        body['files'] = files
        body['revision'] += extra
        if 'total' in body:
            body['total'] = len(body['files'])

    def file_bytes(self, chat_id: str, name: str) -> tuple[bytes, dict] | None:
        with self._lock:
            if name in self._hidden.get(chat_id, set()):
                return None
            chat = self._chats.get(chat_id)
            if chat is None:
                return None
            for document in chat['documents'].values():
                if document['path'] == name and document['serve']:
                    return document['bytes'], {'mime': document['listing']['mime']}
            return None

    def occupied_names(self, chat_id: str) -> set[str]:
        with self._lock:
            chat = self._ensure_chat(chat_id)
            return (
                set(self._occupied_names(chat_id))
                | {document['path'] for document in chat['documents'].values()}
                | self._hidden.get(chat_id, set())
            )

    def dispatch(self, handler: Any, method: str, path: str, body: bytes) -> bool:
        parsed = urlparse(path).path
        if not OFFICE_SHAPED_RE.match(parsed):
            return False
        for verb, regex in ALLOWED_ROUTES:
            match = regex.match(parsed)
            if match is None:
                continue
            if verb != method:
                handler._json(404, {'reason': 'not_found'})
                return True
            chat_id = unquote(match.group(1))
            token = unquote(match.group(2))
            with self._lock:
                payload = self._handle(method, regex, chat_id, token, body)
            handler._json(*payload)
            return True
        if OFFICE_SHAPED_RE.match(parsed):
            handler._json(404, {'reason': 'not_found'})
            return True
        return False

    def _handle(self, method: str, regex: re.Pattern, chat_id: str, token: str, body: bytes) -> tuple[int, dict]:
        if regex is DOC_SESSIONS_RE and method == 'POST':
            return self._create(chat_id, token)
        if regex is SESSION_STATUS_RE and method == 'GET':
            return self._status(chat_id, token)
        if regex is SESSION_SAVE_RE and method == 'POST':
            return self._save(chat_id, token, body)
        if regex is SESSION_CLOSE_RE and method == 'POST':
            return self._close(chat_id, token)
        if regex is SESSION_RESOLVE_RE and method == 'POST':
            return self._resolve(chat_id, token, body)
        if regex is DOC_VERSIONS_RE and method == 'GET':
            return self._versions(chat_id, token)
        if regex is DOC_RESTORE_RE and method == 'POST':
            return self._restore(chat_id, token, body)
        return 404, {'reason': 'not_found'}

    def _ensure_chat(self, chat_id: str) -> dict:
        chat = self._chats.get(chat_id)
        if chat is not None:
            return chat
        chat = {'documents': {}, 'sessions': {}, 'seq': 0, 'revision_bump': 0}
        self._chats[chat_id] = chat
        scenario = self.office_scenario(chat_id)
        if scenario == 'office_unpublished':
            self._seed_unpublished(chat_id, chat)
        elif scenario == 'office_stale':
            self._seed_stale(chat_id, chat)
        elif scenario in OFFICE_SCENARIOS:
            self._seed_named(chat_id, chat, scenario)
        return chat

    def _seed_named(self, chat_id: str, chat: dict, scenario: str) -> None:
        path = DEFAULT_PATH
        payload = self._seed_bytes(chat_id, path, scenario)
        document = self._new_document(chat_id, path, payload, list_file=True)
        chat['documents'][document['file_id']] = document

    def _seed_unpublished(self, chat_id: str, chat: dict) -> None:
        document = self._new_document(chat_id, DEFAULT_PATH, DEFAULT_BYTES)
        parent = document['versions'][0]
        unpublished = self._version_record(2, 'autosave', parent['number'], DEFAULT_BYTES + b'-autosave', False)
        document['versions'].append(unpublished)
        document['latest'] = unpublished
        chat['documents'][document['file_id']] = document

    def _seed_stale(self, chat_id: str, chat: dict) -> None:
        document = self._new_document(chat_id, DEFAULT_PATH, DEFAULT_BYTES)
        parent = document['versions'][0]
        unpublished = self._version_record(2, 'autosave', parent['number'], DEFAULT_BYTES + b'-stale', False)
        document['versions'].append(unpublished)
        document['latest'] = unpublished
        session = self._new_session(chat_id, chat, document, 'editing')
        session['last_committed_seq'] = 1
        document['open_session'] = session['session_id']
        document['stale_pending'] = True
        chat['documents'][document['file_id']] = document
        chat['sessions'][session['session_id']] = session

    def _seed_bytes(self, chat_id: str, path: str, scenario: str) -> bytes:
        if self._valid_office.is_file() and path.endswith('.docx'):
            return self._valid_office.read_bytes()
        return f'{chat_id}:{scenario}:{path}'.encode()

    def _new_document(self, chat_id: str, path: str, payload: bytes, *, list_file: bool = True) -> dict:
        listing = self._listing_entry(chat_id, path, payload, 1)
        version = self._version_record(1, 'workspace', None, payload, True)
        return {
            'file_id': listing['file_id'],
            'path': path,
            'bytes': payload,
            'serve': True,
            'listing': listing,
            'versions': [version],
            'latest': version,
            'published_version': 1,
            'open_session': None,
            'list': list_file,
            'revision_bump': 0,
            'stale_pending': False,
        }

    def _listing_entry(self, chat_id: str, path: str, payload: bytes, revision: int) -> dict:
        entry = self._fixture_file(chat_id, path, revision)
        entry.update(
            url=f'{self._prefix}/files/{chat_id}/{path}',
            size=len(payload),
            hash=hashlib.sha256(payload).hexdigest(),
            type='docx' if path.endswith('.docx') else entry.get('type', 'docx'),
            mime=OFFICE_MIME.get(Path(path).suffix.lower(), entry.get('mime', 'application/octet-stream')),
        )
        return entry

    def _version_record(self, number: int, source: str, parent: int | None, payload: bytes, published: bool) -> dict:
        return {
            'number': number,
            'parent': parent,
            'source': source,
            'sha256': hashlib.sha256(payload).hexdigest(),
            'size': len(payload),
            'created_at': CREATED_AT,
            'published': published,
            'bytes': payload,
        }

    def _public_version(self, record: dict) -> dict:
        return {key: record[key] for key in ('number', 'parent', 'source', 'sha256', 'size', 'created_at', 'published')}

    def _next_id(self, chat: dict, kind: str, chat_id: str) -> str:
        chat['seq'] += 1
        digest = hashlib.sha256(f'{chat_id}:{kind}:{chat["seq"]}'.encode()).hexdigest()
        return f'{kind}-{digest}'

    def _editor_config(self, chat_id: str, session: dict, ticket: str) -> dict:
        return {
            'document': {
                'key': session['document_key'],
                'url': f'/office/source/{ticket}',
            },
            'editorConfig': {
                'callbackUrl': f'/office/callback/{chat_id}/{session["session_id"]}',
            },
            'token': f'stub-{ticket}',
        }

    def _new_session(self, chat_id: str, chat: dict, document: dict, state: str) -> dict:
        session_id = self._next_id(chat, 'session', chat_id)
        document_key = self._next_id(chat, 'key', chat_id)
        ticket = self._next_id(chat, 'ticket', chat_id)
        session = {
            'session_id': session_id,
            'file_id': document['file_id'],
            'document_key': document_key,
            'state': state,
            'reason': None,
            'save_seq': 0,
            'last_committed_seq': 0,
            'last_published_seq': 0,
            'workspace_changed': False,
            'saved_as': None,
            'editor_ended': False,
            'ticket': ticket,
        }
        session['editor_config'] = self._editor_config(chat_id, session, ticket)
        return session

    def _find_document(self, chat: dict, file_id: str) -> dict | None:
        return chat['documents'].get(file_id)

    def _find_by_path(self, chat: dict, path: str) -> dict | None:
        for document in chat['documents'].values():
            if document['path'] == path:
                return document
        return None

    def _lookup_existing(self, chat_id: str, file_id: str) -> dict | None:
        chat = self._ensure_chat(chat_id)
        document = self._find_document(chat, file_id)
        if document is not None:
            return document
        listing = self._lookup_listing(chat_id, file_id)
        if listing is None:
            return None
        by_path = self._find_by_path(chat, listing['path'])
        if by_path is not None:
            return by_path
        payload = self._existing_bytes(chat_id, listing['path'])
        if payload is None:
            return None
        document = self._new_document(chat_id, listing['path'], payload, list_file=False)
        document['serve'] = False
        document['file_id'] = listing['file_id']
        document['listing'] = copy.deepcopy(listing)
        chat['documents'][document['file_id']] = document
        return document

    def _lookup_listing(self, chat_id: str, file_id: str) -> dict | None:
        chat = self._chats.get(chat_id)
        if chat is not None:
            for document in chat['documents'].values():
                if document['file_id'] == file_id:
                    return copy.deepcopy(document['listing'])
        for entry in self._fixture_outputs(chat_id).get('files', []):
            if entry.get('file_id') == file_id:
                return copy.deepcopy(entry)
        for _, entry in self._uploads.get(chat_id, {}).values():
            if entry.get('file_id') == file_id:
                return copy.deepcopy(entry)
        return None

    def _existing_bytes(self, chat_id: str, path: str) -> bytes | None:
        uploaded = self._uploads.get(chat_id, {}).get(path)
        if uploaded is not None:
            return uploaded[0]
        scenario = self._scenario_file(chat_id, path)
        if scenario is not None:
            return scenario[1] if scenario[0] == 200 else None
        fixture = self._files.get(path)
        if fixture is not None:
            return fixture[1]
        return None

    def _create_payload(self, session: dict, joined: bool) -> dict:
        return {
            'session_id': session['session_id'],
            'file_id': session['file_id'],
            'document_key': session['document_key'],
            'state': 'opening' if not joined else session['state'],
            'joined': joined,
            'editor_config': None if session['editor_ended'] else copy.deepcopy(session['editor_config']),
        }

    def _status_payload(self, session: dict) -> dict:
        saved_as = None if session['saved_as'] is None else copy.deepcopy(session['saved_as'])
        return {
            'session_id': session['session_id'],
            'file_id': session['file_id'],
            'document_key': session['document_key'],
            'state': session['state'],
            'reason': session['reason'],
            'save_seq': session['save_seq'],
            'last_committed_seq': session['last_committed_seq'],
            'last_published_seq': session['last_published_seq'],
            'workspace_changed': session['workspace_changed'],
            'saved_as': saved_as,
        }

    def _open_session_payload(self, chat: dict, document: dict) -> dict | None:
        session_id = document.get('open_session')
        if not session_id:
            return None
        session = chat['sessions'].get(session_id)
        if session is None or session['state'] not in OPEN_STATES:
            return None
        return {
            'session_id': session['session_id'],
            'state': session['state'],
            'reason': session['reason'],
            'editor_ended': session['editor_ended'],
        }

    def _append_version(self, document: dict, source: str, payload: bytes, published: bool) -> dict:
        parent = document['latest']['number'] if document['versions'] else None
        record = self._version_record(len(document['versions']) + 1, source, parent, payload, published)
        document['versions'].append(record)
        document['latest'] = record
        if published:
            document['published_version'] = record['number']
        return record

    def _already_stored(self, document: dict, payload: bytes) -> bool:
        digest = hashlib.sha256(payload).hexdigest()
        return any(record['sha256'] == digest for record in document['versions'])

    def _capture_workspace(self, document: dict) -> dict | None:
        if self._already_stored(document, document['bytes']):
            return None
        return self._append_version(document, 'workspace', document['bytes'], True)

    def _publish_bytes(self, chat_id: str, document: dict, payload: bytes) -> None:
        document['bytes'] = payload
        document['serve'] = True
        document['list'] = True
        document['listing']['size'] = len(payload)
        document['listing']['hash'] = hashlib.sha256(payload).hexdigest()
        document['listing']['revision'] = int(document['listing'].get('revision', 1)) + 1
        document['revision_bump'] = int(document.get('revision_bump', 0)) + 1
        uploaded = self._uploads.get(chat_id, {}).get(document['path'])
        if uploaded is not None:
            self._uploads[chat_id][document['path']] = (payload, document['listing'])

    def _dedupe_name(self, chat_id: str, path: str) -> str:
        occupied = self.occupied_names(chat_id)
        candidate = path
        parsed = PurePosixPath(path)
        counter = 2
        while candidate in occupied:
            candidate = str(parsed.with_name(f'{parsed.stem} ({counter}){parsed.suffix}'))
            counter += 1
        return candidate

    def _join_or_refuse(self, chat_id: str, chat: dict, document: dict) -> tuple[int, dict] | None:
        if document.get('stale_pending'):
            session = chat['sessions'][document['open_session']]
            session['state'] = 'orphaned'
            session['reason'] = 'editor_state_lost'
            document['open_session'] = None
            document['stale_pending'] = False
            return 409, {'reason': 'unpublished_version'}
        open_id = document.get('open_session')
        if not open_id:
            return None
        session = chat['sessions'][open_id]
        if session['state'] not in OPEN_STATES:
            return None
        if session['editor_ended']:
            return 200, self._create_payload(session, True)
        ticket = self._next_id(chat, 'ticket', chat_id)
        session['ticket'] = ticket
        session['editor_config'] = self._editor_config(chat_id, session, ticket)
        return 200, self._create_payload(session, True)

    def _create(self, chat_id: str, file_id: str) -> tuple[int, dict]:
        scenario = self.office_scenario(chat_id)
        chat = self._ensure_chat(chat_id)
        document = self._lookup_existing(chat_id, file_id)
        if document is None:
            return 404, {'reason': 'unknown_file'}
        if scenario == 'office_unsupported':
            return 415, {'reason': 'unsupported_type'}
        joined = self._join_or_refuse(chat_id, chat, document)
        if joined is not None:
            return joined
        if scenario == 'office_orphaned' and document.get('orphaned_once'):
            session = self._new_session(chat_id, chat, document, 'editing')
            document['open_session'] = session['session_id']
            chat['sessions'][session['session_id']] = session
            return 201, self._create_payload(session, False)
        session = self._new_session(chat_id, chat, document, 'editing')
        document['open_session'] = session['session_id']
        chat['sessions'][session['session_id']] = session
        if scenario == 'office_save_as':
            self._hidden.setdefault(chat_id, set()).add(document['path'])
            document['list'] = False
            chat['revision_bump'] += 1
        return 201, self._create_payload(session, False)

    def _status(self, chat_id: str, session_id: str) -> tuple[int, dict]:
        chat = self._ensure_chat(chat_id)
        session = chat['sessions'].get(session_id)
        if session is None:
            return 404, {'reason': 'unknown_session'}
        scenario = self.office_scenario(chat_id)
        if scenario == 'office_orphaned' and session['state'] in OPEN_STATES and not session.get('seen_status'):
            session['state'] = 'orphaned'
            session['reason'] = 'editor_state_lost'
            document = chat['documents'][session['file_id']]
            if document.get('open_session') == session_id:
                document['open_session'] = None
                document['orphaned_once'] = True
        session['seen_status'] = True
        return 200, self._status_payload(session)

    def _read_json(self, body: bytes) -> dict | None:
        if not body:
            return {}
        try:
            payload = json.loads(body.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def _save(self, chat_id: str, session_id: str, body: bytes) -> tuple[int, dict]:
        chat = self._ensure_chat(chat_id)
        session = chat['sessions'].get(session_id)
        if session is None:
            return 404, {'reason': 'unknown_session'}
        if session['state'] != 'editing':
            return 409, {'reason': 'session_not_editing'}
        payload = self._read_json(body)
        if payload is None or payload.get('intent') not in ('publish', 'persist'):
            return 422, {'reason': 'invalid_request'}
        intent = payload['intent']
        session['save_seq'] += 1
        save_seq = session['save_seq']
        document = chat['documents'][session['file_id']]
        if intent == 'persist':
            content = document['bytes'] + f'-autosave-{save_seq}'.encode()
            self._append_version(document, 'autosave', content, False)
            session['last_committed_seq'] = save_seq
            session['state'] = 'editing'
            session['reason'] = None
            return 202, {'session_id': session_id, 'save_seq': save_seq, 'intent': intent}
        if self.office_scenario(chat_id) == 'office_conflict':
            content = document['bytes'] + f'-conflict-{save_seq}'.encode()
            self._append_version(document, 'save', content, False)
            session['last_committed_seq'] = save_seq
            session['state'] = 'conflict'
            session['reason'] = 'baseline_mismatch'
            session['workspace_changed'] = True
            return 202, {'session_id': session_id, 'save_seq': save_seq, 'intent': intent}
        content = document['bytes'] + f'-save-{save_seq}'.encode()
        record = self._append_version(document, 'save', content, True)
        self._publish_bytes(chat_id, document, record['bytes'])
        session['last_committed_seq'] = save_seq
        session['last_published_seq'] = save_seq
        session['state'] = 'editing'
        session['reason'] = None
        session['workspace_changed'] = False
        return 202, {'session_id': session_id, 'save_seq': save_seq, 'intent': intent}

    def _close(self, chat_id: str, session_id: str) -> tuple[int, dict]:
        chat = self._ensure_chat(chat_id)
        session = chat['sessions'].get(session_id)
        if session is None:
            return 404, {'reason': 'unknown_session'}
        if session['state'] in {'closed', 'error', 'orphaned'}:
            return 409, {'reason': 'session_not_open'}
        if session['state'] == 'conflict' and session['editor_ended']:
            return 202, {'session_id': session_id, 'save_seq': session['save_seq'], 'state': 'conflict'}
        session['save_seq'] += 1
        save_seq = session['save_seq']
        document = chat['documents'][session['file_id']]
        scenario = self.office_scenario(chat_id)
        if session['state'] == 'conflict':
            session['last_committed_seq'] = save_seq
            session['editor_ended'] = True
            return 202, {'session_id': session_id, 'save_seq': save_seq, 'state': 'conflict'}
        if scenario == 'office_save_as':
            new_path = self._dedupe_name(chat_id, document['path'])
            content = document['bytes'] + b'-saved-as'
            new_document = self._new_document(chat_id, new_path, content)
            new_document['versions'][0]['source'] = 'conflict'
            chat['documents'][new_document['file_id']] = new_document
            chat['revision_bump'] += 1
            document['open_session'] = None
            document['list'] = False
            self._hidden.setdefault(chat_id, set()).add(document['path'])
            session['file_id'] = new_document['file_id']
            session['saved_as'] = {'file_id': new_document['file_id'], 'path': new_path}
            session['state'] = 'closed'
            session['reason'] = None
            session['last_committed_seq'] = save_seq
            session['last_published_seq'] = save_seq
            session['editor_ended'] = True
            new_document['open_session'] = None
            return 202, {'session_id': session_id, 'save_seq': save_seq, 'state': 'closed'}
        latest = document['latest']
        if not latest['published']:
            latest['published'] = True
            document['published_version'] = latest['number']
            self._publish_bytes(chat_id, document, latest['bytes'])
        else:
            record = self._append_version(document, 'close', document['bytes'] + f'-close-{save_seq}'.encode(), True)
            self._publish_bytes(chat_id, document, record['bytes'])
        session['state'] = 'closed'
        session['reason'] = None
        session['last_committed_seq'] = save_seq
        session['last_published_seq'] = save_seq
        session['editor_ended'] = True
        document['open_session'] = None
        return 202, {'session_id': session_id, 'save_seq': save_seq, 'state': 'closed'}

    def _resolve(self, chat_id: str, session_id: str, body: bytes) -> tuple[int, dict]:
        chat = self._ensure_chat(chat_id)
        session = chat['sessions'].get(session_id)
        if session is None:
            return 404, {'reason': 'unknown_session'}
        if session['state'] != 'conflict':
            return 409, {'reason': 'not_in_conflict'}
        payload = self._read_json(body)
        if payload is None:
            return 422, {'reason': 'invalid_request'}
        action = payload.get('action', 'save_as')
        if action not in ('save_as', 'overwrite'):
            return 422, {'reason': 'invalid_request'}
        document = chat['documents'][session['file_id']]
        latest = document['latest']
        resolved_state = 'closed' if session['editor_ended'] else 'editing'
        if action == 'overwrite':
            user_version = document['latest']
            self._capture_workspace(document)
            user_version['published'] = True
            document['published_version'] = user_version['number']
            self._publish_bytes(chat_id, document, user_version['bytes'])
            session['state'] = resolved_state
            session['reason'] = None
            session['last_published_seq'] = session['last_committed_seq']
            session['workspace_changed'] = False
            if session['editor_ended']:
                document['open_session'] = None
            return 200, {
                'session_id': session_id,
                'state': resolved_state,
                'file_id': document['file_id'],
                'path': document['path'],
            }
        new_path = self._dedupe_name(chat_id, document['path'])
        new_document = self._new_document(chat_id, new_path, latest['bytes'])
        new_document['versions'][0]['source'] = 'conflict'
        chat['documents'][new_document['file_id']] = new_document
        chat['revision_bump'] += 1
        document['open_session'] = None
        session['file_id'] = new_document['file_id']
        session['saved_as'] = {'file_id': new_document['file_id'], 'path': new_path}
        session['state'] = resolved_state
        session['reason'] = None
        session['last_published_seq'] = session['last_committed_seq']
        session['workspace_changed'] = False
        new_document['open_session'] = None if session['editor_ended'] else session_id
        return 200, {
            'session_id': session_id,
            'state': resolved_state,
            'file_id': new_document['file_id'],
            'path': new_path,
        }

    def _versions(self, chat_id: str, file_id: str) -> tuple[int, dict]:
        chat = self._ensure_chat(chat_id)
        document = self._lookup_existing(chat_id, file_id)
        if document is None:
            return 404, {'reason': 'unknown_file'}
        return 200, {
            'file_id': document['file_id'],
            'published_version': document['published_version'],
            'open_session': self._open_session_payload(chat, document),
            'versions': [self._public_version(record) for record in document['versions']],
        }

    def _restore(self, chat_id: str, file_id: str, body: bytes) -> tuple[int, dict]:
        chat = self._ensure_chat(chat_id)
        document = self._lookup_existing(chat_id, file_id)
        if document is None:
            return 404, {'reason': 'unknown_file'}
        if document.get('open_session'):
            session = chat['sessions'].get(document['open_session'])
            if session is not None and session['state'] in OPEN_STATES:
                return 409, {'reason': 'session_open'}
        payload = self._read_json(body)
        if payload is None or not isinstance(payload.get('number'), int):
            return 422, {'reason': 'invalid_request'}
        number = payload['number']
        source = next((record for record in document['versions'] if record['number'] == number), None)
        if source is None:
            return 404, {'reason': 'unknown_version'}
        self._capture_workspace(document)
        restored = self._append_version(document, 'restore', source['bytes'], True)
        self._publish_bytes(chat_id, document, restored['bytes'])
        return 200, {'file_id': document['file_id'], 'number': restored['number'], 'published': True}
