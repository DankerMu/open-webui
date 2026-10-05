// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import { get } from 'svelte/store';
import { config, settings } from '$lib/stores';
import { applyWorkspaceListing, ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
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
import { OFFICE_EDITOR_ALLOW, OFFICE_EDITOR_SANDBOX } from './office-editor-frame';

let component: Record<string, unknown> | undefined;
let calls: Array<{ url: string; init?: RequestInit }>;
let scenario: (input: string, init?: RequestInit) => Response | Promise<Response>;
let controller: WorkspaceReconciliation;
let detachController: () => void;
let priorConfig: Parameters<typeof config.set>[0];
let priorSettings: Parameters<typeof settings.set>[0];

const officeDocx: WorkspaceFile = file('report.docx');
const officeXlsx: WorkspaceFile = {
	...file('sheet.xlsx', 'sheet.xlsx'),
	type: 'xlsx',
	mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const officePptx: WorkspaceFile = {
	...file('deck.pptx', 'deck.pptx'),
	type: 'pptx',
	mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
const htmlFile: WorkspaceFile = file('page.html');
const pdfFile: WorkspaceFile = {
	...file('brief.pdf', 'brief.pdf'),
	type: 'pdf',
	mime: 'application/pdf'
};
const legacyDoc: WorkspaceFile = {
	...file('legacy.doc', 'legacy.doc'),
	type: 'doc',
	mime: 'application/msword'
};

function officeConfig(office: boolean | undefined, workspace = true) {
	const features: Record<string, boolean> = { enable_ocu_workspace: workspace };
	if (office !== undefined) features.enable_ocu_office_edit = office;
	return { features } as unknown as Parameters<typeof config.set>[0];
}

function namedButton(name: string) {
	const button = [...document.querySelectorAll('button')].find(
		(item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name
	);
	expect(button, name).toBeDefined();
	return button as HTMLButtonElement;
}

function editAction() {
	const bar = document.querySelector('[data-selected-bar]');
	if (!bar) return undefined;
	return [...bar.querySelectorAll('button')].find(
		(item) => item.getAttribute('aria-label') === 'Edit' || item.textContent?.trim() === 'Edit'
	);
}

function editorFrame(name: string) {
	return document.querySelector(
		`iframe[title="Office editor: ${name}"]`
	) as HTMLIFrameElement | null;
}

function previewFrame(name: string) {
	return document.querySelector(
		`iframe[title="Office preview: ${name}"]`
	) as HTMLIFrameElement | null;
}

async function open(enabled = true, id = chat) {
	component = mount(WorkspaceArtifact, {
		target: document.body,
		props: { chatId: id, enabled },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, controller]
		])
	});
	controller.observe(id, enabled);
	await vi.waitFor(() =>
		expect(document.body.querySelector('[aria-label="Workspace Files"]')).not.toBeNull()
	);
	return document.body;
}

async function ready(text: string) {
	await vi.waitFor(() => expect(document.body.textContent).toContain(text));
}

async function selectAndEdit(name: string) {
	namedButton(name).click();
	await tick();
	expect(editAction()).toBeDefined();
	editAction()!.click();
	await tick();
	const frame = editorFrame(name);
	expect(frame).not.toBeNull();
	return frame as HTMLIFrameElement;
}

function officeRequests() {
	return calls.filter((call) => call.url.includes('/ocu/api/office/'));
}

function launchRequests() {
	return calls.filter((call) => call.url.endsWith('/launch') && call.init?.method === 'POST');
}

function handshake(frame: HTMLIFrameElement) {
	const sent = vi.spyOn(frame.contentWindow!, 'postMessage');
	window.dispatchEvent(
		new MessageEvent('message', {
			origin: window.location.origin,
			source: frame.contentWindow,
			data: { type: 'ocu:office-ready', chat_id: chat }
		})
	);
	expect(sent).toHaveBeenCalledTimes(1);
	const openMessage = sent.mock.calls[0][0] as {
		type: string;
		chat_id: string;
		file_id: string;
		generation: number;
	};
	expect(sent.mock.calls[0][1]).toBe(window.location.origin);
	return { sent, openMessage };
}

beforeEach(() => {
	priorConfig = get(config);
	priorSettings = get(settings);
	config.set(officeConfig(true));
	settings.set({
		iframeSandboxAllowScripts: false,
		iframeSandboxAllowSameOrigin: true,
		iframeSandboxAllowForms: true,
		iframeSandboxAllowDownloads: true
	});
	ocuWorkspaces.set({});
	ocuOffice.set({});
	document.body.replaceChildren();
	localStorage.setItem('token', 'fixture-session');
	calls = [];
	scenario = (input, init) =>
		input.endsWith('/prefs') && init?.method === 'PUT'
			? json({ prefs: JSON.parse(String(init.body)) })
			: input.includes('/workspaces/')
				? json(describeBody)
				: json(listing([officeDocx, htmlFile]));
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
	config.set(priorConfig);
	settings.set(priorSettings);
	ocuOffice.set({});
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('Office edit entry', () => {
	it('offers Edit on a selected DOCX and mounts the editor frame', async () => {
		await open();
		await ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		expect(editAction()).toBeDefined();
		editAction()!.click();
		await tick();
		const editor = editorFrame('report.docx');
		expect(editor).not.toBeNull();
		expect(editor!.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=office`);
		expect(editor!.getAttribute('sandbox')).toBe(OFFICE_EDITOR_SANDBOX);
		expect(editor!.getAttribute('allow')).toBe(OFFICE_EDITOR_ALLOW);
		expect(previewFrame('report.docx')).toBeNull();
		expect(officeRequests()).toEqual([]);
		expect(launchRequests()).toEqual([]);
	});

	it.each([undefined, false] as const)(
		'hides Edit and keeps read-only preview when the Office flag is %s',
		async (office) => {
			config.set(officeConfig(office));
			await open();
			await ready('report.docx');
			namedButton('report.docx').click();
			await tick();
			expect(editAction()).toBeUndefined();
			expect(editorFrame('report.docx')).toBeNull();
			expect(previewFrame('report.docx')).not.toBeNull();
			expect(previewFrame('report.docx')!.getAttribute('sandbox')).toBe(
				'allow-scripts allow-same-origin allow-forms'
			);
			expect(officeRequests()).toEqual([]);
		}
	);

	it('hides Edit when the workspace flag is off', async () => {
		config.set(officeConfig(true, false));
		await open();
		expect(document.body.querySelector('[aria-label="Workspace Files"]')).not.toBeNull();
		expect(editAction()).toBeUndefined();
		expect(editorFrame('report.docx')).toBeNull();
		expect(officeRequests()).toEqual([]);
	});

	it('offers Edit only for broker docx, xlsx and pptx', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([officeDocx, officeXlsx, officePptx, htmlFile, pdfFile, legacyDoc]));
		await open();
		await ready('report.docx');
		for (const name of ['report.docx', 'sheet.xlsx', 'deck.pptx']) {
			namedButton(name).click();
			await tick();
			expect(editAction(), name).toBeDefined();
		}
		for (const name of ['page.html', 'brief.pdf', 'legacy.doc']) {
			namedButton(name).click();
			await tick();
			expect(editAction(), name).toBeUndefined();
			expect(editorFrame(name)).toBeNull();
		}
		expect(officeRequests()).toEqual([]);
	});

	it('opens the editor on a stopped workspace without issuing launch', async () => {
		scenario = (input, init) => {
			if (input.endsWith('/launch') && init?.method === 'POST') return json({ state: 'running' });
			if (input.endsWith('/prefs') && init?.method === 'PUT')
				return json({ prefs: JSON.parse(String(init.body)) });
			if (input.includes('/workspaces/'))
				return json({
					...describeBody,
					status: 'stopped',
					capabilities: ['launch', 'refresh', 'prefs']
				});
			return json(listing([officeDocx]));
		};
		await open();
		await ready('Workspace is stopped; saved files remain available');
		await selectAndEdit('report.docx');
		expect(launchRequests()).toEqual([]);
		expect(get(ocuWorkspaces)[chat].status).toBe('stopped');
	});

	it('keeps B1 sandbox and empty allow for all three types under toggled iframeSandbox settings', async () => {
		scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json({ ...describeBody, views: ['files', 'browser'] })
					: json(listing([officeDocx, officeXlsx, officePptx, htmlFile]));
		await open();
		await ready('report.docx');
		for (let bits = 0; bits < 16; bits++) {
			settings.set({
				iframeSandboxAllowScripts: !!(bits & 1),
				iframeSandboxAllowSameOrigin: !!(bits & 2),
				iframeSandboxAllowForms: !!(bits & 4),
				iframeSandboxAllowDownloads: !!(bits & 8)
			});
			for (const name of ['report.docx', 'sheet.xlsx', 'deck.pptx']) {
				const frame = await selectAndEdit(name);
				expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
				expect(frame.getAttribute('allow')).toBe('');
			}
		}
		namedButton('page.html').click();
		await tick();
		expect(document.querySelector('iframe[title="page.html"]')!.getAttribute('sandbox')).toBe(
			'allow-scripts allow-forms'
		);
		namedButton('Browser').click();
		await tick();
		expect(
			document.querySelector('iframe[title="Workspace Browser"]')!.getAttribute('sandbox')
		).toBe('allow-scripts allow-same-origin allow-forms');
	});

	it('preserves the editor element across revision, path, listing and first session id', async () => {
		await open();
		await ready('report.docx');
		const frame = await selectAndEdit('report.docx');
		const { openMessage } = handshake(frame);
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: frame.contentWindow,
				data: {
					type: 'ocu:office-state',
					chat_id: chat,
					file_id: 'report.docx',
					generation: openMessage.generation,
					session_id: 'sess-1',
					state: 'editing',
					dirty: false,
					workspace_changed: false,
					reason: null
				}
			})
		);
		await tick();
		applyWorkspaceListing(
			chat,
			get(ocuWorkspaces)[chat].generation,
			[
				{
					...officeDocx,
					revision: 9,
					path: 'renamed.docx',
					name: 'renamed.docx',
					url: `/ocu/files/${chat}/renamed.docx`
				},
				htmlFile,
				{ ...pdfFile }
			],
			9,
			null
		);
		await tick();
		expect(editorFrame('renamed.docx')).toBe(frame);
		expect(get(ocuOffice)[chat].fileId).toBe('report.docx');
		expect(get(ocuOffice)[chat].sessionId).toBe('sess-1');
		ocuWorkspaces.update((states) => ({ ...states, [chat]: { ...states[chat] } }));
		await tick();
		expect(editorFrame('renamed.docx')).toBe(frame);
		editAction()!.click();
		await tick();
		const retry = editorFrame('renamed.docx');
		expect(retry).not.toBeNull();
		expect(retry).not.toBe(frame);
		expect(get(ocuOffice)[chat].generation).toBeGreaterThan(openMessage.generation);
	});
	it('retires a frame that never becomes ready, ignores late ready, and retries with a fresh frame', async () => {
		vi.useFakeTimers();
		await open();
		await ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		editAction()!.click();
		await tick();
		const retired = editorFrame('report.docx');
		expect(retired).not.toBeNull();
		const retiredWindow = retired!.contentWindow;
		const sent = vi.spyOn(retiredWindow!, 'postMessage');
		const generation = get(ocuOffice)[chat].generation;
		expect(previewFrame('report.docx')).toBeNull();
		expect(document.body.textContent, document.body.textContent ?? '').not.toContain(
			'Connecting Office preview'
		);
		await vi.advanceTimersByTimeAsync(10_000);
		await tick();
		expect(editorFrame('report.docx')).toBeNull();
		expect(previewFrame('report.docx')).toBeNull();
		expect(document.body.textContent).toContain('Office editor did not become ready');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: retiredWindow,
				data: { type: 'ocu:office-ready', chat_id: chat }
			})
		);
		expect(document.body.textContent).toContain('Office editor did not become ready');
		expect(sent).not.toHaveBeenCalled();
		expect(get(ocuOffice)[chat].generation).toBeGreaterThan(generation);
		vi.useRealTimers();
		namedButton('Retry').click();
		await tick();
		const retry = editorFrame('report.docx');
		expect(retry).not.toBeNull();
		expect(retry).not.toBe(retired);
		handshake(retry!);
	});

	it('returns to read-only preview after the editor is retired by selecting another file', async () => {
		await open();
		await ready('report.docx');
		await selectAndEdit('report.docx');
		namedButton('page.html').click();
		await tick();
		expect(editorFrame('report.docx')).toBeNull();
		expect(document.querySelector('iframe[title="page.html"]')).not.toBeNull();
		namedButton('report.docx').click();
		await tick();
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(editorFrame('report.docx')).toBeNull();
		await tick();
		const preview = previewFrame('report.docx')!;
		const post = vi.spyOn(preview.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				source: preview.contentWindow,
				origin: window.location.origin,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][0]).toMatchObject({
			type: 'ocu:preview-select',
			file_id: 'report.docx'
		});
	});
	it.each(['office-flag', 'workspace-flag', 'selection', 'selection-removed', 'view', 'unmount'])(
		'retires frame authority on %s without close or orphan editor work',
		async (cause) => {
			await open();
			await ready('report.docx');
			vi.useFakeTimers();
			const frame = await selectAndEdit('report.docx');
			const oldWindow = frame.contentWindow!;
			const { sent, openMessage } = handshake(frame);
			const removed = vi.spyOn(window, 'removeEventListener');
			if (cause === 'office-flag') config.set(officeConfig(false));
			else if (cause === 'workspace-flag') config.set(officeConfig(true, false));
			else if (cause === 'selection') namedButton('page.html').click();
			else if (cause === 'selection-removed')
				ocuWorkspaces.update((states) => ({
					...states,
					[chat]: { ...states[chat], selectedFileId: undefined }
				}));
			else if (cause === 'view')
				ocuWorkspaces.update((states) => ({
					...states,
					[chat]: { ...states[chat], view: 'browser' }
				}));
			else {
				await unmount(component!);
				component = undefined;
			}
			await tick();
			expect(editorFrame('report.docx')).toBeNull();
			expect(get(ocuOffice)[chat].generation).toBeGreaterThan(openMessage.generation);
			expect(removed.mock.calls.some(([type]) => type === 'message')).toBe(true);
			const snapshot = get(ocuOffice);
			window.dispatchEvent(
				new MessageEvent('message', {
					source: oldWindow,
					origin: window.location.origin,
					data: {
						type: 'ocu:office-state',
						chat_id: chat,
						file_id: 'report.docx',
						generation: openMessage.generation,
						session_id: 'old-session',
						state: 'editing',
						dirty: true,
						workspace_changed: true,
						reason: null
					}
				})
			);
			expect(get(ocuOffice)).toBe(snapshot);
			expect(sent).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(10_000);
			await tick();
			expect(document.body.textContent).not.toContain('Office editor did not become ready');
			expect(officeRequests()).toEqual([]);
			expect(launchRequests()).toEqual([]);
		}
	);

	it('rejects the mounted sender, binding and schema matrix atomically', async () => {
		await open();
		await ready('report.docx');
		const frame = await selectAndEdit('report.docx');
		const generation = get(ocuOffice)[chat].generation;
		const send = vi.spyOn(frame.contentWindow!, 'postMessage');
		const data = {
			type: 'ocu:office-state',
			chat_id: chat,
			file_id: 'report.docx',
			generation,
			session_id: 'sess-1',
			state: 'editing',
			dirty: true,
			workspace_changed: true,
			reason: null
		};
		const dispatch = (
			value: unknown,
			source: MessageEventSource | null = frame.contentWindow,
			origin = window.location.origin
		) => window.dispatchEvent(new MessageEvent('message', { data: value, source, origin }));
		const sibling = document.createElement('iframe');
		sibling.src = `/ocu/files/${chat}/page.html?revision=1`;
		sibling.setAttribute('sandbox', 'allow-scripts allow-forms');
		document.body.append(sibling);
		const snapshot = get(ocuOffice);
		dispatch(data);
		dispatch({ type: 'ocu:office-ready', chat_id: chat }, sibling.contentWindow);
		dispatch({ type: 'ocu:office-ready', chat_id: chat }, window);
		dispatch(
			{ type: 'ocu:office-ready', chat_id: chat },
			frame.contentWindow,
			'https://other.example'
		);
		dispatch({ type: 'ocu:office-ready', chat_id: 'other' });
		dispatch({ type: 'ocu:office-ready', chat_id: chat, extra: true });
		expect(send).not.toHaveBeenCalled();
		expect(get(ocuOffice)).toBe(snapshot);
		dispatch({ type: 'ocu:office-ready', chat_id: chat });
		dispatch({ type: 'ocu:office-ready', chat_id: chat });
		expect(send).toHaveBeenCalledTimes(1);
		for (const invalid of [
			{ ...data, chat_id: 'other' },
			{ ...data, file_id: 'other' },
			{ ...data, generation: generation - 1 },
			{ ...data, generation: true },
			{ ...data, state: 'unknown' },
			{ ...data, state: 'constructor' },
			{ ...data, dirty: 1 },
			{ ...data, workspace_changed: null },
			{ ...data, session_id: {} },
			{ ...data, reason: false },
			{ ...data, extra: true },
			null,
			[],
			'editing'
		])
			dispatch(invalid);
		for (const key of Object.keys(data)) {
			const missing: Record<string, unknown> = { ...data };
			delete missing[key];
			dispatch(missing);
		}
		dispatch(data, sibling.contentWindow);
		dispatch(data, frame.contentWindow, 'https://other.example');
		expect(get(ocuOffice)).toBe(snapshot);
		dispatch(data);
		expect(get(ocuOffice)[chat]).toMatchObject({
			fileId: 'report.docx',
			sessionId: 'sess-1',
			state: 'editing',
			dirty: true,
			workspaceChanged: true,
			reason: null
		});
		const accepted = get(ocuOffice);
		dispatch(data);
		expect(get(ocuOffice)).toBe(accepted);
		expect(officeRequests()).toEqual([]);
		expect(launchRequests()).toEqual([]);
		sibling.remove();
	});
	it.each(['', 'default', 'temporary:new', 'local:new', 'channel:new'])(
		'keeps unsaved chat %s off the editor and network',
		async (id) => {
			await open(true, id);
			expect(document.querySelector('[aria-label="Edit"]')).toBeNull();
			expect(document.querySelector('iframe')).toBeNull();
			expect(calls).toEqual([]);
			expect(get(ocuOffice)).toEqual({});
		}
	);

	it('keeps disabled workspace off the editor and network', async () => {
		await open(false);
		expect(document.querySelector('[aria-label="Edit"]')).toBeNull();
		expect(document.querySelector('iframe')).toBeNull();
		expect(calls).toEqual([]);
		expect(get(ocuOffice)).toEqual({});
	});
	it.each(['chat', 'enabled'])(
		'retires authority when the mounted %s prop changes',
		async (prop) => {
			const mounted = createClassComponent({
				component: WorkspaceArtifact,
				target: document.body,
				props: { chatId: chat, enabled: true },
				context: new Map<unknown, unknown>([
					['i18n', i18n],
					[WORKSPACE_RECONCILIATION, controller]
				])
			});
			try {
				controller.observe(chat, true);
				await ready('report.docx');
				const frame = await selectAndEdit('report.docx');
				const source = frame.contentWindow!;
				const { openMessage, sent } = handshake(frame);
				mounted.$set({ chatId: chat, enabled: true });
				await tick();
				expect(editorFrame('report.docx')).toBe(frame);
				if (prop === 'enabled') mounted.$set({ enabled: false });
				else {
					const state = get(ocuWorkspaces)[chat];
					ocuWorkspaces.update((states) => ({
						...states,
						'other-chat': {
							...state,
							files: state.files.map((file) => ({
								...file,
								url: `/ocu/files/other-chat/${file.path}`
							}))
						}
					}));
					mounted.$set({ chatId: 'other-chat' });
				}
				await tick();
				expect(editorFrame('report.docx')).toBeNull();
				const snapshot = get(ocuOffice);
				expect(snapshot[chat].generation).toBeGreaterThan(openMessage.generation);
				window.dispatchEvent(
					new MessageEvent('message', {
						source,
						origin: window.location.origin,
						data: { type: 'ocu:office-ready', chat_id: chat }
					})
				);
				expect(sent).toHaveBeenCalledTimes(1);
				expect(get(ocuOffice)).toBe(snapshot);
				expect(officeRequests()).toEqual([]);
			} finally {
				mounted.$destroy();
			}
		}
	);
});
