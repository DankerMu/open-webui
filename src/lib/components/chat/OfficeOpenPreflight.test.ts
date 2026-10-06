// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import type { OfficeVersions } from '$lib/apis/ocu/office';
import { chat, json } from '../../../../test/ocu-workspace-fixtures';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	namedButton,
	namedControl,
	officeDocx,
	officeXlsx,
	htmlFile,
	postOfficeState,
	publishedOfficeVersions,
	readyEditorFrame
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();
const versionsUrl = `/ocu/api/office/${chat}/documents/report.docx/versions`;
const unpublished: OfficeVersions = {
	file_id: 'report.docx',
	published_version: 7,
	open_session: null,
	versions: [
		{
			number: 7,
			parent: null,
			source: 'workspace',
			sha256: 'a'.repeat(64),
			size: 1024,
			created_at: '2026-10-01T09:00:00Z',
			published: true
		},
		{
			number: 8,
			parent: 7,
			source: 'autosave',
			sha256: 'b'.repeat(64),
			size: 2048,
			created_at: '2026-10-01T09:05:00Z',
			published: false
		}
	]
};

const restoreUrl = `/ocu/api/office/${chat}/documents/report.docx/restore`;
const resolveUrl = `/ocu/api/office/${chat}/sessions/ended-session/resolve`;
type HeldResponse = { promise: Promise<Response>; resolve: (response: Response) => void };
const choice = () => document.querySelector('[role="dialog"][aria-label="Unpublished content"]');
const conflict = () => document.querySelector('[role="dialog"][aria-label="Resolve conflict"]');
const requests = () => harness.officeRequests().map(({ url, init }) => [init?.method, url]);
const ended: OfficeVersions = {
	...unpublished,
	open_session: {
		session_id: 'ended-session',
		state: 'conflict',
		reason: 'baseline_mismatch',
		editor_ended: true
	}
};

function deferred() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function serve(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const fallback = harness.scenario;
	harness.scenario = (url, init) =>
		url.includes('/ocu/api/office/') ? handler(url, init) : fallback(url, init);
}

async function selectReport() {
	await harness.open();
	await harness.ready('report.docx');
	namedButton('report.docx').click();
	await tick();
}

async function showChoice() {
	await selectReport();
	editAction()!.click();
	await vi.waitFor(() => expect(choice()).not.toBeNull());
}

async function showConflict() {
	await selectReport();
	editAction()!.click();
	await vi.waitFor(() => expect(conflict()).not.toBeNull());
	expect(choice()).toBeNull();
	expect(editorFrame('report.docx')).toBeNull();
	expect(get(ocuOffice)[chat]).toBeUndefined();
}

async function deliver(gate: HeldResponse, response: Response) {
	const consumed = vi.spyOn(response, 'json');
	gate.resolve(response);
	await vi.waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
	await consumed.mock.results[0].value;
	await tick();
}

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('Office open-time preflight', () => {
	it('reads versions before opening an editor and offers unpublished content without a frame', async () => {
		let release!: (response: Response) => void;
		const heldVersions = new Promise<Response>((resolve) => {
			release = resolve;
		});
		const workspaceScenario = harness.scenario;
		harness.scenario = (input, init) =>
			input === versionsUrl && init?.method === 'GET'
				? heldVersions
				: workspaceScenario(input, init);

		try {
			await harness.open();
			await harness.ready('report.docx');
			namedButton('report.docx').click();
			await tick();
			expect(editAction()).toBeDefined();
			expect(harness.officeRequests()).toEqual([]);
			expect(editorFrame('report.docx')).toBeNull();

			editAction()!.click();
			await tick();
			expect({
				requests: harness.officeRequests().map(({ url, init }) => ({
					url,
					method: init?.method
				})),
				editorMounted: editorFrame('report.docx') !== null
			}).toEqual({
				requests: [{ url: versionsUrl, method: 'GET' }],
				editorMounted: false
			});
			expect(document.querySelector('[role="dialog"]')).toBeNull();

			release(json(unpublished));
			await vi.waitFor(() =>
				expect(
					document.querySelector('[role="dialog"][aria-label="Unpublished content"]')
				).not.toBeNull()
			);
			const dialog = document.querySelector('[role="dialog"][aria-label="Unpublished content"]')!;
			for (const choice of [
				'Restore the unpublished content',
				'Start from the current file',
				'Close'
			]) {
				expect(dialog.contains(namedButton(choice)), choice).toBe(true);
			}
			expect(editorFrame('report.docx')).toBeNull();
			expect(
				harness.officeRequests().map(({ url, init }) => ({ url, method: init?.method }))
			).toEqual([{ url: versionsUrl, method: 'GET' }]);
		} finally {
			release(json(unpublished));
			await tick();
		}
	});
});

