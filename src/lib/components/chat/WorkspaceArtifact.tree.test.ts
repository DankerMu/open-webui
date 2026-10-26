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
	it('renders nested folder rows, depth-indented nested rows and unindented roots', async () => {
		await open();
		await ready('index.py');
		const items = listItems();
		expect(items.map((item) => item.querySelector('button')?.getAttribute('aria-label'))).toEqual([
			'Folder packages',
			'Folder packages/core',
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
		for (const path of ['packages', 'packages/core', 'packages/core/src', 'reports'])
			expect(folderButton(path).getAttribute('aria-expanded')).toBe('true');
		expect(folderButton('packages').style.paddingLeft).toBe('8px');
		expect(folderButton('packages/core').style.paddingLeft).toBe('20px');
		expect(folderButton('packages/core/src').style.paddingLeft).toBe('32px');
		expect(folderButton('packages/core/src').textContent?.trim()).toBe('src');
		expect(fileButton('packages/core/src/index.py').style.paddingLeft).toBe('44px');
		expect(fileButton('reports/summary.docx').style.paddingLeft).toBe('20px');
		expect(fileButton('page.html').style.paddingLeft).toBe('8px');
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
		expect(fileButton('page.html').style.paddingLeft).toBe('8px');
		expect(fileButton('diagram.svg').style.paddingLeft).toBe('8px');
	});

	it('maps every display kind to a decorative icon and shows no row size', async () => {
		await open();
		await ready('index.py');
		const expected: Record<string, { kind: string; size: string }> = {
			'packages/core/src/index.py': { kind: 'code', size: '2.0 KB' },
			'photo.png': { kind: 'image', size: '1.0 KB' },
			'reports/summary.docx': { kind: 'document', size: '4.0 KB' },
			'reports/budget.xlsx': { kind: 'sheet', size: '512.0 B' },
			'deck.pptx': { kind: 'slides', size: '8.0 KB' },
			'page.html': { kind: 'web', size: '256.0 B' },
			'notes.bin': { kind: 'other', size: '64.0 B' }
		};
		for (const [name, { kind, size }] of Object.entries(expected)) {
			const button = fileButton(name);
			expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
			expect(button.querySelector(`[data-file-kind="${kind}"]`)).not.toBeNull();
			expect(button.querySelector('[data-file-size]')).toBeNull();
			expect(button.textContent).not.toContain(size);
			expect(button.getAttribute('aria-label')).toBe(name);
			expect(button.getAttribute('title')).toBe(name);
			expect(button.textContent).toContain(name.split('/').pop());
		}
	});

	it('shows the nested directory and size of the selected file in the selected bar', async () => {
		await open();
		await ready('index.py');
		fileButton('packages/core/src/index.py').click();
		await tick();
		const bar = document.querySelector(
			'[aria-label="Selected workspace file"] [data-selected-bar]'
		);
		expect(bar?.querySelector('[data-selected-name]')?.textContent).toBe('index.py');
		expect(bar?.textContent).toContain('packages/core/src');
		expect(bar?.querySelector('[data-file-size]')?.textContent).toBe('2.0 KB');
	});

	it('updates the row glyph in place when a refresh changes the selected file kind', async () => {
		const targetId = '7d4d2678-83c0-42f2-95a1-f8cfb0ef9043';
		const reference: WorkspaceFile = {
			...file('reference.html', 'c2e6fe57-369b-4991-9d6b-f0bd848145f5'),
			type: 'html',
			mime: 'text/html',
			size: 256
		};
		let servedListing = listing([
			{ ...file('notes.txt', targetId), type: 'text', mime: 'text/plain', size: 256 },
			reference
		]);
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json({ ...describeBody, revision: servedListing.revision })
					: json(servedListing);

		await open();
		await ready('notes.txt');
		expect(document.querySelector('[aria-label^="Folder "]')).toBeNull();
		expect(
			listItems().map((item) => item.querySelector('button')?.getAttribute('aria-label'))
		).toEqual(['notes.txt', 'reference.html']);
		const initialRows = listItems();
		const target = fileButton('notes.txt');
		const control = fileButton('reference.html');
		target.click();
		await vi.waitFor(() => {
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe(targetId);
			expect(target.getAttribute('aria-pressed')).toBe('true');
		});
		expect(target.querySelector('[data-file-kind]')?.getAttribute('data-file-kind')).toBe(
			'document'
		);
		expect(control.querySelector('[data-file-kind]')?.getAttribute('data-file-kind')).toBe('web');
		const initialSvg = target.querySelector('[data-file-kind] svg');
		const controlSvg = control.querySelector('[data-file-kind] svg');
		expect(initialSvg).not.toBeNull();
		expect(controlSvg).not.toBeNull();
		const initialGlyph = initialSvg!.innerHTML;
		const controlGlyph = controlSvg!.innerHTML;
		expect(initialGlyph).not.toBe(controlGlyph);
		target.focus();
		expect(document.activeElement).toBe(target);

		servedListing = listing(
			[
				{ ...file('notes.html', targetId, 2), type: 'html', mime: 'text/html', size: 256 },
				reference
			],
			null,
			2
		);
		await controller.refresh();
		await vi.waitFor(() => {
			const refreshed = fileButton('notes.html');
			expect(refreshed.querySelector('[data-file-kind]')?.getAttribute('data-file-kind')).toBe(
				'web'
			);
			expect(refreshed.textContent).toContain('notes.html');
		});

		expect(fileButton('notes.html')).toBe(target);
		expect(target.getAttribute('aria-label')).toBe('notes.html');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe(targetId);
		expect(target.getAttribute('aria-pressed')).toBe('true');
		expect(document.activeElement).toBe(target);
		expect(fileButton('reference.html')).toBe(control);
		expect(control.getAttribute('aria-pressed')).toBe('false');
		expect(listItems()).toEqual(initialRows);
		expect(
			listItems().map((item) => item.querySelector('button')?.getAttribute('aria-label'))
		).toEqual(['notes.html', 'reference.html']);
		const refreshedSvg = target.querySelector('[data-file-kind] svg');
		const unchangedControlSvg = control.querySelector('[data-file-kind] svg');
		expect(refreshedSvg).not.toBeNull();
		expect(unchangedControlSvg).not.toBeNull();
		expect(unchangedControlSvg!.innerHTML).toBe(controlGlyph);
		expect(refreshedSvg!.innerHTML).toBe(unchangedControlSvg!.innerHTML);
		expect(refreshedSvg!.innerHTML).not.toBe(initialGlyph);
	});

	it.each(['constructor', 'toString', '__proto__'] as const)(
		'starts %s folders expanded and toggles them without hiding other rows',
		async (folder) => {
			const prototypeFile = file(`${folder}/readme.txt`, `${folder}-readme.txt`);
			const reportsFile = file('reports/summary.docx', 'reports-summary.docx');
			const packagesFile = file('packages/core/src/index.py', 'packages-core-src-index.py');
			const rootFile = file('page.html', 'page.html');
			scenario = (input, init) =>
				input.endsWith('/prefs') && init?.method === 'PUT'
					? json({ prefs: JSON.parse(String(init.body)) })
					: input.includes('/workspaces/')
						? json(describeBody)
						: json(listing([prototypeFile, reportsFile, packagesFile, rootFile]));
			await open();
			await ready('readme.txt');
			const header = folderButton(folder);
			expect(header.getAttribute('aria-expanded')).toBe('true');
			expect(fileButton(`${folder}/readme.txt`).closest('li')?.hidden).toBe(false);
			expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(false);
			expect(fileButton('packages/core/src/index.py').closest('li')?.hidden).toBe(false);
			expect(fileButton('page.html').closest('li')?.hidden).toBe(false);
			await namedButton('page.html').click();
			await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html'));
			await vi.waitFor(() =>
				expect(
					calls.some((call) => call.url.endsWith('/prefs') && call.init?.method === 'PUT')
				).toBe(true)
			);
			const before = calls.map((call) => `${call.init?.method ?? 'GET'} ${call.url}`);
			header.click();
			await tick();
			expect(header.getAttribute('aria-expanded')).toBe('false');
			expect(fileButton(`${folder}/readme.txt`).closest('li')?.hidden).toBe(true);
			expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(false);
			expect(fileButton('packages/core/src/index.py').closest('li')?.hidden).toBe(false);
			expect(fileButton('page.html').closest('li')?.hidden).toBe(false);
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html');
			header.click();
			await tick();
			expect(header.getAttribute('aria-expanded')).toBe('true');
			expect(fileButton(`${folder}/readme.txt`).closest('li')?.hidden).toBe(false);
			expect(calls.map((call) => `${call.init?.method ?? 'GET'} ${call.url}`)).toEqual(before);
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html');
			expect(fileButton('page.html').getAttribute('aria-pressed')).toBe('true');
		}
	);

	it('collapses only the owning multipart folder and leaves later roots visible', async () => {
		const nested = file('packages/core/src/index.py', 'packages-core-src-index.py');
		const reports = file('reports/summary.docx', 'reports-summary.docx');
		const root = file('page.html', 'page.html');
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([nested, reports, root]));
		await open();
		await ready('index.py');
		folderButton('packages/core/src').click();
		await tick();
		expect(folderButton('packages/core/src').getAttribute('aria-expanded')).toBe('false');
		expect(fileButton('packages/core/src/index.py').closest('li')?.hidden).toBe(true);
		expect(folderButton('reports').getAttribute('aria-expanded')).toBe('true');
		expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(false);
		expect(fileButton('page.html').closest('li')?.hidden).toBe(false);
		folderButton('reports').click();
		await tick();
		expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(true);
		expect(fileButton('page.html').closest('li')?.hidden).toBe(false);
	});

	it('collapsing an intermediate folder hides every deeper folder and file, not its prefix sibling', async () => {
		const deep = file('packages/core/src/index.py', 'packages-core-src-index.py');
		const mid = file('packages/core/readme.md', 'packages-core-readme.md');
		const top = file('packages/setup.py', 'packages-setup.py');
		const sibling = file('packages/core-extra/a.py', 'packages-core-extra-a.py');
		const root = file('page.html', 'page.html');
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([deep, mid, top, sibling, root]));
		await open();
		await ready('index.py');
		const before = calls.length;
		const core = folderButton('packages/core');
		core.click();
		await tick();
		expect(core.getAttribute('aria-expanded')).toBe('false');
		expect(core.closest('li')?.hidden).toBe(false);
		expect(folderButton('packages/core/src').closest('li')?.hidden).toBe(true);
		expect(fileButton('packages/core/src/index.py').closest('li')?.hidden).toBe(true);
		expect(fileButton('packages/core/readme.md').closest('li')?.hidden).toBe(true);
		expect(folderButton('packages').closest('li')?.hidden).toBe(false);
		expect(folderButton('packages/core-extra').closest('li')?.hidden).toBe(false);
		expect(fileButton('packages/core-extra/a.py').closest('li')?.hidden).toBe(false);
		expect(fileButton('packages/setup.py').closest('li')?.hidden).toBe(false);
		expect(fileButton('page.html').closest('li')?.hidden).toBe(false);
		folderButton('packages').click();
		await tick();
		expect(folderButton('packages/core-extra').closest('li')?.hidden).toBe(true);
		expect(fileButton('packages/setup.py').closest('li')?.hidden).toBe(true);
		expect(core.closest('li')?.hidden).toBe(true);
		folderButton('packages').click();
		await tick();
		expect(core.closest('li')?.hidden).toBe(false);
		expect(core.getAttribute('aria-expanded')).toBe('false');
		expect(fileButton('packages/core/src/index.py').closest('li')?.hidden).toBe(true);
		expect(calls.length).toBe(before);
	});

	it('keeps collapse while the open panel switches to Browser and back', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json({ ...describeBody, views: ['files', 'browser'] })
					: json(listing(nestedFiles()));
		await open();
		await ready('summary.docx');
		folderButton('reports').click();
		await tick();
		namedButton('Browser').click();
		await vi.waitFor(() =>
			expect(document.querySelector('ul[aria-label="Workspace file list"]')).toBeNull()
		);
		namedButton('Files').click();
		await vi.waitFor(() =>
			expect(folderButton('reports').getAttribute('aria-expanded')).toBe('false')
		);
		expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(true);
	});

	const collidingFileId = 'd4104ce0-5467-4e12-a39b-6066c929ae76';
	const nestedCollisionId = 'e8b1a2c4-7d6f-4a91-9c20-1f3b5d7e9a01';

	function collisionFiles(id = chat): {
		root: WorkspaceFile;
		nested: WorkspaceFile;
		other: WorkspaceFile;
	} {
		return {
			root: {
				...file('page.html', collidingFileId),
				url: `/ocu/files/${id}/page.html`
			},
			nested: {
				...file(`${collidingFileId}/notes.txt`, nestedCollisionId),
				url: `/ocu/files/${id}/${collidingFileId}/notes.txt`
			},
			other: {
				...file('reports/summary.docx', 'reports-summary.docx'),
				url: `/ocu/files/${id}/reports/summary.docx`
			}
		};
	}

	async function assertCollisionRows() {
		const { root, nested } = collisionFiles();
		const folder = folderButton(collidingFileId);
		expect(folder.getAttribute('aria-expanded')).toBe('true');
		expect(fileButton(`${collidingFileId}/notes.txt`)).toBeDefined();
		expect(fileButton('page.html')).toBeDefined();
		expect(fileButton('reports/summary.docx')).toBeDefined();
		await namedButton(`${collidingFileId}/notes.txt`).click();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].selectedFileId).toBe(nested.file_id));
		expect(fileButton(`${collidingFileId}/notes.txt`).getAttribute('aria-pressed')).toBe('true');
		expect(fileButton('page.html').getAttribute('aria-pressed')).toBe('false');
		await namedButton('page.html').click();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].selectedFileId).toBe(root.file_id));
		expect(fileButton('page.html').getAttribute('aria-pressed')).toBe('true');
		expect(fileButton(`${collidingFileId}/notes.txt`).getAttribute('aria-pressed')).toBe('false');
		await vi.waitFor(() =>
			expect(calls.some((call) => call.url.endsWith('/prefs') && call.init?.method === 'PUT')).toBe(
				true
			)
		);
		const before = calls.map((call) => `${call.init?.method ?? 'GET'} ${call.url}`);
		folder.click();
		await tick();
		expect(folder.getAttribute('aria-expanded')).toBe('false');
		expect(fileButton(`${collidingFileId}/notes.txt`).closest('li')?.hidden).toBe(true);
		expect(fileButton('page.html').closest('li')?.hidden).toBe(false);
		expect(fileButton('reports/summary.docx').closest('li')?.hidden).toBe(false);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe(root.file_id);
		folder.click();
		await tick();
		expect(folder.getAttribute('aria-expanded')).toBe('true');
		expect(fileButton(`${collidingFileId}/notes.txt`).closest('li')?.hidden).toBe(false);
		expect(calls.map((call) => `${call.init?.method ?? 'GET'} ${call.url}`)).toEqual(before);
	}

	it('renders a UUID folder independently of a root file that already uses that file_id', async () => {
		const { root, nested, other } = collisionFiles();
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([root, nested, other]));
		await open();
		await ready('notes.txt');
		await assertCollisionRows();
	});

	it('keeps UUID folder and file rows distinct when pagination introduces the collision', async () => {
		const { root, nested, other } = collisionFiles();
		scenario = (input, init) => {
			if (input.endsWith('/prefs') && init?.method === 'PUT')
				return json({ prefs: JSON.parse(String(init.body)) });
			if (input.includes('/workspaces/')) return json(describeBody);
			if (input.includes('cursor=second')) return json(listing([nested, other], null, 1, 3));
			return json(listing([root], 'second', 1, 3));
		};
		await open();
		await ready('page.html');
		expect([
			...document.querySelectorAll('ul[aria-label="Workspace file list"] [aria-label^="Folder "]')
		]).toHaveLength(0);
		expect(fileButton('page.html')).toBeDefined();
		namedButton('More files').click();
		await ready('notes.txt');
		await assertCollisionRows();
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
