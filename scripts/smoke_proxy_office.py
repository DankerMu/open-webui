"""Serial Office Hurl admission and per-request private arrival proofs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import quote

from smoke_proxy_support import fail, observations, run_hurl_files


class OfficeJudge:
    def __init__(self, smoke, path: Path, report: Path, logger) -> None:
        self.smoke = smoke
        self.path = path
        self.report = report
        self.logger = logger
        self.counter = 0
        self.chat = smoke.office_chat
        self.file = ''
        self.session = ''
        self.key = ''
        self.variables = {
            'office_chat': quote(self.chat, safe=''), 'office_file': 'pending',
            'office_session': 'pending', 'office_state': 'editing', 'office_version': 1,
            'office_cookie': '', 'office_origin': smoke.origin,
            'office_expected': 404, 'office_path': '/pending',
        }

    def request(self, entry: int, method: str, path: str, label: str, allowed=True, **variables) -> dict:
        self.counter += 1
        self.variables.update(variables)
        destination = self.report / str(self.counter)
        destination.mkdir(mode=0o700, parents=True)
        options = ['--from-entry', str(entry), '--to-entry', str(entry)]
        for name, value in self.variables.items():
            options.extend(['--variable', f'{name}={value}'])
        before = len(observations(self.smoke.record))
        self.logger.info('Office %s %s %s', label, method, path)
        run_hurl_files(self.smoke, [str(self.path)], destination, self.logger, options)
        arrivals = observations(self.smoke.record)[before:]
        if not allowed:
            if arrivals:
                fail(f'Office {label} {method} {path} contacted OCU')
        else:
            expected_identity = {
                'x-user-id': self.smoke.owner_id, 'x-user-email': self.smoke.owner_email,
                'x-chat-id': self.chat,
            }
            if len(arrivals) != 1 or (
                arrivals[0].get('method') != method
                or arrivals[0].get('target') != path.removeprefix('/ocu')
                or arrivals[0].get('identity') != expected_identity
                or arrivals[0].get('token_ok') is not True
            ):
                fail(f'Office {label} {method} {path} expected one correctly attributed arrival')
        report = destination / '0' / 'report.json'
        response = json.loads(report.read_text())[0]['entries'][0]['calls'][0]['response']
        raw = (report.parent / response['body']).read_bytes()
        if self.smoke.token.encode() in raw:
            fail('internal credential appeared in Office response')
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if allowed:
                fail(f'Office {label} returned non-JSON response')
            return {}

    def equal(self, actual: dict, expected: dict, label: str) -> None:
        if actual != expected:
            fail(f'Office {label} response differs from deterministic fixture')

    def status(self, state: str, seq: int, published: int) -> None:
        path = f'/ocu/api/office/{quote(self.chat, safe="")}/sessions/{quote(self.session, safe="")}'
        result = self.request(2, 'GET', path, state, office_state=state)
        self.equal(result, {
            'session_id': self.session, 'file_id': self.file, 'document_key': self.key,
            'state': state, 'reason': 'baseline_mismatch' if state == 'conflict' else None,
            'save_seq': seq, 'last_committed_seq': seq, 'last_published_seq': published,
            'workspace_changed': state == 'conflict', 'saved_as': None,
        }, state)

    def run(self) -> None:
        base = f'/ocu/api/office/{quote(self.chat, safe="")}'
        listing = self.request(11, 'GET', f'/ocu/api/outputs/{quote(self.chat, safe="")}',
                               'file admission', office_path=f'/ocu/api/outputs/{quote(self.chat, safe="")}')
        self.file = next(item['file_id'] for item in listing['files'] if item['path'] == 'report.docx')
        self.variables['office_file'] = quote(self.file, safe='')
        document = f'{base}/documents/{quote(self.file, safe="")}'
        created = self.request(1, 'POST', document + '/sessions', 'create')
        self.session = created['session_id']
        self.key = created['document_key']
        self.variables['office_session'] = quote(self.session, safe='')
        ticket = created['editor_config']['document']['url'].removeprefix('/office/source/')
        self.equal(created, {
            'session_id': self.session, 'file_id': self.file, 'document_key': self.key,
            'state': 'opening', 'joined': False, 'editor_config': {
                'document': {'key': self.key, 'url': f'/office/source/{ticket}'},
                'editorConfig': {'callbackUrl': f'/office/callback/{self.chat}/{self.session}'},
                'token': f'stub-{ticket}',
            },
        }, 'create')
        session = f'{base}/sessions/{quote(self.session, safe="")}'
        self.status('editing', 0, 0)
        self.equal(self.request(3, 'POST', session + '/save', 'publish save'),
                   {'session_id': self.session, 'save_seq': 1, 'intent': 'publish'}, 'save')
        self.status('conflict', 1, 0)
        self.equal(self.request(4, 'POST', session + '/resolve', 'resolve observed conflict'),
                   {'session_id': self.session, 'state': 'editing', 'file_id': self.file,
                    'path': 'report.docx'}, 'resolve')
        self.status('editing', 1, 1)
        self.equal(self.request(5, 'POST', session + '/close', 'close'),
                   {'session_id': self.session, 'save_seq': 2, 'state': 'closed'}, 'close')
        self.status('closed', 2, 2)
        versions = self.request(6, 'GET', document + '/versions', 'versions')
        seed = f'{self.chat}:office_conflict:report.docx'.encode()
        expected_versions = []
        for number, source, content in (
            (1, 'workspace', seed), (2, 'save', seed + b'-conflict-1'),
            (3, 'close', seed + b'-conflict-1-close-2'),
        ):
            expected_versions.append({
                'number': number, 'parent': number - 1 if number > 1 else None,
                'source': source, 'sha256': hashlib.sha256(content).hexdigest(), 'size': len(content),
                'created_at': '1970-01-01T00:00:00Z', 'published': True,
            })
        self.equal(versions, {'file_id': self.file, 'published_version': 3,
                             'open_session': None, 'versions': expected_versions}, 'versions')
        number = versions['versions'][0]['number']
        self.equal(self.request(7, 'POST', document + '/restore', 'restore after closed', office_version=number),
                   {'file_id': self.file, 'number': 4, 'published': True}, 'restore')
        rows = (
            ('POST', document + '/sessions'), ('GET', session), ('POST', session + '/save'),
            ('POST', session + '/close'), ('POST', session + '/resolve'),
            ('GET', document + '/versions'), ('POST', document + '/restore'),
        )
        for method, path in rows:
            self.denials(method, path)
        for method, path in (
            ('GET', session + '/save'), ('POST', document + '/versions'),
            ('GET', session + '/extra'), ('GET', '/ocu/office/source/any-ticket'),
            ('POST', f'/ocu/office/callback/{quote(self.chat, safe="")}/any-session'),
        ):
            self.request(8 if method == 'GET' else 9, method, path, 'unlisted 404', False,
                         office_path=path, office_cookie=self.smoke.owner_cookie,
                         office_origin=self.smoke.origin, office_expected=404)
        self.logger.info('Office: seven owner rows, 24 auth/guard denials and five unlisted denials passed')

    def denials(self, method: str, path: str) -> None:
        entry = 8 if method == 'GET' else 9
        for label, cookie, expected in (
            ('anonymous 401', '', 401), ('non-owner 404', self.smoke.foreign_cookie, 404),
        ):
            self.request(entry, method, path, label, False, office_path=path,
                         office_cookie=cookie, office_origin=self.smoke.origin, office_expected=expected)
        if method == 'POST':
            self.request(9, method, path, 'null Origin 403', False, office_path=path,
                         office_cookie=self.smoke.owner_cookie, office_origin='null', office_expected=403)
            self.request(10, method, path, 'missing X-Requested-With 403', False, office_path=path)
