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
	listing,
	url
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

const nestedSummary: WorkspaceFile = {
	...file('reports/summary.docx', 'reports-summary.docx'),
	url: `/ocu/files/${chat}/reports/summary.docx`,
	type: 'docx',
	mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	size: 4096
};
const nestedIndex: WorkspaceFile = {
	...file('packages/core/src/index.py', 'packages-core-src-index.py'),
	url: `/ocu/files/${chat}/packages/core/src/index.py`,
	type: 'code',
	mime: 'text/x-python',
	size: 2048
};
const rootPage: WorkspaceFile = {
	...file('page.html', 'page.html'),
	url: `/ocu/files/${chat}/page.html`,
	type: 'html',
	mime: 'text/html',
	size: 256
};
const rootNotes: WorkspaceFile = {
	...file('notes.bin', 'notes.bin'),
	url: `/ocu/files/${chat}/notes.bin`,
	type: 'binary',
	mime: 'application/octet-stream',
	size: 64
};
const officeFile: WorkspaceFile = file('valid.docx');

async function open() {
	component = mount(WorkspaceArtifact, {
		target: document.body,
		props: { chatId: chat, enabled: true },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, controller]
		])
	});
	controller.observe(chat, true);
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

function selectedRegion() {
	const region = document.querySelector('[aria-label="Selected workspace file"]');
	expect(region).not.toBeNull();
	return region as HTMLElement;
}

function namedDownload(name: string) {
	const link = [...document.querySelectorAll('a')].find((item) => {
		const labelled = item.getAttribute('aria-label')?.trim();
		const text = item.textContent?.replace(/\s+/g, ' ').trim();
		return (
			item.getAttribute('download') === name &&
			(labelled === `Download ${name}` || text === `Download ${name}`)
		);
	});
	expect(link, `Download ${name}`).toBeDefined();
	return link as HTMLAnchorElement;
}

function secondaryDownload() {
	const named = namedDownload(rootNotes.name);
	const links = [...selectedRegion().querySelectorAll('a')].filter((item) => item !== named);
	expect(links).toHaveLength(1);
	return links[0] as HTMLAnchorElement;
}

async function revealTooltip(node: Element) {
	const target = (node.closest('[class]') ?? node) as HTMLElement;
	target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
	target.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
	await tick();
	await vi.waitFor(() => expect(document.querySelector('.tippy-content')).not.toBeNull());
	return [...document.querySelectorAll('.tippy-content')]
		.map((item) => item.textContent ?? '')
		.join('\n');
}

function previewSurface(region = selectedRegion()) {
	const surface = region.querySelector('[data-selected-preview]');
	expect(surface).not.toBeNull();
	return surface as HTMLElement;
}

