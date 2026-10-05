// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import { WORKSPACE_RECONCILIATION } from './workspace-reconciliation';
import { get } from 'svelte/store';
import { config } from '$lib/stores';
import { applyWorkspaceListing, ocuWorkspaces, selectWorkspaceView } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import type { OfficeVersions } from '$lib/apis/ocu/office';
import { chat, describeBody, i18n, json } from '../../../../test/ocu-workspace-fixtures';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	namedButton,
	namedControl,
	officeConfig,
	officeDocx,
	officeXlsx,
	htmlFile,
	maximizeControl,
	officeCommandCalls,
	postOfficeState,
	saveControl,
	publishedOfficeVersions,
	readyEditorFrame
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();

const versionsUrl = `/ocu/api/office/${chat}/documents/report.docx/versions`;
const restoreUrl = `/ocu/api/office/${chat}/documents/report.docx/restore`;
const history = () => document.querySelector('[role="region"][aria-label="Version history"]');
const rows = () =>
	[...(history()?.querySelectorAll('tbody tr') ?? [])].map((row) =>
		[...row.querySelectorAll('td')].slice(0, 4).map((cell) => cell.textContent)
	);
const originalRows = [
	['1', '2026-10-01T09:00:00Z', 'workspace', 'false'],
	['2', '2026-10-01T09:01:00Z', 'save', 'true'],
	['3', '2026-10-01T09:02:00Z', 'autosave', 'false']
];
const payload: OfficeVersions = {
	file_id: 'report.docx',
	published_version: 2,
	open_session: null,
	versions: [
		{
			number: 1,
			parent: null,
			source: 'workspace',
			sha256: 'a'.repeat(64),
			size: 10,
			created_at: '2026-10-01T09:00:00Z',
			published: false
		},
		{
			number: 2,
			parent: 1,
			source: 'save',
			sha256: 'b'.repeat(64),
			size: 20,
			created_at: '2026-10-01T09:01:00Z',
			published: true
		},
		{
			number: 3,
			parent: 2,
			source: 'autosave',
			sha256: 'c'.repeat(64),
			size: 30,
			created_at: '2026-10-01T09:02:00Z',
			published: false
		}
	]
};
const restoredPayload: OfficeVersions = {
	...payload,
	published_version: 4,
	versions: [
		...payload.versions,
		{
			number: 4,
			parent: 3,
			source: 'restore',
			sha256: 'a'.repeat(64),
			size: 10,
			created_at: '2026-10-01T09:03:00Z',
			published: true
		}
	]
};

function deferred() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function serveOffice(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const workspaceScenario = harness.scenario;
	harness.scenario = (url, init) =>
		url.includes('/ocu/api/office/') ? handler(url, init) : workspaceScenario(url, init);
}

async function selectedReport() {
	await harness.open();
	await harness.ready('report.docx');
	namedButton('report.docx').click();
	await tick();
}

async function openHistory() {
	namedButton('Version history').click();
	await vi.waitFor(() => expect(rows()).toEqual(originalRows));
}

async function deliver(gate: { resolve: (response: Response) => void }, response: Response) {
	const consumed = vi.spyOn(response, 'json');
	gate.resolve(response);
	await vi.waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
	await consumed.mock.results[0].value;
	await tick();
}

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('Office version history', () => {
	it('opens fetched version history from the selected file without opening an editor', async () => {
		const versionsUrl = `/ocu/api/office/${chat}/documents/report.docx/versions`;
		const versions: OfficeVersions = {
			file_id: 'report.docx',
			published_version: null,
			open_session: null,
			versions: [
				{
					number: 7,
					parent: null,
					source: 'workspace',
					sha256: 'a'.repeat(64),
					size: 1024,
					created_at: '2026-10-01T09:15:00Z',
					published: false
				}
			]
		};
		const workspaceScenario = harness.scenario;
		harness.scenario = (input, init) =>
			input === versionsUrl ? json(versions) : workspaceScenario(input, init);

		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		expect(editAction()).toBeDefined();
		expect(editorFrame('report.docx')).toBeNull();
		expect(harness.officeRequests()).toEqual([]);

		namedButton('Version history').click();
		await vi.waitFor(() => {
			const history = document.querySelector('[role="region"][aria-label="Version history"]');
			expect(history).not.toBeNull();
			expect(history!.contains(namedButton('Restore version 7'))).toBe(true);
		});
		expect(editorFrame('report.docx')).toBeNull();
		expect(
			harness.officeRequests().map(({ url, init }) => ({ url, method: init?.method }))
		).toEqual([{ url: versionsUrl, method: 'GET' }]);
	});
});

