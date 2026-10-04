import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceRequestError } from './index';
import {
	getOfficeSessionStatus,
	listOfficeVersions,
	restoreOfficeVersion,
	resolveOfficeConflict
} from './office';

const CHAT = 'chat a/b';
const FILE = 'file#1';
const SESSION = 'sess?2';
const encodedChat = encodeURIComponent(CHAT);
const encodedFile = encodeURIComponent(FILE);
const encodedSession = encodeURIComponent(SESSION);

const statusPayload = {
	session_id: SESSION,
	file_id: FILE,
	document_key: 'doc-key',
	state: 'editing',
	reason: null,
	save_seq: 1,
	last_committed_seq: 1,
	last_published_seq: 1,
	workspace_changed: false,
	saved_as: null
};

const versionsPayload = {
	file_id: FILE,
	published_version: 1,
	open_session: {
		session_id: SESSION,
		state: 'conflict',
		reason: 'baseline_mismatch',
		editor_ended: true
	},
	versions: [
		{
			number: 1,
			parent: null,
			source: 'workspace',
			sha256: 'abc',
			size: 12,
			created_at: '1970-01-01T00:00:00Z',
			published: true
		}
	]
};

const restorePayload = { file_id: FILE, number: 2, published: true };
const resolvePayload = {
	session_id: SESSION,
	state: 'closed',
	file_id: 'file-2',
	path: 'report (2).docx'
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), { status: 200, ...init });

describe('ocu office client', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('reads session status through an encoded same-origin GET without a mutation header', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe(`/ocu/api/office/${encodedChat}/sessions/${encodedSession}`);
			expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
			const headers = new Headers(init?.headers);
			expect(headers.has('X-Requested-With')).toBe(false);
			expect(headers.has('authorization')).toBe(false);
			expect(headers.has('Authorization')).toBe(false);
			return jsonResponse(statusPayload);
		});
		vi.stubGlobal('fetch', fetchMock);

		expect(await getOfficeSessionStatus('/ocu', CHAT, SESSION)).toEqual(statusPayload);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('lists versions through an encoded same-origin GET without a mutation header', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe(
				`/ocu/api/office/${encodedChat}/documents/${encodedFile}/versions`
			);
			expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
			const headers = new Headers(init?.headers);
			expect(headers.has('X-Requested-With')).toBe(false);
			return jsonResponse(versionsPayload);
		});
		vi.stubGlobal('fetch', fetchMock);

		expect(await listOfficeVersions('/ocu', CHAT, FILE)).toEqual(versionsPayload);
	});

	it('restores a version through an encoded POST with the mutation header and number body', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe(`/ocu/api/office/${encodedChat}/documents/${encodedFile}/restore`);
			expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
			expect(init?.body).toBe(JSON.stringify({ number: 3 }));
			const headers = new Headers(init?.headers);
			expect(headers.get('X-Requested-With')).toBe('ocu-workspace');
			expect(headers.get('Content-Type')).toBe('application/json');
			expect(headers.has('authorization')).toBe(false);
			return jsonResponse(restorePayload);
		});
		vi.stubGlobal('fetch', fetchMock);

		expect(await restoreOfficeVersion('/ocu', CHAT, FILE, 3)).toEqual(restorePayload);
	});

	it.each(['save_as', 'overwrite'] as const)(
		'resolves a conflict through an encoded POST with action %s',
		async (action) => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					`/ocu/api/office/${encodedChat}/sessions/${encodedSession}/resolve`
				);
				expect(init).toMatchObject({
					method: 'POST',
					credentials: 'same-origin',
					cache: 'no-store'
				});
				expect(init?.body).toBe(JSON.stringify({ action }));
				const headers = new Headers(init?.headers);
				expect(headers.get('X-Requested-With')).toBe('ocu-workspace');
				expect(headers.get('Content-Type')).toBe('application/json');
				return jsonResponse(resolvePayload);
			});
			vi.stubGlobal('fetch', fetchMock);

			expect(await resolveOfficeConflict('/ocu', CHAT, SESSION, action)).toEqual(resolvePayload);
		}
	);

	it('rejects a gateway base other than /ocu before contacting the network', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(getOfficeSessionStatus('/api', CHAT, SESSION)).rejects.toMatchObject({
			status: 0,
			reason: 'invalid_response'
		});
		await expect(listOfficeVersions('/ocu/', CHAT, FILE)).rejects.toMatchObject({
			status: 0,
			reason: 'invalid_response'
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		['status', () => getOfficeSessionStatus('/ocu', CHAT, SESSION)],
		['versions', () => listOfficeVersions('/ocu', CHAT, FILE)],
		['restore', () => restoreOfficeVersion('/ocu', CHAT, FILE, 1)],
		['resolve', () => resolveOfficeConflict('/ocu', CHAT, SESSION, 'save_as')]
	] as const)('%s maps a transport failure to status 0 request_failed', async (_name, request) => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-network-marker')));
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const pending = request();
		await expect(pending).rejects.toBeInstanceOf(WorkspaceRequestError);
		await expect(pending).rejects.toMatchObject({
			status: 0,
			reason: 'request_failed',
			message: 'request_failed'
		});
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it.each([
		[409, '{"reason":"session_open"}', 'session_open'],
		[409, '{"reason":"workspace_missing"}', 'workspace_missing'],
		[409, '{"reason":"not_in_conflict"}', 'not_in_conflict'],
		[409, '{"reason":"path_missing"}', 'path_missing'],
		[404, '{"reason":"unknown_file"}', 'unknown_file'],
		[404, '{"reason":"unknown_session"}', 'unknown_session'],
		[404, '{"reason":"unknown_version"}', 'unknown_version'],
		[503, '{"reason":"unsafe_path"}', 'unsafe_path'],
		[503, '{"reason":"pause_failed"}', 'pause_failed'],
		[404, '{"reason":"broker_invented_reason"}', 'broker_invented_reason'],
		[404, '{"reason":""}', ''],
		[500, '', 'request_failed'],
		[500, 'private-upstream-marker', 'request_failed'],
		[500, '{"detail":"private-upstream-marker"}', 'request_failed'],
		[500, '{"reason":12}', 'request_failed'],
		[500, '{"reason":null}', 'request_failed']
	] as const)(
		'HTTP %i keeps the broker reason or falls back to request_failed',
		async (status, body, reason) => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
			const pending = restoreOfficeVersion('/ocu', CHAT, FILE, 1);
			await expect(pending).rejects.toBeInstanceOf(WorkspaceRequestError);
			await expect(pending).rejects.toMatchObject({ status, reason, message: reason });
		}
	);

	it('rejects malformed successful JSON without changing the HTTP status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-upstream-marker')));
		const pending = getOfficeSessionStatus('/ocu', CHAT, SESSION);
		await expect(pending).rejects.toBeInstanceOf(WorkspaceRequestError);
		await expect(pending).rejects.toMatchObject({
			status: 200,
			reason: 'invalid_response',
			message: 'invalid_response'
		});
	});
});