describe('Office unpublished choices and admission', () => {
	it('restores the captured newest number once and opens only after success', async () => {
		const mutation = deferred();
		serve((url) =>
			url === restoreUrl
				? mutation.promise
				: json({
						...unpublished,
						versions: [...unpublished.versions].reverse()
					})
		);
		await showChoice();
		const restore = namedButton('Restore the unpublished content');
		restore.click();
		restore.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		editAction()!.click();
		namedButton('Start from the current file').dispatchEvent(
			new MouseEvent('click', { bubbles: true })
		);
		await tick();
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['POST', restoreUrl]
		]);
		const post = harness.officeRequests()[1];
		expect(JSON.parse(String(post.init?.body))).toEqual({ number: 8 });
		expect(post.init?.headers).toEqual({
			'Content-Type': 'application/json',
			'X-Requested-With': 'ocu-workspace'
		});
		expect(editorFrame('report.docx')).toBeNull();
		expect(get(ocuOffice)[chat]).toBeUndefined();
		await deliver(mutation, json({ file_id: 'report.docx', number: 9, published: true }));
		await readyEditorFrame('report.docx');
		expect(choice()).toBeNull();
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['POST', restoreUrl]
		]);
	});

	it('starts from the current file without restore or extra versions reads', async () => {
		serve(() => json(unpublished));
		await showChoice();
		const start = namedButton('Start from the current file');
		start.click();
		start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await readyEditorFrame('report.docx');
		expect(choice()).toBeNull();
		expect(requests()).toEqual([['GET', versionsUrl]]);
	});

	it.each(['button', 'escape'] as const)(
		'dismisses by %s without requests or a frame',
		async (method) => {
			serve(() => json(unpublished));
			await showChoice();
			const restore = namedButton('Restore the unpublished content');
			if (method === 'button') namedButton('Close').click();
			else choice()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			restore.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await tick();
			expect(choice()).toBeNull();
			expect(editorFrame('report.docx')).toBeNull();
			expect(requests()).toEqual([['GET', versionsUrl]]);
			editAction()!.click();
			await vi.waitFor(() => expect(choice()).not.toBeNull());
			expect(requests()).toEqual([
				['GET', versionsUrl],
				['GET', versionsUrl]
			]);
		}
	);

	it.each(['open_session', 'unknown_file', 'workspace_missing'] as const)(
		'keeps both choices and no frame after restore refusal %s',
		async (reason) => {
			serve((url) => (url === restoreUrl ? json({ reason }, 409) : json(unpublished)));
			await showChoice();
			namedButton('Restore the unpublished content').click();
			await vi.waitFor(() =>
				expect(choice()?.querySelector('[role="alert"]')?.textContent).toBe(
					`Restore was refused: ${reason}`
				)
			);
			expect(namedButton('Restore the unpublished content').disabled).toBe(false);
			expect(namedButton('Start from the current file').disabled).toBe(false);
			expect(editorFrame('report.docx')).toBeNull();
			expect(requests()).toEqual([
				['GET', versionsUrl],
				['POST', restoreUrl]
			]);
			namedButton('Start from the current file').click();
			await readyEditorFrame('report.docx');
			expect(requests()).toEqual([
				['GET', versionsUrl],
				['POST', restoreUrl]
			]);
		}
	);

	it.each([
		{
			label: 'empty history',
			response: {
				file_id: 'report.docx',
				published_version: null,
				open_session: null,
				versions: []
			}
		},
		{ label: 'published newest', response: publishedOfficeVersions() },
		{
			label: 'live editing',
			response: {
				...unpublished,
				open_session: { session_id: 'live', state: 'editing', reason: null, editor_ended: false }
			}
		},
		{
			label: 'live conflict',
			response: { ...ended, open_session: { ...ended.open_session!, editor_ended: false } }
		}
	])('opens after the versions read without a choice for $label', async ({ response }) => {
		const read = deferred();
		serve(() => read.promise);
		await selectReport();
		editAction()!.click();
		editAction()!.click();
		await tick();
		expect(requests()).toEqual([['GET', versionsUrl]]);
		expect(editorFrame('report.docx')).toBeNull();
		await deliver(read, json(response));
		await readyEditorFrame('report.docx');
		expect(choice()).toBeNull();
		expect(conflict()).toBeNull();
		expect(requests()).toEqual([['GET', versionsUrl]]);
	});

	it('fails closed on read refusal and coalesces explicit Retry into a fresh read', async () => {
		const retry = deferred();
		let reads = 0;
		serve(() => (++reads === 1 ? json({ reason: 'state_corrupt' }, 503) : retry.promise));
		await selectReport();
		editAction()!.click();
		await vi.waitFor(() =>
			expect(document.querySelector('[role="alert"]')?.textContent).toBe(
				'Versions could not be loaded: state_corrupt'
			)
		);
		expect(editorFrame('report.docx')).toBeNull();
		expect(get(ocuOffice)[chat]).toBeUndefined();
		const button = namedButton('Retry');
		button.click();
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		editAction()!.click();
		await tick();
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		await deliver(retry, json(unpublished));
		await vi.waitFor(() => expect(choice()).not.toBeNull());
		expect(editorFrame('report.docx')).toBeNull();
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});

	it('fails closed on a missing versions body instead of opening an editor', async () => {
		serve(() => new Response('null', { headers: { 'Content-Type': 'application/json' } }));
		await selectReport();
		editAction()!.click();
		await vi.waitFor(() =>
			expect(document.querySelector('[role="alert"]')?.textContent).toBe(
				'Versions could not be loaded: request_failed'
			)
		);
		expect(editorFrame('report.docx')).toBeNull();
		expect(namedControl('Retry')).toBeDefined();
		expect(requests()).toEqual([['GET', versionsUrl]]);
	});
});

