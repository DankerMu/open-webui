// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { formatFileSize } from '$lib/utils';
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
import { workspaceFileKind } from './workspace-file-rows';
import type { WorkspaceFile } from '$lib/apis/ocu';

let component: Record<string, unknown> | undefined;
let calls: Array<{ url: string; init?: RequestInit }>;
let scenario: (input: string, init?: RequestInit) => Response | Promise<Response>;
let controller: WorkspaceReconciliation;
let detachController: () => void;
const close = vi.fn();

const nestedFiles = (id = chat): WorkspaceFile[] => [
	{
		...file('packages/core/src/index.py', 'packages-core-src-index.py'),
		url: `/ocu/files/${id}/packages/core/src/index.py`,
		type: 'code',
		mime: 'text/x-python',
		size: 2048
	},
	{
		...file('reports/summary.docx', 'reports-summary.docx'),
		url: `/ocu/files/${id}/reports/summary.docx`,
		type: 'docx',
		mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		size: 4096
	},
	{
		...file('reports/budget.xlsx', 'reports-budget.xlsx'),
		url: `/ocu/files/${id}/reports/budget.xlsx`,
		type: 'xlsx',
		mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		size: 512
	},
	{
		...file('deck.pptx', 'deck.pptx'),
		url: `/ocu/files/${id}/deck.pptx`,
		type: 'pptx',
		mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		size: 8192
	},
	{
		...file('photo.png', 'photo.png'),
		url: `/ocu/files/${id}/photo.png`,
		type: 'image',
		mime: 'image/png',
		size: 1024
	},
	{
		...file('page.html', 'page.html'),
		url: `/ocu/files/${id}/page.html`,
		type: 'html',
		mime: 'text/html',
		size: 256
	},
	{
		...file('notes.bin', 'notes.bin'),
		url: `/ocu/files/${id}/notes.bin`,
		type: 'binary',
		mime: 'application/octet-stream',
		size: 64
	}
];

async function open(id = chat) {
	component = mount(WorkspaceArtifact, {
		target: document.body,
		props: { chatId: id, enabled: true, onClose: close },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, controller]
		])
	});
	controller.observe(id, true);
	await vi.waitFor(() =>
		expect(document.body.querySelector('[aria-label="Workspace Files"]')).not.toBeNull()
	);
	return document.body;
}

async function ready(text: string) {
	await vi.waitFor(() => expect(document.body.textContent).toContain(text));
}

