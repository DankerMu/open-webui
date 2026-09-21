import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	getWorkspace,
	launchWorkspace,
	putWorkspacePrefs,
	refreshWorkspace
} from './index';

describe('ocu workspace client', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: async () => ({})
				})
			)
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('sends X-Requested-With: ocu-workspace on getWorkspace', async () => {
		await getWorkspace('tok', 'chat-1');
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(String(url)).toBe('/api/v1/ocu/workspaces/chat-1');
		expect(init?.method).toBe('GET');
		expect(new Headers(init?.headers).get('X-Requested-With')).toBe('ocu-workspace');
	});

	it('sends X-Requested-With: ocu-workspace on launchWorkspace', async () => {
		await launchWorkspace('tok', 'chat-1');
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(String(url)).toBe('/api/v1/ocu/workspaces/chat-1/launch');
		expect(init?.method).toBe('POST');
		expect(new Headers(init?.headers).get('X-Requested-With')).toBe('ocu-workspace');
	});

	it('sends X-Requested-With: ocu-workspace on refreshWorkspace', async () => {
		await refreshWorkspace('tok', 'chat-1');
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(String(url)).toBe('/api/v1/ocu/workspaces/chat-1/refresh');
		expect(init?.method).toBe('POST');
		expect(new Headers(init?.headers).get('X-Requested-With')).toBe('ocu-workspace');
	});

	it('sends X-Requested-With: ocu-workspace on putWorkspacePrefs', async () => {
		await putWorkspacePrefs('tok', 'chat-1', { view: 'files' });
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(String(url)).toBe('/api/v1/ocu/workspaces/chat-1/prefs');
		expect(init?.method).toBe('PUT');
		expect(new Headers(init?.headers).get('X-Requested-With')).toBe('ocu-workspace');
	});
});
