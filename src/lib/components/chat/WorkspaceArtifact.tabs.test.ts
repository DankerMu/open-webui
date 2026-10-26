// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { ocuWorkspaces } from '$lib/stores/ocu';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import {
	chat,
	describeBody,
	file,
	i18n,
	json,
	listing
} from '../../../../test/ocu-workspace-fixtures';
import {
	createWorkspaceReconciliation,
	WORKSPACE_RECONCILIATION,
	type WorkspaceReconciliation
} from './workspace-reconciliation';
import type { WorkspaceFile } from '$lib/apis/ocu';

let component: Record<string, unknown> | undefined;
let calls: Array<{ url: string; init?: RequestInit }>;
let served: WorkspaceFile[];
let revision: number;
let describeExtra: Record<string, unknown>;
let prefsStatus: number;
let controller: WorkspaceReconciliation;
let detachController: () => void;

const first = file('first.html');
const second = file('second.html');
const third = file('third.html');

async function open() {
	component = mount(WorkspaceArtifact, {
		target: document.body,
		props: { chatId: chat, enabled: true, onClose: vi.fn() },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, controller]
		])
	});
	controller.observe(chat, true);
	await vi.waitFor(() => expect(document.body.textContent).toContain('first.html'));
}

const list = () => document.querySelector('ul[aria-label="Workspace file list"]') as HTMLElement;
function row(name: string) {
	const found = [...list().querySelectorAll('button')].find(
		(node) => node.getAttribute('aria-label') === name
	);
	expect(found, name).toBeDefined();
	return found as HTMLButtonElement;
}
function control(name: string) {
	return [...document.querySelectorAll('button')].find(
		(node) => node.getAttribute('aria-label') === name || node.textContent?.trim() === name
	) as HTMLButtonElement | undefined;
}
const tablist = () => document.querySelector('[role="tablist"][aria-label="Open files"]');
const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const tabNames = () => tabs().map((node) => node.textContent?.trim());
const activeTab = () =>
	tabs()
		.find((node) => node.getAttribute('aria-selected') === 'true')
		?.textContent?.trim();
const tab = (name: string) => tabs().find((node) => node.textContent?.trim() === name)!;
const closeTab = (name: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('button')].find(
		(node) =>
			node.getAttribute('aria-label') === 'Close tab' &&
			node.getAttribute('aria-describedby') === tab(name).id
	)!;
const separator = () => document.querySelector('[role="separator"][aria-label="Resize file tree"]');
const treeColumn = () => list().parentElement as HTMLElement;
const selectedRegion = () => document.querySelector('[aria-label="Selected workspace file"]');
const prefsWrites = () =>
	calls
		.filter((call) => call.url.endsWith('/prefs') && call.init?.method === 'PUT')
		.map((call) => JSON.parse(String(call.init!.body)));

beforeEach(() => {
	ocuWorkspaces.set({});
	document.body.replaceChildren();
	localStorage.setItem('token', 'fixture-session');
	calls = [];
	served = [first, second, third];
	revision = 1;
	describeExtra = {};
	prefsStatus = 200;
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, init });
			if (url.endsWith('/prefs') && init?.method === 'PUT')
				return Promise.resolve(
					prefsStatus === 200
						? json({ prefs: JSON.parse(String(init.body)) })
						: json({ reason: 'ocu_upstream_error' }, prefsStatus)
				);
			if (url.includes('/workspaces/'))
				return Promise.resolve(json({ ...describeBody, revision, ...describeExtra }));
			return Promise.resolve(json(listing(served, null, revision)));
		})
	);
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
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

async function openTabs(...names: string[]) {
	for (const name of names) {
		row(name).click();
		await vi.waitFor(() => expect(activeTab()).toBe(name));
	}
	await vi.waitFor(() =>
		expect(prefsWrites().at(-1)?.selected_file_id).toBe(names[names.length - 1])
	);
}