describe('Office history restoration and lifetime', () => {
	it('lists broker numbers, times, sources and literal publication flags without deriving them from source', async () => {
		serveOffice(() => json(payload));
		await selectedReport();
		await openHistory();
		expect([...history()!.querySelectorAll('time')].map((time) => time.dateTime)).toEqual([
			'2026-10-01T09:00:00Z',
			'2026-10-01T09:01:00Z',
			'2026-10-01T09:02:00Z'
		]);
		expect(namedButton('Restore version 1').disabled).toBe(false);
		expect(harness.officeRequests().map((call) => call.url)).toEqual([versionsUrl]);
		expect(editorFrame('report.docx')).toBeNull();
	});

	it('disables restore even before editor state arrives and preserves the live frame, document and commands', async () => {
		let reads = 0;
		serveOffice(() => json(++reads === 1 ? publishedOfficeVersions() : payload));
		await selectedReport();
		editAction()!.click();
		await readyEditorFrame('report.docx');
		const frame = editorFrame('report.docx')!;
		const documentBefore = frame.contentDocument;
		const snapshot = get(ocuOffice)[chat];
		expect(get(ocuOffice)[chat].state).toBeUndefined();
		expect(
			document.querySelector('[data-office-status]')!.contains(namedButton('Version history'))
		).toBe(true);
		await openHistory();
		expect(history()!.textContent).toContain(
			'Close the editor on this document before restoring a version.'
		);
		expect(namedButton('Restore version 1').disabled).toBe(true);
		namedButton('Restore version 1').click();
		await tick();
		expect(harness.officeRequests().map((call) => call.url)).toEqual([versionsUrl, versionsUrl]);
		expect(editorFrame('report.docx')).toBe(frame);
		expect(frame.contentDocument).toBe(documentBefore);
		expect(get(ocuOffice)[chat]).toEqual(snapshot);
		const { sent, openMessage } = harness.handshake(frame);
		postOfficeState(frame, openMessage.generation, { dirty: true });
		await tick();
		maximizeControl()!.click();
		await tick();
		expect(history()).not.toBeNull();
		saveControl()!.click();
		expect(officeCommandCalls(sent).map((call) => call[0])).toEqual([
			{
				type: 'ocu:office-command',
				chat_id: chat,
				generation: openMessage.generation,
				command: 'save'
			}
		]);
		namedButton('Close version history').click();
		await tick();
		expect(history()).toBeNull();
		expect(editorFrame('report.docx')).toBe(frame);
		expect(frame.contentDocument).toBe(documentBefore);
		expect(get(ocuOffice)[chat]).toMatchObject({
			generation: openMessage.generation,
			sessionId: 'sess-1'
		});
	});

	it('submits one chosen version with mutation authority and waits for the authoritative reload before enabling another restore', async () => {
		const mutation = deferred();
		const refresh = deferred();
		let reads = 0;
		serveOffice((url) =>
			url === restoreUrl ? mutation.promise : ++reads === 1 ? json(payload) : refresh.promise
		);
		await selectedReport();
		await openHistory();
		const restore = namedButton('Restore version 1');
		restore.click();
		restore.click();
		await tick();
		expect(namedButton('Restore version 2').disabled).toBe(true);
		const posts = harness.officeRequests().filter((call) => call.init?.method === 'POST');
		expect(posts).toHaveLength(1);
		expect(posts[0].url).toBe(restoreUrl);
		expect(JSON.parse(String(posts[0].init!.body))).toEqual({ number: 1 });
		expect(new Headers(posts[0].init!.headers).get('X-Requested-With')).toBe('ocu-workspace');
		mutation.resolve(json({ file_id: 'report.docx', number: 4, published: true }));
		await vi.waitFor(() => expect(reads).toBe(2));
		expect(rows()).toEqual(originalRows);
		expect(namedButton('Restore version 1').disabled).toBe(true);
		refresh.resolve(json(restoredPayload));
		await vi.waitFor(() =>
			expect(rows()).toEqual([...originalRows, ['4', '2026-10-01T09:03:00Z', 'restore', 'true']])
		);
		expect(namedButton('Restore version 1').disabled).toBe(false);
		expect(harness.officeRequests().map((call) => call.init?.method)).toEqual([
			'GET',
			'POST',
			'GET'
		]);
	});

	it.each(['session_open', 'workspace_missing', '<unknown_reason>'])(
		'leaves remote-session restoration to the broker and conserves rows on %s refusal',
		async (reason) => {
			const remote: OfficeVersions = {
				...payload,
				open_session: {
					session_id: 'remote-session',
					state: 'editing',
					reason: null,
					editor_ended: false
				}
			};
			serveOffice((url) => (url === restoreUrl ? json({ reason }, 409) : json(remote)));
			await selectedReport();
			await openHistory();
			expect(namedButton('Restore version 2').disabled).toBe(false);
			namedButton('Restore version 2').click();
			await vi.waitFor(() =>
				expect(history()!.querySelector('[role="alert"]')!.textContent).toContain(reason)
			);
			expect(rows()).toEqual(originalRows);
			expect(harness.officeRequests().map((call) => call.init?.method)).toEqual(['GET', 'POST']);
			expect(namedButton('Restore version 2').disabled).toBe(false);
			expect(editorFrame('report.docx')).toBeNull();
		}
	);

	it('reports accepted restore followed by failed history reload without fabricating a version or calling it a refusal', async () => {
		let reads = 0;
		serveOffice((url) =>
			url === restoreUrl
				? json({ file_id: 'report.docx', number: 4, published: true })
				: ++reads === 1
					? json(payload)
					: json({ reason: 'history_unavailable' }, 503)
		);
		await selectedReport();
		await openHistory();
		namedButton('Restore version 1').click();
		await vi.waitFor(() =>
			expect(history()!.querySelector('[role="alert"]')!.textContent).toBe(
				'Restore succeeded, but history could not be reloaded: history_unavailable'
			)
		);
		expect(rows()).toEqual(originalRows);
		expect(history()!.textContent).not.toContain('Restore was refused');
		expect(harness.officeRequests().map((call) => call.init?.method)).toEqual([
			'GET',
			'POST',
			'GET'
		]);
	});

	it('shows a failed initial read rather than inventing history rows', async () => {
		serveOffice(() => json({ reason: 'unknown_file' }, 404));
		await selectedReport();
		namedButton('Version history').click();
		await vi.waitFor(() =>
			expect(history()!.querySelector('[role="alert"]')!.textContent).toBe(
				'History could not be loaded: unknown_file'
			)
		);
		expect(rows()).toEqual([]);
		expect(namedControl('Restore version 1')).toBeUndefined();
	});

	it('does not reload history for same-ID metadata and revision changes', async () => {
		serveOffice(() => json(payload));
		await selectedReport();
		await openHistory();
		const state = get(ocuWorkspaces)[chat];
		applyWorkspaceListing(
			chat,
			state.generation,
			[
				{
					...officeDocx,
					name: 'renamed.docx',
					path: 'renamed.docx',
					url: `/ocu/files/${chat}/renamed.docx`,
					revision: 9
				},
				htmlFile
			],
			9,
			null
		);
		await tick();
		expect(rows()).toEqual(originalRows);
		expect(harness.officeRequests().map((call) => call.url)).toEqual([versionsUrl]);
		namedButton('Restore version 1').click();
		await vi.waitFor(() =>
			expect(harness.officeRequests().filter((call) => call.url === restoreUrl)).toHaveLength(1)
		);
	});

	it.each([undefined, false] as const)(
		'has no history entry when Office discovery is %s',
		async (office) => {
			config.set(officeConfig(office));
			await selectedReport();
			expect(namedControl('Version history')).toBeUndefined();
			expect(harness.officeRequests()).toEqual([]);
		}
	);

	it('has no history entry for a non-Office file', async () => {
		await selectedReport();
		namedButton('page.html').click();
		await tick();
		expect(namedControl('Version history')).toBeUndefined();
		expect(harness.officeRequests()).toEqual([]);
	});

	it.each(['close', 'selection', 'view', 'office flag', 'workspace flag', 'removal'] as const)(
		'invalidates a delayed initial read on %s without reopening history',
		async (transition) => {
			harness.setListing([officeDocx, officeXlsx, htmlFile], {
				...describeBody,
				views: ['files', 'browser']
			});
			const read = deferred();
			serveOffice(() => read.promise);
			await selectedReport();
			namedButton('Version history').click();
			await vi.waitFor(() => expect(harness.officeRequests()).toHaveLength(1));
			if (transition === 'close') namedButton('Close version history').click();
			if (transition === 'selection') namedButton('sheet.xlsx').click();
			if (transition === 'view') selectWorkspaceView(chat, 'browser');
			if (transition === 'office flag') config.set(officeConfig(false));
			if (transition === 'workspace flag') config.set(officeConfig(true, false));
			if (transition === 'removal') {
				const state = get(ocuWorkspaces)[chat];
				applyWorkspaceListing(chat, state.generation, [htmlFile], 2, null);
			}
			await tick();
			expect(history()).toBeNull();
			await deliver(read, json(payload));
			expect(history()).toBeNull();
			expect(harness.officeRequests()).toHaveLength(1);
		}
	);

	it.each(['success', 'refusal'] as const)(
		'ignores delayed restore %s after another file opens its own history and never reloads the retired file',
		async (outcome) => {
			harness.setListing([officeDocx, officeXlsx, htmlFile]);
			const mutation = deferred();
			const sheet: OfficeVersions = {
				file_id: 'sheet.xlsx',
				published_version: null,
				open_session: null,
				versions: []
			};
			serveOffice((url) =>
				url === restoreUrl ? mutation.promise : json(url === versionsUrl ? payload : sheet)
			);
			await selectedReport();
			await openHistory();
			namedButton('Restore version 1').click();
			await tick();
			namedButton('sheet.xlsx').click();
			await tick();
			expect(history()).toBeNull();
			namedButton('Version history').click();
			await vi.waitFor(() => expect(history()!.textContent).toContain('No versions available'));
			await deliver(
				mutation,
				outcome === 'success'
					? json({ file_id: 'report.docx', number: 4, published: true })
					: json({ reason: 'session_open' }, 409)
			);
			expect(history()!.textContent).toContain('No versions available');
			expect(history()!.querySelector('[role="alert"]')).toBeNull();
			expect(harness.officeRequests().map((call) => call.url)).toEqual([
				versionsUrl,
				restoreUrl,
				`/ocu/api/office/${chat}/documents/sheet.xlsx/versions`
			]);
		}
	);

	it('does not let a dismissed read overwrite a fresh opening of the same document', async () => {
		const oldRead = deferred();
		let reads = 0;
		serveOffice(() => (++reads === 1 ? oldRead.promise : json(payload)));
		await selectedReport();
		namedButton('Version history').click();
		await vi.waitFor(() => expect(reads).toBe(1));
		namedButton('Close version history').click();
		await tick();
		await openHistory();
		await deliver(oldRead, json({ ...payload, versions: [] }));
		expect(rows()).toEqual(originalRows);
		expect(reads).toBe(2);
	});
});