describe('Office ended-conflict preflight authority', () => {
	it.each(['save_as', 'overwrite'] as const)(
		'resolves %s without editor state, selection changes or an automatic open',
		async (action) => {
			const mutation = deferred();
			serve((url) => (url === resolveUrl ? mutation.promise : json(ended)));
			await showConflict();
			if (action === 'overwrite') {
				namedButton('Overwrite workspace file').click();
				expect(requests()).toEqual([['GET', versionsUrl]]);
				await tick();
				namedButton('Confirm overwrite').click();
			} else namedButton('Save as new file').click();
			editAction()!.click();
			namedButton('Save as new file').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await tick();
			expect(requests()).toEqual([
				['GET', versionsUrl],
				['POST', resolveUrl]
			]);
			expect(JSON.parse(String(harness.officeRequests()[1].init?.body))).toEqual({ action });
			expect(editorFrame('report.docx')).toBeNull();
			await deliver(
				mutation,
				json({
					session_id: 'ended-session',
					state: 'closed',
					file_id: 'copy',
					path: 'report (edited).docx'
				})
			);
			await vi.waitFor(() => expect(conflict()).toBeNull());
			expect(choice()).toBeNull();
			expect(editorFrame('report.docx')).toBeNull();
			expect(get(ocuOffice)[chat]).toBeUndefined();
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
			expect(requests()).toEqual([
				['GET', versionsUrl],
				['POST', resolveUrl]
			]);
			serve(() => json(publishedOfficeVersions()));
			editAction()!.click();
			await readyEditorFrame('report.docx');
			expect(requests()).toEqual([
				['GET', versionsUrl],
				['POST', resolveUrl],
				['GET', versionsUrl]
			]);
		}
	);

	it('uses the selected file on the next explicit Edit after an ended conflict resolves', async () => {
		harness.setListing([officeDocx, officeXlsx, htmlFile]);
		serve((url) =>
			url === resolveUrl
				? json({ session_id: 'ended-session', state: 'closed', file_id: 'copy', path: 'copy.docx' })
				: url === versionsUrl
					? json(ended)
					: json(publishedOfficeVersions('sheet.xlsx'))
		);
		await showConflict();
		namedButton('Save as new file').click();
		await vi.waitFor(() => expect(conflict()).toBeNull());
		namedButton('sheet.xlsx').click();
		await tick();
		editAction()!.click();
		await readyEditorFrame('sheet.xlsx');
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['POST', resolveUrl],
			['GET', `/ocu/api/office/${chat}/documents/sheet.xlsx/versions`]
		]);
	});

	it('offers only Save as for a path-missing ended conflict and preserves literal resolve refusal', async () => {
		serve((url) =>
			url === resolveUrl
				? json({ reason: 'storage_low' }, 507)
				: json({ ...ended, open_session: { ...ended.open_session!, reason: 'path_missing' } })
		);
		await showConflict();
		expect(namedControl('Overwrite workspace file')).toBeUndefined();
		namedButton('Save as new file').click();
		await vi.waitFor(() =>
			expect(conflict()?.querySelector('[role="alert"]')?.textContent).toBe(
				'Resolve was refused: storage_low'
			)
		);
		expect(namedButton('Save as new file').disabled).toBe(false);
		expect(editorFrame('report.docx')).toBeNull();
		expect(choice()).toBeNull();
	});

	it('shows terminal workspace-missing without a choice or frame', async () => {
		serve((url) => (url === resolveUrl ? json({ reason: 'workspace_missing' }, 404) : json(ended)));
		await showConflict();
		namedButton('Save as new file').click();
		await vi.waitFor(() =>
			expect(document.querySelector('[role="alert"]')?.textContent).toBe(
				'The workspace files are gone. Your content is kept in the version store.'
			)
		);
		expect(conflict()).toBeNull();
		expect(choice()).toBeNull();
		expect(editorFrame('report.docx')).toBeNull();
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['POST', resolveUrl]
		]);
	});

	it('dismisses and reopens an ended conflict without another versions read', async () => {
		serve(() => json(ended));
		await showConflict();
		const save = namedButton('Save as new file');
		namedButton('Close conflict dialog').click();
		save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await tick();
		expect(conflict()).toBeNull();
		expect(choice()).toBeNull();
		expect(requests()).toEqual([['GET', versionsUrl]]);
		expect(editorFrame('report.docx')).toBeNull();
		expect(get(ocuOffice)[chat]).toBeUndefined();
		namedButton('Resolve conflict').click();
		await vi.waitFor(() => expect(conflict()).not.toBeNull());
		expect(conflict()!.contains(namedButton('Save as new file'))).toBe(true);
		expect(conflict()!.contains(namedButton('Overwrite workspace file'))).toBe(true);
		expect(editorFrame('report.docx')).toBeNull();
		expect(get(ocuOffice)[chat]).toBeUndefined();
		expect(requests()).toEqual([['GET', versionsUrl]]);
	});
});