beforeEach(() => {
	ocuWorkspaces.set({});
	document.body.replaceChildren();
	localStorage.setItem('token', 'fixture-session');
	calls = [];
	scenario = (input, init) =>
		input.endsWith('/prefs') && init?.method === 'PUT'
			? json({ prefs: JSON.parse(String(init.body)) })
			: input.includes('/workspaces/')
				? json(describeBody)
				: json(listing([nestedSummary, nestedIndex, rootPage, rootNotes, officeFile]));
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
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('selected workspace file bar and framed preview', () => {
	it('shows nested then root metadata, formatted sizes, tooltip and the original download', async () => {
		await open();
		await ready('summary.docx');
		namedButton('reports/summary.docx').click();
		await tick();
		const region = selectedRegion();
		const bar = region.querySelector('[data-selected-bar]');
		expect(bar).not.toBeNull();
		expect(bar!.querySelector('[data-file-kind="document"]')).not.toBeNull();
		expect(bar!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
		expect(bar!.textContent).toContain('summary.docx');
		expect(bar!.textContent).toContain('reports');
		expect(bar!.textContent).not.toContain('packages/core/src');
		expect(bar!.querySelector('[data-file-size]')?.textContent).toBe('4.0 KB');
		const revealed = await revealTooltip(bar!.querySelector('[data-selected-name]') ?? bar!);
		expect(revealed).toContain('summary.docx');
		const download = namedDownload('reports/summary.docx');
		expect(download.getAttribute('href')).toBe(`${url}reports/summary.docx?download=1`);
		expect(download.getAttribute('download')).toBe('reports/summary.docx');
		expect(download.textContent?.trim()).toBe('Download reports/summary.docx');
		expect(download.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
		expect(
			[...region.querySelectorAll('a')].filter(
				(item) => item.textContent?.trim() === 'Download reports/summary.docx'
			)
		).toHaveLength(1);

		namedButton('page.html').click();
		await tick();
		const rootBar = selectedRegion().querySelector('[data-selected-bar]')!;
		expect(rootBar.textContent).toContain('page.html');
		expect(rootBar.textContent).not.toContain('reports');
		expect(rootBar.querySelector('[data-file-kind="web"]')).not.toBeNull();
		expect(rootBar.querySelector('[data-file-size]')?.textContent).toBe('256.0 B');
		expect(namedDownload('page.html').getAttribute('href')).toBe(`${url}page.html?download=1`);
	});

	it('frames generated, Office and unsupported branches without changing frame contracts', async () => {
		await open();
		await ready('page.html');
		namedButton('page.html').click();
		await tick();
		const generatedRegion = selectedRegion();
		const generatedSurface = previewSurface(generatedRegion);
		const generated = generatedSurface.querySelector(
			'iframe[title="page.html"]'
		) as HTMLIFrameElement;
		expect(generated).not.toBeNull();
		expect(generated.getAttribute('src')).toBe(`${url}page.html?revision=1`);
		expect(generated.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
		expect(generated.getAttribute('title')).toBe('page.html');
		expect(generated.className).toMatch(/border-0|border-none/);
		expect(generatedSurface.contains(generated)).toBe(true);

		namedButton('valid.docx').click();
		await tick();
		await ready('Connecting Office preview');
		const officeSurface = previewSurface();
		const status = officeSurface.querySelector('[role="status"]');
		expect(status?.textContent).toContain('Connecting Office preview');
		expect(status?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		expect(officeSurface.querySelector('button')).toBeNull();
		const office = officeSurface.querySelector(
			'iframe[title="Office preview: valid.docx"]'
		) as HTMLIFrameElement;
		expect(office.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=files`);
		expect(office.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
		expect(office.getAttribute('title')).toBe('Office preview: valid.docx');
		expect(office.className).toMatch(/border-0|border-none/);
		expect(namedDownload('valid.docx').getAttribute('href')).toBe(`${url}valid.docx?download=1`);
		await tick();
		const sent = vi.spyOn(office.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: office.contentWindow,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		await tick();
		expect(document.body.textContent).toContain('Rendering Office file');
		expect(previewSurface().querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		expect(sent).toHaveBeenCalledTimes(1);
		const selection = sent.mock.calls[0][0];
		const generation =
			selection && typeof selection === 'object' && 'generation' in selection
				? Number(selection.generation)
				: -1;
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: office.contentWindow,
				data: {
					type: 'ocu:preview-state',
					chat_id: chat,
					file_id: 'valid.docx',
					generation,
					state: 'ready'
				}
			})
		);
		await tick();
		expect(document.body.textContent).not.toContain('Connecting Office preview');
		expect(document.body.textContent).not.toContain('Rendering Office file');
		expect(previewSurface().querySelector('[role="status"]')).toBeNull();
		expect(previewSurface().querySelector('iframe[title="Office preview: valid.docx"]')).toBe(
			office
		);
		namedButton('valid.docx').click();
		await tick();
		await ready('Connecting Office preview');
		const retryFrame = previewSurface().querySelector(
			'iframe[title="Office preview: valid.docx"]'
		) as HTMLIFrameElement;
		await tick();
		const retrySend = vi.spyOn(retryFrame.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: retryFrame.contentWindow,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		await tick();
		const retrySelection = retrySend.mock.calls[0][0];
		const retryGeneration =
			retrySelection && typeof retrySelection === 'object' && 'generation' in retrySelection
				? Number(retrySelection.generation)
				: -1;
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: retryFrame.contentWindow,
				data: {
					type: 'ocu:preview-state',
					chat_id: chat,
					file_id: 'valid.docx',
					generation: retryGeneration,
					state: 'error'
				}
			})
		);
		await ready('Office preview error');
		const failed = previewSurface();
		expect(failed.querySelector('[role="status"]')?.textContent).toContain('Office preview error');
		expect(failed.querySelector('.spinner_ajPY')).toBeNull();
		const retry = [...failed.querySelectorAll('button')].find(
			(item) => item.textContent?.trim() === 'Retry Office preview'
		);
		expect(retry).toBeDefined();
		expect(failed.contains(retry!)).toBe(true);
		expect(failed.querySelector('iframe[title="Office preview: valid.docx"]')).toBeNull();
		retry!.click();
		await tick();
		await ready('Connecting Office preview');
		expect(
			previewSurface().querySelector('iframe[title="Office preview: valid.docx"]')
		).not.toBeNull();

		namedButton('notes.bin').click();
		await tick();
		await ready('Preview not supported for this file type');
		const unsupported = previewSurface();
		expect(unsupported.querySelector('[data-file-kind="other"]')).not.toBeNull();
		expect(unsupported.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
		expect(unsupported.querySelector('[role="status"]')?.textContent).toContain(
			'Preview not supported for this file type. Download the file to open it.'
		);
		const named = namedDownload('notes.bin');
		expect(named.getAttribute('href')).toBe(`${url}notes.bin?download=1`);
		expect(named.getAttribute('download')).toBe('notes.bin');
		const extra = secondaryDownload();
		expect(extra.textContent?.trim()).toBe('Download');
		expect(extra.getAttribute('href')).toBe(`${url}notes.bin?download=1`);
		expect(extra.getAttribute('download')).toBe('notes.bin');
		expect(unsupported.contains(extra)).toBe(true);
		expect(
			[...selectedRegion().querySelectorAll('a')].filter(
				(item) => item.textContent?.trim() === 'Download notes.bin'
			)
		).toHaveLength(1);
	});
});