describe('Office history revocation during pending requests', () => {
	it.each(['close', 'view', 'office flag', 'workspace flag', 'removal'] as const)(
		'never reloads a restored document after history is revoked by %s',
		async (transition) => {
			harness.setListing([officeDocx, htmlFile], { ...describeBody, views: ['files', 'browser'] });
			const mutation = deferred();
			serveOffice((url) => (url === restoreUrl ? mutation.promise : json(payload)));
			await selectedReport();
			await openHistory();
			namedButton('Restore version 1').click();
			await tick();
			if (transition === 'close') namedButton('Close version history').click();
			if (transition === 'view') selectWorkspaceView(chat, 'browser');
			if (transition === 'office flag') config.set(officeConfig(false));
			if (transition === 'workspace flag') config.set(officeConfig(true, false));
			if (transition === 'removal') {
				const state = get(ocuWorkspaces)[chat];
				applyWorkspaceListing(chat, state.generation, [htmlFile], 2, null);
			}
			await tick();
			expect(history()).toBeNull();
			await deliver(mutation, json({ file_id: 'report.docx', number: 4, published: true }));
			expect(history()).toBeNull();
			expect(harness.officeRequests().map((call) => call.url)).toEqual([versionsUrl, restoreUrl]);
		}
	);

	it.each([
		{ prop: 'chat', operation: 'read' },
		{ prop: 'chat', operation: 'restore' },
		{ prop: 'enabled', operation: 'read' },
		{ prop: 'enabled', operation: 'restore' }
	])(
		'invalidates pending $operation when the mounted $prop changes',
		async ({ prop, operation }) => {
			const gate = deferred();
			serveOffice((url) =>
				operation === 'read' || url === restoreUrl ? gate.promise : json(payload)
			);
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
				namedButton('report.docx').click();
				await tick();
				if (operation === 'read') {
					namedButton('Version history').click();
					await vi.waitFor(() => expect(harness.officeRequests()).toHaveLength(1));
				} else {
					await openHistory();
					namedButton('Restore version 1').click();
					await tick();
				}
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
				expect(history()).toBeNull();
				await deliver(
					gate,
					operation === 'read'
						? json(payload)
						: json({ file_id: 'report.docx', number: 4, published: true })
				);
				expect(history()).toBeNull();
				expect(harness.officeRequests().map((call) => call.url)).toEqual(
					operation === 'read' ? [versionsUrl] : [versionsUrl, restoreUrl]
				);
			} finally {
				mounted.$destroy();
			}
		}
	);
});

