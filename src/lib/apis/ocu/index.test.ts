import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	getWorkspace,
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
});
