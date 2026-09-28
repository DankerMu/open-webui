import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	getWorkspace,
	listWorkspaceFiles,
	launchWorkspace,
	putWorkspacePrefs,
	refreshWorkspace,
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
