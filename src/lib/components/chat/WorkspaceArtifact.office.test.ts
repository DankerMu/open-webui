// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick, unmount } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import { get } from 'svelte/store';
import { config, settings } from '$lib/stores';
import { applyWorkspaceListing, ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import { chat, describeBody, i18n, json, listing } from '../../../../test/ocu-workspace-fixtures';
import { WORKSPACE_RECONCILIATION } from './workspace-reconciliation';
import { OFFICE_EDITOR_ALLOW, OFFICE_EDITOR_SANDBOX } from './office-editor-frame';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	htmlFile,
	legacyDoc,
	namedButton,
	officeConfig,
	readyEditorFrame,
	officeDocx,
	officePptx,
	officeXlsx,
	pdfFile,
	previewFrame
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('Office edit entry', () => {
	it('offers Edit on a selected DOCX and mounts the editor frame', async () => {
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		expect(editAction()).toBeDefined();
		editAction()!.click();
		await readyEditorFrame('report.docx');
		const editor = editorFrame('report.docx');
		expect(editor).not.toBeNull();
		expect(editor!.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=office`);
		expect(editor!.getAttribute('sandbox')).toBe(OFFICE_EDITOR_SANDBOX);
		expect(editor!.getAttribute('allow')).toBe(OFFICE_EDITOR_ALLOW);
		expect(previewFrame('report.docx')).toBeNull();
		expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
			['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
		]);
		expect(harness.launchRequests()).toEqual([]);
	});

	it.each([undefined, false] as const)(
		'hides Edit and keeps read-only preview when the Office flag is %s',
		async (office) => {
			config.set(officeConfig(office));
			await harness.open();
			await harness.ready('report.docx');
			namedButton('report.docx').click();
			await tick();
			expect(editAction()).toBeUndefined();
			expect(editorFrame('report.docx')).toBeNull();
			expect(previewFrame('report.docx')).not.toBeNull();
			expect(previewFrame('report.docx')!.getAttribute('sandbox')).toBe(
				'allow-scripts allow-same-origin allow-forms'
			);
			expect(harness.officeRequests()).toEqual([]);
		}
	);

	it('hides Edit when the workspace flag is off', async () => {
		config.set(officeConfig(true, false));
		await harness.open();
		expect(document.body.querySelector('[aria-label="Workspace Files"]')).not.toBeNull();
		expect(editAction()).toBeUndefined();
		expect(editorFrame('report.docx')).toBeNull();
		expect(harness.officeRequests()).toEqual([]);
	});

	it('offers Edit only for broker docx, xlsx and pptx', async () => {
		harness.setListing([officeDocx, officeXlsx, officePptx, htmlFile, pdfFile, legacyDoc]);
		await harness.open();
		await harness.ready('report.docx');
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
		expect(harness.officeRequests()).toEqual([]);
	});

	it('opens the editor on a stopped workspace without issuing launch', async () => {
		const workspaceScenario = harness.scenario;
		harness.scenario = (input, init) => {
			if (input.includes('/ocu/api/office/')) return workspaceScenario(input, init);
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
		await harness.open();
		await harness.ready('Workspace is stopped; saved files remain available');
		await harness.selectAndEdit('report.docx');
		expect(harness.launchRequests()).toEqual([]);
		expect(get(ocuWorkspaces)[chat].status).toBe('stopped');
	});

	it('keeps B1 sandbox and empty allow for all three types under toggled iframeSandbox settings', async () => {
		harness.setListing([officeDocx, officeXlsx, officePptx, htmlFile], {
			...describeBody,
			views: ['files', 'browser']
		});
		await harness.open();
		await harness.ready('report.docx');
		for (let bits = 0; bits < 16; bits++) {
			settings.set({
				iframeSandboxAllowScripts: !!(bits & 1),
				iframeSandboxAllowSameOrigin: !!(bits & 2),
				iframeSandboxAllowForms: !!(bits & 4),
				iframeSandboxAllowDownloads: !!(bits & 8)
			});
			for (const name of ['report.docx', 'sheet.xlsx', 'deck.pptx']) {
				const frame = await harness.selectAndEdit(name);
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
		await harness.open();
		await harness.ready('report.docx');
		const frame = await harness.selectAndEdit('report.docx');
		const { openMessage } = harness.handshake(frame);
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
		await readyEditorFrame('renamed.docx');
		const retry = editorFrame('renamed.docx');
		expect(retry).not.toBeNull();
		expect(retry).not.toBe(frame);
		expect(get(ocuOffice)[chat].generation).toBeGreaterThan(openMessage.generation);
	});

	it('retires a frame that never becomes ready, ignores late ready, and retries with a fresh frame', async () => {
		vi.useFakeTimers();
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		editAction()!.click();
		await readyEditorFrame('report.docx');
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
		await readyEditorFrame('report.docx');
		const retry = editorFrame('report.docx');
		expect(retry).not.toBeNull();
		expect(retry).not.toBe(retired);
		harness.handshake(retry!);
	});

	it('returns to read-only preview after the editor is retired by selecting another file', async () => {
		await harness.open();
		await harness.ready('report.docx');
		await harness.selectAndEdit('report.docx');
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
		const post = harness.previewHandshake(preview);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][0]).toMatchObject({
			type: 'ocu:preview-select',
			file_id: 'report.docx'
		});
	});

	it.each(['office-flag', 'workspace-flag', 'selection', 'selection-removed', 'view', 'unmount'])(
		'retires frame authority on %s without close or orphan editor work',
		async (cause) => {
			await harness.open();
			await harness.ready('report.docx');
			vi.useFakeTimers();
			const frame = await harness.selectAndEdit('report.docx');
			const oldWindow = frame.contentWindow!;
			const { sent, openMessage } = harness.handshake(frame);
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
				await unmount(harness.component!);
				harness.component = undefined;
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
			expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
				['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
			]);
			expect(harness.launchRequests()).toEqual([]);
		}
	);

	it('rejects the mounted sender, binding and schema matrix atomically', async () => {
		await harness.open();
		await harness.ready('report.docx');
		const frame = await harness.selectAndEdit('report.docx');
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
		expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
			['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
		]);
		expect(harness.launchRequests()).toEqual([]);
		sibling.remove();
	});

	it.each(['', 'default', 'temporary:new', 'local:new', 'channel:new'])(
		'keeps unsaved chat %s off the editor and network',
		async (id) => {
			await harness.open(true, id);
			expect(document.querySelector('[aria-label="Edit"]')).toBeNull();
			expect(document.querySelector('iframe')).toBeNull();
			expect(harness.calls).toEqual([]);
			expect(get(ocuOffice)).toEqual({});
		}
	);

	it('keeps disabled workspace off the editor and network', async () => {
		await harness.open(false);
		expect(document.querySelector('[aria-label="Edit"]')).toBeNull();
		expect(document.querySelector('iframe')).toBeNull();
		expect(harness.calls).toEqual([]);
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
					[WORKSPACE_RECONCILIATION, harness.controller]
				])
			});
			try {
				harness.controller.observe(chat, true);
				await harness.ready('report.docx');
				const frame = await harness.selectAndEdit('report.docx');
				const source = frame.contentWindow!;
				const { openMessage, sent } = harness.handshake(frame);
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
				expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
					['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
				]);
			} finally {
				mounted.$destroy();
			}
		}
	);
});