describe('opened files beside the tree', () => {
	it('shows only the full-width tree while no file is open', async () => {
		await open();
		expect(tablist()).toBeNull();
		expect(separator()).toBeNull();
		expect(selectedRegion()).toBeNull();
		expect(control('Hide file tree')).toBeUndefined();
		expect(treeColumn().hidden).toBe(false);
		expect(list().className).toMatch(/flex-1/);
		expect(list().className).not.toMatch(/max-h-\[40%\]/);
	});

	it('splits on the first click, adds and activates tabs, and switches back by tab', async () => {
		await open();
		await openTabs('first.html');
		expect(tablist()).not.toBeNull();
		expect(separator()).not.toBeNull();
		expect(tabNames()).toEqual(['first.html']);
		expect(selectedRegion()?.textContent).toContain('first.html');
		// jsdom gives the row no width: the separator reports the 100 px bound, the column keeps 220 px.
		expect(separator()?.getAttribute('aria-valuemax')).toBe('100');
		expect(separator()?.getAttribute('aria-valuenow')).toBe('100');
		expect(treeColumn().style.flex).toBe('0 0 220px');
		expect(treeColumn().style.maxWidth).toBe('calc(100% - 200px)');
		expect(treeColumn().style.minWidth).toBe('100px');
		// jsdom lays out nothing, so the clamp falls to the 100 px tree minimum.
		separator()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await tick();
		expect(separator()?.getAttribute('aria-valuenow')).toBe('100');
		expect(treeColumn().style.flex).toBe('0 0 100px');
		await openTabs('second.html');
		expect(tabNames()).toEqual(['first.html', 'second.html']);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('second.html');
		const writes = prefsWrites().length;
		tab('first.html').click();
		await vi.waitFor(() => expect(activeTab()).toBe('first.html'));
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('first.html');
		await vi.waitFor(() => expect(prefsWrites()).toHaveLength(writes + 1));
		expect(prefsWrites().at(-1)).toMatchObject({
			view: 'files',
			open: true,
			selected_file_id: 'first.html'
		});
		expect(selectedRegion()?.querySelector('iframe[title="first.html"]')).not.toBeNull();
		expect(document.querySelector('iframe[title="second.html"]')).toBeNull();
		row('second.html').click();
		await vi.waitFor(() => expect(activeTab()).toBe('second.html'));
		expect(tabNames()).toEqual(['first.html', 'second.html']);
	});

	it('closes an inactive tab without a request or a selection change', async () => {
		await open();
		await openTabs('first.html', 'second.html');
		const requests = calls.length;
		closeTab('first.html').click();
		await tick();
		expect(tabNames()).toEqual(['second.html']);
		expect(activeTab()).toBe('second.html');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('second.html');
		expect(calls).toHaveLength(requests);
	});

	it('activates the right neighbour, then the left one, and clears the selection after the last', async () => {
		await open();
		await openTabs('first.html', 'second.html', 'third.html');
		tab('second.html').click();
		await vi.waitFor(() => expect(activeTab()).toBe('second.html'));
		closeTab('second.html').click();
		await vi.waitFor(() => expect(activeTab()).toBe('third.html'));
		expect(tabNames()).toEqual(['first.html', 'third.html']);
		await vi.waitFor(() => expect(prefsWrites().at(-1)?.selected_file_id).toBe('third.html'));
		closeTab('third.html').click();
		await vi.waitFor(() => expect(activeTab()).toBe('first.html'));
		await vi.waitFor(() => expect(prefsWrites().at(-1)?.selected_file_id).toBe('first.html'));
		const writes = prefsWrites().length;
		closeTab('first.html').click();
		await vi.waitFor(() => expect(tablist()).toBeNull());
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
		await vi.waitFor(() => expect(prefsWrites()).toHaveLength(writes + 1));
		expect(prefsWrites().at(-1)).toMatchObject({
			view: 'files',
			open: true,
			selected_file_id: null
		});
		expect(separator()).toBeNull();
		expect(selectedRegion()).toBeNull();
		expect(treeColumn().hidden).toBe(false);
	});

	it('reports a failed preference write when the last close clears the selection', async () => {
		await open();
		await openTabs('first.html');
		prefsStatus = 502;
		closeTab('first.html').click();
		await vi.waitFor(() =>
			expect(document.body.textContent).toContain('Selection could not be saved')
		);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
	});

	it('keeps the same tree element across the first open, hiding and the last close', async () => {
		await open();
		const column = treeColumn();
		const tree = list();
		const focused = row('third.html');
		focused.focus();
		await openTabs('first.html');
		expect(list()).toBe(tree);
		expect(treeColumn()).toBe(column);
		expect(column.id).not.toBe('');
		const toggle = control('Hide file tree')!;
		expect(toggle.getAttribute('aria-controls')).toBe(column.id);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		toggle.click();
		await tick();
		expect(column.hidden).toBe(true);
		expect(column.isConnected).toBe(true);
		expect(separator()).toBeNull();
		expect(tabNames()).toEqual(['first.html']);
		expect(control('Show file tree')?.getAttribute('aria-expanded')).toBe('false');
		control('Show file tree')!.click();
		await tick();
		expect(column.hidden).toBe(false);
		expect(separator()).not.toBeNull();
		expect(list()).toBe(tree);
		closeTab('first.html').click();
		await vi.waitFor(() => expect(tablist()).toBeNull());
		expect(list()).toBe(tree);
		expect(treeColumn()).toBe(column);
		expect(row('third.html')).toBe(focused);
		expect(document.activeElement).toBe(focused);
	});

	it('shows the tree again when the last tab closes while it is hidden', async () => {
		await open();
		await openTabs('first.html');
		control('Hide file tree')!.click();
		await tick();
		expect(treeColumn().hidden).toBe(true);
		closeTab('first.html').click();
		await vi.waitFor(() => expect(tablist()).toBeNull());
		expect(treeColumn().hidden).toBe(false);
		await openTabs('second.html');
		expect(treeColumn().hidden).toBe(false);
		expect(control('Hide file tree')).toBeDefined();
	});

	it('shows a restored selection as the active tab', async () => {
		describeExtra = { prefs: { selected_file_id: 'second.html' } };
		await open();
		await vi.waitFor(() => expect(tabNames()).toEqual(['second.html']));
		expect(activeTab()).toBe('second.html');
		expect(prefsWrites()).toEqual([]);
	});

	it('gives Browser the whole area and keeps the tabs when returning to Files', async () => {
		describeExtra = { views: ['files', 'browser'] };
		await open();
		await openTabs('first.html', 'second.html');
		control('Browser')!.click();
		await vi.waitFor(() =>
			expect(document.querySelector('iframe[title="Workspace Browser"]')).not.toBeNull()
		);
		expect(document.querySelector('ul[aria-label="Workspace file list"]')).toBeNull();
		expect(tablist()).toBeNull();
		control('Files')!.click();
		await vi.waitFor(() => expect(tabNames()).toEqual(['first.html', 'second.html']));
		expect(activeTab()).toBe('second.html');
	});

	it('keeps other tabs inactive when reconciliation proves the active file deleted', async () => {
		await open();
		await openTabs('first.html', 'second.html');
		const writes = prefsWrites().length;
		served = [first, third];
		revision = 2;
		await controller.refresh();
		await vi.waitFor(() => expect(tabNames()).toEqual(['first.html']));
		expect(activeTab()).toBeUndefined();
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
		expect(selectedRegion()).toBeNull();
		const status = [...document.querySelectorAll('[role="status"]')].find(
			(node) => node.textContent?.trim() === 'No file selected'
		);
		expect(status).toBeDefined();
		await vi.waitFor(() => expect(prefsWrites()).toHaveLength(writes + 1));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(prefsWrites().slice(writes)).toEqual([
			expect.objectContaining({ selected_file_id: null })
		]);
		expect(get(ocuWorkspaces)[chat].notice).toBe('Selected file was removed');
	});
});
