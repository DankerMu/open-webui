// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { ocuWorkspaces } from '$lib/stores/ocu';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import {
	chat,
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

let component: Record<string, unknown>;
let controller: WorkspaceReconciliation;
let detach: () => void;
let scenario: (url: string, init?: RequestInit) => Response | Promise<Response>;
let calls: Array<{ url: string; init?: RequestInit }>;
const close = vi.fn();
function button(name: string) {
	const found = [...document.querySelectorAll('button')].find(
		(node) => node.getAttribute('aria-label') === name || node.textContent?.trim() === name
	);
	expect(found, name).toBeDefined();
	return found!;
}
async function open(text: string) {
	component = mount(WorkspaceArtifact, {
		target: document.body,
		props: { chatId: chat, enabled: true, onClose: close },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, controller]
		])
	});
	controller.observe(chat, true);
	await vi.waitFor(() => expect(document.body.textContent).toContain(text));
}
beforeEach(() => {
	ocuWorkspaces.set({});
	calls = [];
	close.mockClear();
	scenario = (url, init) =>
		url.endsWith('/prefs')
			? json({ prefs: JSON.parse(String(init?.body)) })
			: url.includes('/workspaces/')
				? json(describeBody)
				: json(listing([file('page.html')]));
	vi.stubGlobal(
		'fetch',
		vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
			calls.push({ url: String(url), init });
			return Promise.resolve(scenario(String(url), init));
		})
	);
	controller = createWorkspaceReconciliation({
		token: () => 'fixture-session',
		available: () => true,
		translate: (key, params) => get(i18n).t(key, params)
	});
	detach = controller.mount();
});
afterEach(async () => {
	if (component) await unmount(component);
	detach();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

it.each([
	[3, null, '3 files'],
	[100, 'next', '100+ files'],
	[0, null, null]
])('summarizes %i loaded files with cursor %s', async (count, cursor, summary) => {
	scenario = (url) =>
		url.includes('/workspaces/')
			? json(describeBody)
			: json(
					listing(
						Array.from({ length: Number(count) }, (_, index) => file(`file-${index}.html`)),
						cursor as string | null
					)
				);
	await open(count ? 'file-0.html' : 'No workspace files yet.');
	const header = document.querySelector('header')!;
	if (summary) expect(header.textContent).toContain(summary);
	else expect(header.querySelector('span')).toBeNull();
	button('Close workspace').click();
	expect(close).toHaveBeenCalledOnce();
});

it('disables refresh until the request finishes without changing its name', async () => {
	await open('page.html');
	const held = Promise.withResolvers<Response>();
	scenario = (url, init) =>
		url.endsWith('/refresh') && init?.method === 'POST'
			? held.promise
			: url.includes('/workspaces/')
				? json(describeBody)
				: json(listing([file('page.html')]));
	button('Refresh workspace files').click();
	await vi.waitFor(() => expect(button('Refresh workspace files').disabled).toBe(true));
	held.resolve(json({ revision: 1 }));
	await vi.waitFor(() => expect(button('Refresh workspace files').disabled).toBe(false));
});

it.each(['browser', 'terminal'] as const)(
	'preserves %s selection, availability and frame authority',
	async (view) => {
		let running = true;
		scenario = (url, init) =>
			url.endsWith('/prefs')
				? json({ prefs: JSON.parse(String(init?.body)) })
				: url.includes('/workspaces/')
					? json({
							...describeBody,
							status: running ? 'running' : 'stopped',
							views: ['files', view]
						})
					: json(listing([file('page.html')]));
		await open('page.html');
		const label = view === 'browser' ? 'Browser' : 'Terminal';
		expect(button('Files').getAttribute('aria-pressed')).toBe('true');
		expect(
			[...document.querySelectorAll('button')].some(
				(node) => node.textContent?.trim() === (view === 'browser' ? 'Terminal' : 'Browser')
			)
		).toBe(false);
		button(label).click();
		await tick();
		expect(button(label).getAttribute('aria-pressed')).toBe('true');
		const frame = document.querySelector(`iframe[title="Workspace ${label}"]`)!;
		expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
		expect(frame.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=${view}`);
		running = false;
		button('Refresh workspace files').click();
		await vi.waitFor(() => expect(button(label).disabled).toBe(true));
		expect(button('Files').disabled).toBe(false);
	}
);

it.each([
	['empty', 'No workspace files yet.', 'status', null],
	['unavailable', 'This workspace is created by the first tool call.', 'status', null],
	['disconnected', 'Workspace service is unreachable.', 'alert', 'Reconnect'],
	['error', 'Workspace files could not be loaded.', 'alert', 'Retry'],
	['stopped', 'Workspace is stopped; saved files remain available.', 'status', 'Launch']
])('preserves %s feedback and its action', async (state, text, role, action) => {
	scenario = (url) => {
		if (url.includes('/workspaces/'))
			return json({
				...describeBody,
				status:
					state === 'stopped'
						? 'stopped'
						: ['unavailable', 'disconnected'].includes(state!)
							? 'unavailable'
							: 'running',
				reason:
					state === 'unavailable'
						? 'never_created'
						: state === 'disconnected'
							? 'ocu_unreachable'
							: null,
				capabilities: state === 'stopped' ? ['launch', 'prefs'] : ['refresh', 'prefs']
			});
		return state === 'error' ? json({ reason: 'inaccessible' }, 503) : json(listing([]));
	};
	await open(text!);
	expect(
		[...document.querySelectorAll(`[role="${role}"]`)].some((node) =>
			node.textContent?.includes(text!)
		)
	).toBe(true);
	expect(calls.filter((call) => call.init?.method === 'POST')).toEqual([]);
	if (action) {
		const previous = calls.filter((call) =>
			call.url.endsWith(action === 'Launch' ? '/launch' : `/${chat}`)
		).length;
		button(action).click();
		await vi.waitFor(() =>
			expect(
				calls.filter((call) => call.url.endsWith(action === 'Launch' ? '/launch' : `/${chat}`))
					.length
			).toBe(previous + 1)
		);
	}
});

it('retains loading status and exposes selection-save failure as an alert', async () => {
	const held = Promise.withResolvers<Response>();
	scenario = () => held.promise;
	await open('Loading workspace files');
	expect(document.querySelector('[role="status"]')?.textContent).toContain(
		'Loading workspace files'
	);
	scenario = (url) =>
		url.endsWith('/prefs')
			? json({ reason: 'ocu_upstream_error' }, 502)
			: url.includes('/workspaces/')
				? json(describeBody)
				: json(listing([file('page.html')]));
	held.resolve(json(describeBody));
	await vi.waitFor(() => expect(document.body.textContent).toContain('page.html'));
	button('page.html').click();
	await vi.waitFor(() =>
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			'Selection could not be saved'
		)
	);
});