describe('Office stale-session activation budget', () => {
	it('retires the first refused frame without a banner and rechecks before offering the choice', async () => {
		const fresh = deferred();
		let reads = 0;
		serve(() =>
			++reads === 1
				? json({
						...unpublished,
						open_session: {
							session_id: 'stale',
							state: 'editing',
							reason: null,
							editor_ended: false
						}
					})
				: fresh.promise
		);
		await selectReport();
		editAction()!.click();
		const frame = await readyEditorFrame('report.docx');
		const { openMessage, sent } = harness.handshake(frame);
		const oldSource = frame.contentWindow;
		postOfficeState(frame, openMessage.generation, {
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version'
		});
		await tick();
		expect(editorFrame('report.docx')).toBeNull();
		expect(document.body.textContent).not.toContain('Editing was refused');
		expect(choice()).toBeNull();
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		const snapshot = get(ocuOffice);
		postOfficeState(
			frame,
			openMessage.generation,
			{
				state: 'refused',
				session_id: null,
				reason: 'unpublished_version'
			},
			oldSource
		);
		expect(get(ocuOffice)).toBe(snapshot);
		expect(sent).toHaveBeenCalledTimes(1);
		await deliver(fresh, json(unpublished));
		await vi.waitFor(() => expect(choice()).not.toBeNull());
		namedButton('Start from the current file').click();
		const replacement = await readyEditorFrame('report.docx');
		expect(replacement).not.toBe(frame);
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		await harness.acceptEditing(replacement, 'replacement');
		expect(get(ocuOffice)[chat].state).toBe('editing');
	});

	it('bounds the recheck across replacement frames and resets it only on explicit Retry', async () => {
		serve(() => json(publishedOfficeVersions()));
		await selectReport();
		editAction()!.click();
		const first = await readyEditorFrame('report.docx');
		const firstOpen = harness.handshake(first).openMessage;
		postOfficeState(first, firstOpen.generation, {
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version'
		});
		const second = await readyEditorFrame('report.docx');
		expect(second).not.toBe(first);
		const secondOpen = harness.handshake(second).openMessage;
		const oldSource = second.contentWindow;
		postOfficeState(second, secondOpen.generation, {
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version'
		});
		await vi.waitFor(() =>
			expect(document.querySelector('[role="alert"]')?.textContent).toBe(
				'Editing was refused: unpublished_version'
			)
		);
		expect(editorFrame('report.docx')).toBeNull();
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		const retired = get(ocuOffice)[chat];
		expect(retired.state).not.toBe('refused');
		namedButton('Retry').click();
		postOfficeState(
			second,
			secondOpen.generation,
			{
				state: 'refused',
				session_id: null,
				reason: 'unpublished_version'
			},
			oldSource
		);
		const third = await readyEditorFrame('report.docx');
		const thirdOpen = harness.handshake(third).openMessage;
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		postOfficeState(third, thirdOpen.generation, {
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version'
		});
		const fourth = await readyEditorFrame('report.docx');
		expect(fourth).not.toBe(third);
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl],
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		expect(document.body.textContent).not.toContain('Editing was refused');
	});

	it('does not let a retained refused store snapshot consume a fresh activation allowance', async () => {
		serve(() => json(publishedOfficeVersions()));
		await selectReport();
		editAction()!.click();
		const first = await readyEditorFrame('report.docx');
		const generation = harness.handshake(first).openMessage.generation;
		postOfficeState(first, generation, {
			state: 'refused',
			session_id: null,
			reason: 'unsupported_type'
		});
		await tick();
		const snapshot = get(ocuOffice)[chat];
		expect(snapshot.state).toBe('refused');
		editAction()!.click();
		ocuOffice.update((states) => ({
			...states,
			[chat]: { ...snapshot, reason: 'unpublished_version' }
		}));
		const next = await readyEditorFrame('report.docx');
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		const nextGeneration = harness.handshake(next).openMessage.generation;
		postOfficeState(next, nextGeneration, {
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version'
		});
		await readyEditorFrame('report.docx');
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		expect(document.body.textContent).not.toContain('Editing was refused');
	});

	it('ignores forged special refusals without consuming the valid frame allowance', async () => {
		serve(() => json(publishedOfficeVersions()));
		await selectReport();
		editAction()!.click();
		const frame = await readyEditorFrame('report.docx');
		const generation = harness.handshake(frame).openMessage.generation;
		const sibling = document.createElement('iframe');
		document.body.append(sibling);
		const message = {
			type: 'ocu:office-state',
			chat_id: chat,
			file_id: 'report.docx',
			generation,
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version',
			dirty: false,
			workspace_changed: false
		};
		const snapshot = get(ocuOffice);
		for (const extra of [
			{ source: sibling.contentWindow },
			{ origin: 'https://other.example' },
			{ data: { ...message, generation: generation - 1 } },
			{ data: { ...message, file_id: 'other' } },
			{ data: { ...message, extra: true } }
		]) {
			window.dispatchEvent(
				new MessageEvent('message', {
					origin: window.location.origin,
					source: frame.contentWindow,
					data: message,
					...extra
				})
			);
		}
		await tick();
		expect(get(ocuOffice)).toBe(snapshot);
		expect(editorFrame('report.docx')).toBe(frame);
		expect(requests()).toEqual([['GET', versionsUrl]]);
		postOfficeState(frame, generation, {
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version'
		});
		await readyEditorFrame('report.docx');
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		expect(document.body.textContent).not.toContain('Editing was refused');
	});
});

