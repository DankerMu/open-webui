import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	getWorkspace,
	listWorkspaceFiles,
	launchWorkspace,
	putWorkspacePrefs,
	refreshWorkspace,
	workspaceFileUrl,
	WorkspaceRequestError
} from './index';

describe('ocu workspace client', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('receives workspace data through authenticated route and preference requests', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const headers = new Headers(init?.headers);
				if (
					headers.get('authorization') !== 'Bearer tok' ||
					headers.get('X-Requested-With') !== 'ocu-workspace'
				) {
					throw new Error('request rejected by workspace transport');
				}
				if (String(input) === '/api/v1/ocu/workspaces/chat-1' && init?.method === 'GET') {
					return new Response('{"revision":7}');
				}
				if (
					String(input) === '/api/v1/ocu/workspaces/chat-1/prefs' &&
					init?.method === 'PUT' &&
					init.body === '{"view":"files"}'
				) {
					return new Response('{"prefs":{"view":"terminal"}}');
				}
				throw new Error('request rejected by workspace transport');
			})
		);

		expect(await getWorkspace('tok', 'chat-1')).toEqual({ revision: 7 });
		expect(await putWorkspacePrefs('tok', 'chat-1', { view: 'files' })).toEqual({
			prefs: { view: 'terminal' }
		});
	});

	it.each([
		['describe', () => getWorkspace('tok', 'chat-1')],
		['launch', () => launchWorkspace('tok', 'chat-1')],
		['refresh', () => refreshWorkspace('tok', 'chat-1')],
		['prefs', () => putWorkspacePrefs('tok', 'chat-1', { view: 'files' })]
	] as const)(
		'%s rejects network failures with one safe error shape',
		async (_operation, request) => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-network-marker')));
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const requestPromise = request();
			await expect(requestPromise).rejects.toBeInstanceOf(WorkspaceRequestError);
			await expect(requestPromise).rejects.toMatchObject({
				status: 0,
				reason: 'request_failed',
				message: 'request_failed'
			});
			expect(consoleSpy).not.toHaveBeenCalled();
		}
	);

	it.each([
		[409, '{"reason":"never_created"}', 'never_created'],
		[502, '{"reason":"ocu_upstream_error"}', 'ocu_upstream_error'],
		[502, '{"reason":"ocu_unreachable"}', 'ocu_unreachable'],
		[500, '', 'request_failed'],
		[500, 'private-upstream-marker', 'request_failed'],
		[500, '{"detail":"private-upstream-marker"}', 'request_failed'],
		[500, '{"reason":"private-upstream-marker"}', 'request_failed'],
		[401, '{"reason":"never_created"}', 'unauthorized'],
		[403, '{"reason":"ocu_upstream_error"}', 'forbidden'],
		[404, '{"reason":"ocu_unreachable"}', 'not_found']
	] as const)('HTTP %i maps failed bodies to safe reasons', async (status, body, reason) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const request = launchWorkspace('tok', 'chat-1');
		await expect(request).rejects.toBeInstanceOf(WorkspaceRequestError);
		await expect(request).rejects.toMatchObject({ status, reason, message: reason });
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('rejects malformed successful JSON without misclassifying the HTTP status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-upstream-marker')));
		const request = refreshWorkspace('tok', 'chat-1');

		await expect(request).rejects.toBeInstanceOf(WorkspaceRequestError);
		await expect(request).rejects.toMatchObject({
			status: 200,
			reason: 'invalid_response',
			message: 'invalid_response'
		});
	});
	it('uses an explicit ETag for an accepted listing and safely distinguishes 304 from empty', async () => {
		const listing = {
			chat_id: 'chat-1',
			revision: 7,
			total: 1,
			next_cursor: null,
			files: [
				{
					file_id: 'f1',
					path: 'page.html',
					name: 'page.html',
					url: '/ocu/files/chat-1/page.html',
					type: 'html',
					mime: 'text/html',
					revision: 7,
					size: 10
				}
			]
		};
		const requests: RequestInit[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				requests.push(init ?? {});
				return requests.length === 1
					? new Response(JSON.stringify(listing), { headers: { ETag: 'W/"revision-seven"' } })
					: new Response(null, { status: 304, headers: { ETag: 'W/"revision-seven"' } });
			})
		);
		expect(await listWorkspaceFiles('/ocu', 'chat-1')).toEqual({
			kind: 'listing',
			listing,
			etag: 'W/"revision-seven"'
		});
		expect(
			await listWorkspaceFiles('/ocu', 'chat-1', undefined, { etag: 'W/"revision-seven"' })
		).toEqual({
			kind: 'not_modified',
			etag: 'W/"revision-seven"'
		});
		expect(new Headers(requests[0].headers).has('If-None-Match')).toBe(false);
		expect(new Headers(requests[1].headers).get('If-None-Match')).toBe('W/"revision-seven"');
		expect(requests[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
	});

	describe('too_large listing marker', () => {
		const entry = {
			file_id: 'f1',
			path: 'big.html',
			name: 'big.html',
			url: '/ocu/files/chat-1/big.html',
			type: 'html',
			mime: 'text/html',
			revision: 3,
			size: 104857601
		};
		const respond = (file: object) =>
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response(
						JSON.stringify({
							chat_id: 'chat-1',
							revision: 3,
							total: 1,
							next_cursor: null,
							files: [file]
						})
					)
				)
			);

		it.each([
			['true', { ...entry, too_large: true }, true],
			['false', { ...entry, too_large: false }, false],
			['absent', entry, undefined]
		] as const)('accepts a listing whose marker is %s', async (_label, file, marker) => {
			respond(file);
			const result = await listWorkspaceFiles('/ocu', 'chat-1');
			expect(result.kind).toBe('listing');
			const [listed] = result.kind === 'listing' ? result.listing.files : [];
			expect(listed).toEqual(file);
			expect(listed.too_large).toBe(marker);
			expect(listed.too_large === true).toBe(marker === true);
		});

		it.each([
			['a string', 'yes'],
			['a number', 1],
			['null', null],
			['an object', {}]
		] as const)('rejects a marker that is %s as an invalid response', async (_label, value) => {
			respond({ ...entry, too_large: value });
			await expect(listWorkspaceFiles('/ocu', 'chat-1')).rejects.toMatchObject({
				status: 200,
				reason: 'invalid_response'
			});
		});
	});

	describe('unsupported_name listing marker', () => {
		// OCU's display forms: b'\xb1\xa8.docx' decoded with backslashreplace, and a backslash name.
		const surrogate = {
			file_id: '5f0c6a52-unsupported',
			path: 'sub/\\xb1\\xa8.docx',
			name: '\\xb1\\xa8.docx',
			url: null,
			type: 'docx',
			mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			revision: 2,
			size: 10,
			too_large: false,
			unsupported_name: true
		};
		const backslash = {
			...surrogate,
			file_id: '9d41e7b0-unsupported',
			path: 'a\\b.html',
			name: 'a\\b.html',
			type: 'html',
			mime: 'text/html'
		};
		const supported = {
			file_id: 'f1',
			path: 'page.html',
			name: 'page.html',
			url: '/ocu/files/chat-1/page.html',
			type: 'html',
			mime: 'text/html',
			revision: 1,
			size: 10
		};
		const respond = (...files: object[]) =>
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response(
						JSON.stringify({
							chat_id: 'chat-1',
							revision: 2,
							total: files.length,
							next_cursor: null,
							files
						})
					)
				)
			);

		it('accepts unsupported entries with a null URL and a display path beside a normal file', async () => {
			const files = [surrogate, backslash, { ...supported, unsupported_name: false }];
			respond(...files);
			const result = await listWorkspaceFiles('/ocu', 'chat-1');
			expect(result).toEqual({ kind: 'listing', listing: expect.anything(), etag: null });
			expect(result.kind === 'listing' && result.listing.files).toEqual(files);
		});

		it('returns no URL for an unsupported entry instead of rejecting its display path', () => {
			expect(workspaceFileUrl('/ocu', 'chat-1', surrogate)).toBe('');
			expect(workspaceFileUrl('/ocu', 'chat-1', backslash)).toBe('');
			expect(workspaceFileUrl('/ocu', 'chat-1', supported)).toBe('/ocu/files/chat-1/page.html');
		});

		it.each([
			['a string marker', { ...supported, unsupported_name: 'yes' }],
			['a number marker', { ...supported, unsupported_name: 1 }],
			['a null marker', { ...supported, unsupported_name: null }],
			['an object marker', { ...supported, unsupported_name: {} }],
			[
				'a URL on an unsupported entry',
				{ ...surrogate, path: 'x.docx', name: 'x.docx', url: '/ocu/files/chat-1/x.docx' }
			],
			['a missing URL on an unsupported entry', { ...surrogate, url: undefined }],
			['an empty path on an unsupported entry', { ...surrogate, path: '' }],
			['a null URL without the marker', { ...supported, url: null }],
			['a null URL with the marker false', { ...supported, url: null, unsupported_name: false }]
		] as const)('rejects %s as an invalid response', async (_label, file) => {
			respond(supported, file);
			await expect(listWorkspaceFiles('/ocu', 'chat-1')).rejects.toMatchObject({
				reason: 'invalid_response'
			});
		});
	});

	it('rejects an unqualified or mismatched 304 instead of accepting an empty listing', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(new Response(null, { status: 304, headers: { ETag: 'W/"unknown"' } }))
		);
		await expect(listWorkspaceFiles('/ocu', 'chat-1')).rejects.toMatchObject({
			status: 304,
			reason: 'invalid_response'
		});
		await expect(
			listWorkspaceFiles('/ocu', 'chat-1', undefined, { etag: 'W/"known"' })
		).rejects.toMatchObject({
			status: 304,
			reason: 'invalid_response'
		});
	});
});
