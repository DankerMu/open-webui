// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import { workspaceFilesEnabled, workspaceFileUrl, type WorkspaceFile } from '$lib/apis/ocu';
import { ocuWorkspaces } from '$lib/stores/ocu';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import {
	chat,
	url,
	i18n,
	file,
	describeBody,
	listing,
	json
} from '../../../../test/ocu-workspace-fixtures';
import {
	createWorkspaceReconciliation,
	WORKSPACE_RECONCILIATION,
	type WorkspaceReconciliation
} from './workspace-reconciliation';
import { isSavedChatId } from '$lib/utils/chatId';
let component: Record<string, unknown> | undefined;
let calls: Array<{ url: string; init?: RequestInit }>;
let scenario: (input: string, init?: RequestInit) => Response | Promise<Response>;
let controller: WorkspaceReconciliation;
let detachController: () => void;
let boundChat: string | null = null;
async function open(enabled = true, id = chat) {
	component = mount(WorkspaceArtifact, {
		target: document.body,
		props: { chatId: id, enabled },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, controller]
		])
	});
	await tick();
	const valid = enabled && isSavedChatId(id) && id !== 'default';
	const sameChat = valid && boundChat === id;
	controller.observe(id, enabled);
	if (sameChat) controller.reconnect();
	boundChat = valid ? id : null;
	await vi.waitFor(() =>
		expect(document.body.querySelector('[aria-label="Workspace Files"]')).not.toBeNull()
	);
	return document.body;
}
async function ready(text: string) {
	await vi.waitFor(() => expect(document.body.textContent).toContain(text));
}
async function click(name: string) {
	const button = [...document.querySelectorAll('button')].find(
		(item) => item.textContent?.trim() === name || item.getAttribute('aria-label') === name
	);
	expect(button, name).toBeDefined();
	button!.click();
	await tick();
}
describe('mounted workspace Files contract', () => {
	beforeEach(() => {
		ocuWorkspaces.set({});
		document.body.replaceChildren();
		localStorage.setItem('token', 'fixture-session');
		calls = [];
		scenario = (input) =>
			input.includes('/workspaces/') ? json(describeBody) : json(listing([file('page.html')]));
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				calls.push({ url: String(input), init });
				return Promise.resolve(scenario(String(input), init));
			})
		);
		boundChat = null;
		controller = createWorkspaceReconciliation({
			token: () => localStorage.token,
			available: () => true,
			translate: (key, params) => get(i18n).t(key, params)
		});
		detachController = controller.mount();
	});
	afterEach(async () => {
		if (component) await unmount(component);
		detachController();
		component = undefined;
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		document.body.replaceChildren();
	});
	it('keeps disabled and unsaveable chats off the network', async () => {
		await open(false);
		expect(calls).toEqual([]);
		await unmount(component!);
		component = undefined;
		for (const id of ['', 'default', 'temporary:new', 'local:new', 'channel:new']) {
			await open(true, id);
			await unmount(component!);
			component = undefined;
		}
		expect(calls).toEqual([]);
		expect(workspaceFilesEnabled({ features: { enable_ocu_workspace: true } })).toBe(true);
		expect(workspaceFilesEnabled({ features: { enable_ocu_workspace: false } })).toBe(false);
	});
	it('shows empty, disconnected, unavailable and stopped browsing without implicit launch', async () => {
		scenario = (input) => (input.includes('/workspaces/') ? json(describeBody) : json(listing([])));
		await open();
		await ready('No workspace files yet.');
		expect(calls.every((call) => call.init?.method !== 'POST')).toBe(true);
		await unmount(component!);
		component = undefined;
		ocuWorkspaces.set({});
		scenario = () =>
			json({
				...describeBody,
				status: 'unavailable',
				reason: 'ocu_unreachable',
				capabilities: ['prefs']
			});
		await open();
		await ready('Workspace service is unreachable');
		await click('Reconnect');
		await ready('Workspace service is unreachable');
		expect(calls.every((call) => call.init?.method !== 'POST')).toBe(true);
		await unmount(component!);
		component = undefined;
		ocuWorkspaces.set({});
		scenario = () =>
			json({
				...describeBody,
				status: 'unavailable',
				reason: 'never_created',
				capabilities: ['prefs']
			});
		await open();
		await ready('created by the first tool call');
		expect(document.body.textContent).not.toContain('Launch');
		await unmount(component!);
		component = undefined;
		ocuWorkspaces.set({});
		let running = false;
		scenario = (input, init) => {
			if (input.endsWith('/launch') && init?.method === 'POST') {
				running = true;
				return json({ state: 'running' });
			}
			if (input.includes('/workspaces/'))
				return json({
					...describeBody,
					status: running ? 'running' : 'stopped',
					capabilities: running ? ['refresh', 'prefs'] : ['launch', 'refresh', 'prefs']
				});
			return json(listing([file('page.html')]));
		};
		await open();
		await ready('Workspace is stopped; saved files remain available');
		await click('Launch');
		expect(calls.some((call) => call.url.endsWith('/launch') && call.init?.method === 'POST')).toBe(
			true
		);
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].status).toBe('running'));
		expect(document.body.textContent).not.toContain('Workspace is stopped');
		expect(document.body.textContent).toContain('page.html');
	});
	it('treats inaccessible listings as errors, and offers a truthful download for unrenderable files', async () => {
		let inaccessible = true;
		const binary: WorkspaceFile = {
			...file('archive.bin'),
			type: 'binary',
			mime: 'application/octet-stream'
		};
		scenario = (input) =>
			input.includes('/workspaces/')
				? json(describeBody)
				: inaccessible
					? json({ reason: 'inaccessible' }, 503)
					: json(listing([binary]));
		await open();
		await ready('Workspace files could not be loaded');
		expect(document.body.textContent).not.toContain('No workspace files yet.');
		inaccessible = false;
		await click('Retry');
		await ready('archive.bin');
		await click('archive.bin');
		await ready('Preview not supported for this file type');
		expect(document.querySelector('a[download="archive.bin"]')?.getAttribute('href')).toBe(
			`${url}archive.bin?download=1`
		);
		expect(document.querySelector('iframe')).toBeNull();
	});
	it('embeds code-classified XML and XHTML under the opaque policy', async () => {
		const xml = { ...file('data.xml'), type: 'code', mime: 'application/xml' };
		const xhtml = { ...file('page.xhtml'), type: 'code', mime: 'application/xhtml+xml' };
		scenario = (input) =>
			input.includes('/workspaces/') ? json(describeBody) : json(listing([xml, xhtml]));
		await open();
		await ready('data.xml');
		await click('data.xml');
		expect(document.querySelector('iframe[title="data.xml"]')?.getAttribute('sandbox')).toBe(
			'allow-scripts allow-forms'
		);
		await click('page.xhtml');
		expect(document.querySelector('iframe[title="page.xhtml"]')?.getAttribute('sandbox')).toBe(
			'allow-scripts allow-forms'
		);
	});

	it('discovers stopped status before refresh and keeps Launch after a listing error', async () => {
		let stopped = false;
		let listingFails = false;
		scenario = (input, init) => {
			if (input.endsWith('/launch') && init?.method === 'POST') {
				stopped = false;
				return json({ state: 'running' });
			}
			if (input.endsWith('/refresh') && init?.method === 'POST') return json({ revision: 2 });
			if (input.includes('/workspaces/'))
				return json({
					...describeBody,
					status: stopped ? 'stopped' : 'running',
					capabilities: stopped ? ['launch', 'refresh', 'prefs'] : ['refresh', 'prefs']
				});
			return listingFails
				? json({ reason: 'inaccessible' }, 503)
				: json(listing([file('page.html')]));
		};
		await open();
		await ready('page.html');
		stopped = true;
		listingFails = true;
		await click('Refresh workspace files');
		await ready('Refresh failed; existing files remain available');
		expect(get(ocuWorkspaces)[chat].status).toBe('stopped');
		expect(document.body.textContent).toContain('page.html');
		await click('Launch');
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].status).toBe('running'));
		expect(calls.filter((call) => call.url.endsWith('/launch'))).toHaveLength(1);
	});

	it('starts no follow-up work when launch or refresh finishes after unmount', async () => {
		let delayed: 'launch' | 'refresh' | '' = '';
		let finish: (response: Response) => void = () => {};
		scenario = (input, init) => {
			if (init?.method === 'POST' && delayed && input.endsWith(`/${delayed}`))
				return new Promise<Response>((resolve) => {
					finish = resolve;
				});
			if (input.includes('/workspaces/'))
				return json({
					...describeBody,
					status: 'stopped',
					capabilities: ['launch', 'refresh', 'prefs']
				});
			return json(listing([file('page.html')]));
		};
		await open();
		await ready('Workspace is stopped');
		delayed = 'launch';
		await click('Launch');
		await vi.waitFor(() => expect(calls.some((call) => call.url.endsWith('/launch'))).toBe(true));
		const beforeLaunch = calls.length;
		await unmount(component!);
		component = undefined;
		controller.retire();
		boundChat = null;
		finish(json({ state: 'running' }));
		await tick();
		expect(calls).toHaveLength(beforeLaunch);
		delayed = '';
		await open();
		await vi.waitFor(() => {
			expect(calls.filter((call) => call.url.includes('/api/outputs/'))).toHaveLength(2);
			const refresh = [...document.querySelectorAll('button')].find(
				(button) => button.getAttribute('aria-label') === 'Refresh workspace files'
			);
			expect(refresh?.disabled).toBe(false);
		});
		delayed = 'refresh';
		await click('Refresh workspace files');
		await vi.waitFor(() =>
			expect(calls.filter((call) => call.url.endsWith('/refresh'))).toHaveLength(1)
		);
		const beforeRefresh = calls.length;
		await unmount(component!);
		component = undefined;
		controller.retire();
		boundChat = null;
		finish(json({ revision: 2 }));
		await tick();
		expect(calls).toHaveLength(beforeRefresh);
	});

	it('preserves the selected identity across rename, clears only complete tombstones and retains failed data', async () => {
		let state: 'initial' | 'renamed' | 'partial' | 'deleted' = 'initial';
		const old = file('report.html', 'stable-id');
		const renamed = file('final.html', 'stable-id', 2);
		scenario = (input, init) => {
			if (input.endsWith('/prefs') && init?.method === 'PUT')
				return json({ prefs: JSON.parse(String(init.body)) });
			if (input.includes('/workspaces/')) return json(describeBody);
			if (state === 'initial') return json(listing([old, file('page.html')]));
			if (state === 'renamed') return json(listing([renamed, file('page.html')], null, 2));
			if (state === 'partial')
				return input.includes('cursor=next')
					? json({ reason: 'unavailable' }, 503)
					: json(listing([file('page.html')], 'next', 3));
			return json(listing([file('page.html')], null, 4));
		};
		await open();
		await ready('report.html');
		await click('report.html');
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('stable-id'));
		state = 'renamed';
		await click('Refresh workspace files');
		await ready('final.html');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('stable-id');
		expect(
			document.querySelectorAll('ul[aria-label="Workspace file list"] button[aria-pressed="true"]')
		).toHaveLength(1);
		state = 'partial';
		await click('Refresh workspace files');
		await ready('Refresh failed; existing files remain available');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('stable-id');
		expect(get(ocuWorkspaces)[chat].files[0].path).toBe('final.html');
		expect(
			calls.filter(
				(call) =>
					call.url.endsWith('/prefs') &&
					JSON.parse(String(call.init?.body)).selected_file_id === null
			)
		).toHaveLength(0);
		state = 'deleted';
		await click('Refresh workspace files');
		await ready('Selected file was removed');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
		const cleared = calls.filter(
			(call) =>
				call.url.endsWith('/prefs') && JSON.parse(String(call.init?.body)).selected_file_id === null
		);
		expect(cleared).toHaveLength(1);
		expect(JSON.parse(String(cleared[0].init?.body))).toEqual({
			view: 'files',
			open: true,
			selected_file_id: null
		});
	});

	it('does not clear a newer selection when an older refresh completes', async () => {
		let delayed = false;
		let finish: (response: Response) => void = () => {};
		scenario = (input, init) => {
			if (input.endsWith('/prefs') && init?.method === 'PUT')
				return json({ prefs: JSON.parse(String(init.body)) });
			if (input.includes('/workspaces/')) return json(describeBody);
			if (delayed)
				return new Promise<Response>((resolve) => {
					finish = resolve;
				});
			return json(listing([file('first.html'), file('second.html')]));
		};
		await open();
		await ready('second.html');
		await click('first.html');
		delayed = true;
		await click('Refresh workspace files');
		await vi.waitFor(() =>
			expect(calls.filter((call) => call.url.includes('/api/outputs/'))).toHaveLength(2)
		);
		await click('second.html');
		finish(json(listing([file('first.html')], null, 2)));
		await ready('Selection changed during refresh');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('second.html');
		expect(get(ocuWorkspaces)[chat].files.map((entry) => entry.path)).toEqual([
			'first.html',
			'second.html'
		]);
		expect(
			calls.filter(
				(call) =>
					call.url.endsWith('/prefs') &&
					JSON.parse(String(call.init?.body)).selected_file_id === null
			)
		).toHaveLength(0);
	});

	it('keeps the tombstone visible when clearing its saved preference fails', async () => {
		let removed = false;
		scenario = (input, init) => {
			if (input.endsWith('/prefs') && init?.method === 'PUT')
				return JSON.parse(String(init.body)).selected_file_id === null
					? json({ reason: 'ocu_upstream_error' }, 502)
					: json({ prefs: JSON.parse(String(init.body)) });
			if (input.includes('/workspaces/')) return json(describeBody);
			return json(listing(removed ? [] : [file('report.html')], null, removed ? 2 : 1));
		};
		await open();
		await ready('report.html');
		await click('report.html');
		removed = true;
		await click('Refresh workspace files');
		await ready('Selected file was removed; preference could not be cleared');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
		expect(document.body.textContent).toContain('No workspace files yet.');
	});

	it('appends a coherent second page and keeps loaded rows when the next page fails', async () => {
		let failure = false;
		scenario = (input) =>
			input.includes('/workspaces/')
				? json(describeBody)
				: input.includes('cursor=second')
					? failure
						? json({ reason: 'error' }, 503)
						: json(listing([file('last.html')], null, 1, 2))
					: json(listing([file('first.html')], 'second'));
		await open();
		await ready('More files');
		await click('More files');
		await ready('last.html');
		expect(get(ocuWorkspaces)[chat].files.map((entry) => entry.path)).toEqual([
			'first.html',
			'last.html'
		]);
		failure = true;
		await click('Refresh workspace files');
		await ready('Refresh failed; existing files remain available');
		expect(get(ocuWorkspaces)[chat].files.map((entry) => entry.path)).toEqual([
			'first.html',
			'last.html'
		]);
	});

	it('restarts a stale cursor once and reconstructs the loaded window at one revision', async () => {
		let stale = true;
		let revision = 1;
		scenario = (input) => {
			if (input.includes('/workspaces/')) return json(describeBody);
			if (input.includes('cursor=second')) {
				if (stale) {
					stale = false;
					revision = 2;
					return json({ reason: 'stale_cursor' }, 409);
				}
				return json(listing([file('last.html', 'last', revision)], null, revision, 2));
			}
			return json(listing([file('first.html', 'first', revision)], 'second', revision));
		};
		await open();
		await ready('More files');
		await click('More files');
		await ready('last.html');
		expect(get(ocuWorkspaces)[chat].files.map((entry) => entry.path)).toEqual([
			'first.html',
			'last.html'
		]);
		expect(get(ocuWorkspaces)[chat].listingRevision).toBe(2);
		expect(calls.filter((call) => call.url.includes('cursor=second'))).toHaveLength(2);
	});

	it('accepts only current trusted Office frame messages and retires timed-out frames', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([file('valid.docx')]));
		await open();
		await ready('valid.docx');
		vi.useFakeTimers();
		await click('valid.docx');
		await tick();
		expect(document.body.textContent).toContain('Connecting Office preview');
		const frame = document.querySelector(
			'iframe[title="Office preview: valid.docx"]'
		) as HTMLIFrameElement;
		expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
		expect(document.querySelector('a[download="valid.docx"]')?.getAttribute('href')).toBe(
			`${url}valid.docx?download=1`
		);
		const sent = vi.spyOn(frame.contentWindow!, 'postMessage');
		const dispatch = (
			data: object,
			source: MessageEventSource | null = frame.contentWindow,
			origin = window.location.origin
		) => window.dispatchEvent(new MessageEvent('message', { data, source, origin }));
		dispatch({ type: 'ocu:preview-ready', chat_id: chat }, window);
		dispatch({ type: 'ocu:preview-ready', chat_id: 'other-chat' });
		dispatch({ type: 'ocu:preview-ready', chat_id: chat, extra: true });
		dispatch(
			{ type: 'ocu:preview-ready', chat_id: chat },
			frame.contentWindow,
			'https://wrong.example'
		);
		expect(sent).not.toHaveBeenCalled();
		dispatch({ type: 'ocu:preview-ready', chat_id: chat });
		expect(sent).toHaveBeenCalledTimes(1);
		expect(sent.mock.calls[0][0]).toMatchObject({
			type: 'ocu:preview-select',
			chat_id: chat,
			file_id: 'valid.docx'
		});
		const selection = sent.mock.calls[0][0];
		expect(
			selection &&
				typeof selection === 'object' &&
				'generation' in selection &&
				Number.isSafeInteger(selection.generation)
		).toBe(true);
		const generation =
			selection && typeof selection === 'object' && 'generation' in selection
				? Number(selection.generation)
				: -1;
		dispatch({
			type: 'ocu:preview-state',
			chat_id: chat,
			file_id: 'valid.docx',
			generation: generation - 1,
			state: 'ready'
		});
		dispatch({
			type: 'ocu:preview-state',
			chat_id: 'other-chat',
			file_id: 'valid.docx',
			generation,
			state: 'ready'
		});
		dispatch({
			type: 'ocu:preview-state',
			chat_id: chat,
			file_id: 'valid.docx',
			generation,
			state: 'ready',
			extra: true
		});
		await tick();
		expect(document.body.textContent).toContain('Rendering Office file');
		vi.advanceTimersByTime(30_000);
		await tick();
		expect(document.body.textContent).toContain('Office preview timed out');
		expect(document.querySelector('iframe[title="Office preview: valid.docx"]')).toBeNull();
		dispatch({
			type: 'ocu:preview-state',
			chat_id: chat,
			file_id: 'valid.docx',
			generation,
			state: 'ready'
		});
		expect(document.body.textContent).toContain('Office preview timed out');
		vi.useRealTimers();
		await click('Retry Office preview');
		await ready('Connecting Office preview');
		expect(document.querySelector('iframe[title="Office preview: valid.docx"]')).not.toBe(frame);
	});

	it('retires an Office frame when ready never arrives and requires a fresh handshake', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([file('valid.docx')]));
		await open();
		await ready('valid.docx');
		vi.useFakeTimers();
		await click('valid.docx');
		await tick();
		expect(document.body.textContent).toContain('Connecting Office preview');
		const retired = document.querySelector('iframe[title="Office preview: valid.docx"]');
		vi.advanceTimersByTime(10_000);
		await tick();
		expect(document.body.textContent).toContain('Office preview did not become ready');
		expect(document.querySelector('iframe[title="Office preview: valid.docx"]')).toBeNull();
		expect(document.querySelector('a[download="valid.docx"]')).not.toBeNull();
		vi.useRealTimers();
		await click('Retry Office preview');
		await ready('Connecting Office preview');
		expect(document.querySelector('iframe[title="Office preview: valid.docx"]')).not.toBe(retired);
	});

	it('shows a current Office render error with a parent download and accepts fresh success only', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([file('valid.docx'), file('page.html')]));
		await open();
		await ready('valid.docx');
		await click('valid.docx');
		await ready('Connecting Office preview');
		const old = document.querySelector(
			'iframe[title="Office preview: valid.docx"]'
		) as HTMLIFrameElement;
		const oldSource = old.contentWindow!;
		const send = vi.spyOn(oldSource, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: oldSource,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		const command = send.mock.calls[0][0];
		const generation =
			command && typeof command === 'object' && 'generation' in command
				? Number(command.generation)
				: -1;
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: oldSource,
				data: {
					type: 'ocu:preview-state',
					chat_id: chat,
					file_id: 'valid.docx',
					generation,
					state: 'error'
				}
			})
		);
		await ready('Office preview error');
		expect(document.querySelector('a[download="valid.docx"]')?.getAttribute('href')).toBe(
			`${url}valid.docx?download=1`
		);
		await click('Retry Office preview');
		await ready('Connecting Office preview');
		const fresh = document.querySelector(
			'iframe[title="Office preview: valid.docx"]'
		) as HTMLIFrameElement;
		expect(fresh).not.toBe(old);
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: oldSource,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		expect(document.body.textContent).toContain('Connecting Office preview');
		const freshSend = vi.spyOn(fresh.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: fresh.contentWindow,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		const selection = freshSend.mock.calls[0][0];
		const current =
			selection && typeof selection === 'object' && 'generation' in selection
				? Number(selection.generation)
				: -1;
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: fresh.contentWindow,
				data: {
					type: 'ocu:preview-state',
					chat_id: chat,
					file_id: 'valid.docx',
					generation: current,
					state: 'ready'
				}
			})
		);
		await tick();
		expect(document.body.textContent).not.toContain('Office preview error');
		await click('page.html');
		expect(document.querySelector('iframe[title="Office preview: valid.docx"]')).toBeNull();
	});

	it('replaces the Office frame on selected revision change and rejects the retired result', async () => {
		let revision = 1;
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([file('valid.docx', 'stable-office-id', revision)], null, revision));
		await open();
		await ready('valid.docx');
		await click('valid.docx');
		await ready('Connecting Office preview');
		const old = document.querySelector(
			'iframe[title="Office preview: valid.docx"]'
		) as HTMLIFrameElement;
		const oldSource = old.contentWindow!;
		const oldSend = vi.spyOn(oldSource, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: oldSource,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		const oldCommand = oldSend.mock.calls[0][0];
		const oldGeneration =
			oldCommand && typeof oldCommand === 'object' && 'generation' in oldCommand
				? Number(oldCommand.generation)
				: -1;
		revision = 2;
		await click('Refresh workspace files');
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].files[0].revision).toBe(2));
		const fresh = document.querySelector(
			'iframe[title="Office preview: valid.docx"]'
		) as HTMLIFrameElement;
		expect(fresh).not.toBe(old);
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: oldSource,
				data: {
					type: 'ocu:preview-state',
					chat_id: chat,
					file_id: 'stable-office-id',
					generation: oldGeneration,
					state: 'error'
				}
			})
		);
		expect(document.body.textContent).not.toContain('Office preview error');
		const freshSend = vi.spyOn(fresh.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: fresh.contentWindow,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		const command = freshSend.mock.calls[0][0];
		const freshGeneration =
			command && typeof command === 'object' && 'generation' in command
				? Number(command.generation)
				: -1;
		expect(freshGeneration).toBeGreaterThan(oldGeneration);
	});
	it('sends remounted tombstone prefs after the prior panel write completes', async () => {
		let deleted = false;
		let finishOld: (response: Response) => void = () => {};
		const persisted: Array<string | null> = [];
		scenario = (input, init) => {
			if (input.endsWith('/prefs') && init?.method === 'PUT') {
				const selected = JSON.parse(String(init.body)).selected_file_id;
				if (selected === 'report.html')
					return new Promise<Response>((resolve) => {
						finishOld = resolve;
					});
				persisted.push(selected);
				return json({ prefs: JSON.parse(String(init.body)) });
			}
			if (input.includes('/workspaces/')) return json(describeBody);
			return json(listing(deleted ? [] : [file('report.html')], null, deleted ? 2 : 1));
		};
		await open();
		await ready('report.html');
		await click('report.html');
		await vi.waitFor(() =>
			expect(calls.filter((call) => call.url.endsWith('/prefs'))).toHaveLength(1)
		);
		await unmount(component!);
		component = undefined;
		deleted = true;
		await open();
		await ready('Selected file was removed');
		expect(calls.filter((call) => call.url.endsWith('/prefs'))).toHaveLength(1);
		finishOld(json({ prefs: { selected_file_id: 'report.html' } }));
		await vi.waitFor(() => expect(persisted).toEqual([null]));
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
	});

	it('drops a late describe after the panel unmounts and rejects arbitrary file URLs', async () => {
		let answer: (response: Response) => void = () => {};
		scenario = (input) =>
			input.includes('/workspaces/')
				? new Promise<Response>((resolve) => {
						answer = resolve;
					})
				: json(listing([file('page.html')]));
		await open();
		await unmount(component!);
		component = undefined;
		controller.retire();
		boundChat = null;
		answer(json(describeBody));
		await tick();
		expect(get(ocuWorkspaces)[chat]?.status).toBeUndefined();
		expect(calls).toHaveLength(1);
		expect(() =>
			workspaceFileUrl('/ocu', chat, { ...file('page.html'), url: 'https://attacker.example/' })
		).toThrow();
		expect(() =>
			workspaceFileUrl('/ocu', chat, { ...file('../page.html'), url: `${url}../page.html` })
		).toThrow();
		expect(() => workspaceFileUrl('https://attacker.example', chat, file('page.html'))).toThrow();
	});
});