describe('Office captured prompt controls', () => {
	it('ignores an old choice and restore completion after a new activation shows its own choice', async () => {
		const warnings = vi.spyOn(console, 'warn');
		const old = deferred();
		serve((url) => (url === restoreUrl ? old.promise : json(unpublished)));
		await showChoice();
		const restore = namedButton('Restore the unpublished content');
		const start = namedButton('Start from the current file');
		const close = namedButton('Close');
		restore.click();
		close.click();
		await tick();
		editAction()!.click();
		await vi.waitFor(() => expect(choice()).not.toBeNull());
		restore.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await deliver(old, json({ reason: 'storage_low' }, 507));
		expect(choice()).not.toBeNull();
		expect(choice()?.querySelector('[role="alert"]')).toBeNull();
		expect(editorFrame('report.docx')).toBeNull();
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['POST', restoreUrl],
			['GET', versionsUrl]
		]);
		namedButton('Start from the current file').click();
		await readyEditorFrame('report.docx');
		expect(warnings).not.toHaveBeenCalled();
	});

	it('does not let an old Retry replace a newer activation or spend its recheck allowance', async () => {
		const warnings = vi.spyOn(console, 'warn');
		let reads = 0;
		serve(() =>
			++reads === 1 ? json({ reason: 'state_corrupt' }, 503) : json(publishedOfficeVersions())
		);
		await selectReport();
		editAction()!.click();
		await vi.waitFor(() => expect(namedControl('Retry')).toBeDefined());
		const retry = namedButton('Retry');
		retry.click();
		const frame = await readyEditorFrame('report.docx');
		retry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await tick();
		expect(editorFrame('report.docx')).toBe(frame);
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		const generation = harness.handshake(frame).openMessage.generation;
		postOfficeState(frame, generation, {
			state: 'refused',
			session_id: null,
			reason: 'unpublished_version'
		});
		await readyEditorFrame('report.docx');
		expect(requests()).toEqual([
			['GET', versionsUrl],
			['GET', versionsUrl],
			['GET', versionsUrl]
		]);
		expect(document.body.textContent).not.toContain('Editing was refused');
		expect(warnings).not.toHaveBeenCalled();
	});
});