describe('Office history admitted-document identity', () => {
	it('keeps history and its admitted frame through same-ID reclassification without reading again', async () => {
		let reads = 0;
		serveOffice(() => json(++reads === 1 ? publishedOfficeVersions() : payload));
		await selectedReport();
		const frame = await harness.selectAndEdit('report.docx');
		const documentBefore = frame.contentDocument;
		const { openMessage } = await harness.acceptEditing(frame);
		await openHistory();
		const state = get(ocuWorkspaces)[chat];
		applyWorkspaceListing(
			chat,
			state.generation,
			[harness.reclassifiedFile('report.html', 'html', 'text/html'), htmlFile],
			2,
			null
		);
		await tick();
		expect(rows()).toEqual(originalRows);
		expect(editorFrame('report.html')).toBe(frame);
		expect(frame.contentDocument).toBe(documentBefore);
		expect(namedButton('Restore version 1').disabled).toBe(true);
		expect(harness.officeRequests().map((call) => call.url)).toEqual([versionsUrl, versionsUrl]);
		namedButton('Close version history').click();
		await tick();
		await openHistory();
		expect(harness.officeRequests().map((call) => call.url)).toEqual([
			versionsUrl,
			versionsUrl,
			versionsUrl
		]);
		expect(get(ocuOffice)[chat]).toMatchObject({
			generation: openMessage.generation,
			sessionId: 'sess-1'
		});
	});
});