function namedButton(name: string) {
	const button = [...document.querySelectorAll('button')].find(
		(item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name
	);
	expect(button, name).toBeDefined();
	return button!;
}

function fileButton(name: string) {
	const list = document.querySelector('ul[aria-label="Workspace file list"]')!;
	const button = [...list.querySelectorAll('button')].find(
		(item) => item.getAttribute('aria-label') === name
	);
	expect(button, name).toBeDefined();
	return button as HTMLButtonElement;
}

function folderButton(path: string) {
	return namedButton(`Folder ${path}`);
}

function listItems() {
	return [...document.querySelectorAll('ul[aria-label="Workspace file list"] > li')];
}

beforeEach(() => {
	ocuWorkspaces.set({});
	document.body.replaceChildren();
	localStorage.setItem('token', 'fixture-session');
	calls = [];
	close.mockClear();
	scenario = (input, init) =>
		input.endsWith('/prefs') && init?.method === 'PUT'
			? json({ prefs: JSON.parse(String(init.body)) })
			: input.includes('/workspaces/')
				? json(describeBody)
				: json(listing(nestedFiles()));
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			calls.push({ url: String(input), init });
			return Promise.resolve(scenario(String(input), init));
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

describe('workspace file tree presentation', () => {
	it('renders full-path folder headers, indented nested rows and unindented roots', async () => {
		await open();
		await ready('index.py');
		const items = listItems();
		expect(items.map((item) => item.querySelector('button')?.getAttribute('aria-label'))).toEqual([
			'Folder packages/core/src',
			'packages/core/src/index.py',
			'Folder reports',
			'reports/budget.xlsx',
			'reports/summary.docx',
			'deck.pptx',
			'notes.bin',
			'page.html',
			'photo.png'
		]);
		expect(folderButton('packages/core/src').getAttribute('aria-expanded')).toBe('true');
		expect(folderButton('reports').getAttribute('aria-expanded')).toBe('true');
		expect(fileButton('packages/core/src/index.py').className).toMatch(/pl-7/);
		expect(fileButton('reports/summary.docx').className).toMatch(/pl-7/);
		expect(fileButton('page.html').className).not.toMatch(/pl-7/);
		expect(fileButton('page.html').textContent).toContain('page.html');
		expect(fileButton('packages/core/src/index.py').textContent).toContain('index.py');
		expect(fileButton('packages/core/src/index.py').textContent).not.toContain(
			'packages/core/src/index.py'
		);
	});

	it('renders a flat listing without folder headers', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([file('page.html'), file('diagram.svg')]));
		await open();
		await ready('page.html');
		expect(document.querySelector('[aria-label^="Folder "]')).toBeNull();
		expect(listItems()).toHaveLength(2);
		expect(fileButton('page.html').className).not.toMatch(/pl-7/);
		expect(fileButton('diagram.svg').className).not.toMatch(/pl-7/);
	});

	it('maps every display kind to a decorative icon and canonical size text', async () => {
		await open();
		await ready('index.py');
		const expected = {
			'packages/core/src/index.py': { kind: 'code', size: 2048 },
			'photo.png': { kind: 'image', size: 1024 },
			'reports/summary.docx': { kind: 'document', size: 4096 },
			'reports/budget.xlsx': { kind: 'sheet', size: 512 },
			'deck.pptx': { kind: 'slides', size: 8192 },
			'page.html': { kind: 'web', size: 256 },
			'notes.bin': { kind: 'other', size: 64 }
		};
		for (const [name, { kind, size }] of Object.entries(expected)) {
			const row = nestedFiles().find((entry) => (entry.name || entry.path) === name)!;
			expect(workspaceFileKind(row)).toBe(kind);
			const button = fileButton(name);
			expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
			expect(button.querySelector(`[data-file-kind="${kind}"]`)).not.toBeNull();
			expect(button.textContent).toContain(formatFileSize(size));
			expect(button.getAttribute('aria-label')).toBe(name);
			expect(button.querySelector('[data-file-size]')?.getAttribute('aria-hidden')).toBe('true');
		}
	});

	it('collapses and expands locally without requesting or changing selection', async () => {
		await open();
		await ready('summary.docx');
		await namedButton('reports/summary.docx').click();
		await vi.waitFor(() =>
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('reports-summary.docx')
		);
		await vi.waitFor(() =>
			expect(calls.some((call) => call.url.endsWith('/prefs') && call.init?.method === 'PUT')).toBe(
				true
			)
		);
		const before = calls.map((call) => `${call.init?.method ?? 'GET'} ${call.url}`);
		const reports = folderButton('reports');
		reports.click();
		await tick();
		expect(reports.getAttribute('aria-expanded')).toBe('false');
		expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(true);
		expect(fileButton('packages/core/src/index.py').closest('li')?.hidden).toBe(false);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('reports-summary.docx');
		expect(fileButton('reports/summary.docx').getAttribute('aria-pressed')).toBe('true');
		reports.click();
		await tick();
		expect(reports.getAttribute('aria-expanded')).toBe('true');
		expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(false);
		expect(calls.map((call) => `${call.init?.method ?? 'GET'} ${call.url}`)).toEqual(before);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('reports-summary.docx');
	});

	it('resets collapse after the panel unmounts or the chat changes', async () => {
		await open();
		await ready('summary.docx');
		folderButton('reports').click();
		await tick();
		expect(folderButton('reports').getAttribute('aria-expanded')).toBe('false');
		await unmount(component!);
		component = undefined;
		await open();
		await ready('summary.docx');
		expect(folderButton('reports').getAttribute('aria-expanded')).toBe('true');
		expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(false);
		await unmount(component!);
		component = undefined;
		ocuWorkspaces.set({});
		const other = 'other-owner-chat';
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json({ ...describeBody, chat_id: other })
					: json({ ...listing(nestedFiles(other)), chat_id: other });
		await open(other);
		await ready('summary.docx');
		expect(folderButton('reports').getAttribute('aria-expanded')).toBe('true');
	});

	it('keeps the selected style hook, aria-pressed and the existing Office re-click restart', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([file('valid.docx'), file('page.html')]));
		await open();
		await ready('valid.docx');
		await namedButton('valid.docx').click();
		await ready('Connecting Office preview');
		const selected = fileButton('valid.docx');
		expect(selected.getAttribute('aria-pressed')).toBe('true');
		expect(selected.className).toMatch(/bg-gray-100|font-medium/);
		expect(fileButton('page.html').getAttribute('aria-pressed')).toBe('false');
		const first = document.querySelector('iframe[title="Office preview: valid.docx"]');
		await namedButton('valid.docx').click();
		await tick();
		expect(document.querySelector('iframe[title="Office preview: valid.docx"]')).not.toBe(first);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('valid.docx');
	});

	it('keeps More files outside the list, present only with a cursor, and disabled while busy', async () => {
		let hold: (response: Response) => void = () => {};
		scenario = (input, init) => {
			if (input.endsWith('/prefs') && init?.method === 'PUT')
				return json({ prefs: JSON.parse(String(init.body)) });
			if (input.includes('/workspaces/')) return json(describeBody);
			if (input.includes('cursor=second'))
				return new Promise<Response>((resolve) => {
					hold = resolve;
				});
			return json(listing([file('first.html')], 'second'));
		};
		await open();
		await ready('More files');
		const list = document.querySelector('ul[aria-label="Workspace file list"]')!;
		const more = namedButton('More files');
		expect(list.contains(more)).toBe(false);
		expect(list.querySelectorAll('li')).toHaveLength(1);
		expect(more.className).toMatch(/text-gray-500|w-full/);
		more.click();
		await vi.waitFor(() => expect(more.disabled).toBe(true));
		hold(json(listing([file('last.html')], null, 1, 2)));
		await ready('last.html');
		expect(document.body.textContent).not.toContain('More files');
		expect(list.querySelectorAll('li')).toHaveLength(2);
	});

	it('caps the scrolling list near two fifths of the panel once a file is selected', async () => {
		await open();
		await ready('page.html');
		const list = document.querySelector('ul[aria-label="Workspace file list"]') as HTMLElement;
		expect(list.className).toMatch(/overflow-y-auto/);
		expect(list.className).toMatch(/flex-1|min-h-0/);
		expect(list.className).not.toMatch(/max-h-\[40%\]/);
		await namedButton('page.html').click();
		await tick();
		expect(list.className).toMatch(/max-h-\[40%\]/);
		expect(list.className).toMatch(/overflow-y-auto/);
	});
});
