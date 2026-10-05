// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { createClassComponent } from 'svelte/legacy';
import { config } from '$lib/stores';
import { ocuWorkspaces, selectWorkspaceView } from '$lib/stores/ocu';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import { WORKSPACE_RECONCILIATION } from './workspace-reconciliation';
import { ocuOffice } from '$lib/stores/ocu-office';
import { chat, i18n, json, listing } from '../../../../test/ocu-workspace-fixtures';
import {
	OfficeArtifactHarness,
	namedButton,
	editorFrame,
	maximizeControl,
	namedControl,
	officeCommandCalls,
	officeConfig,
	officeDocx,
	postOfficeState
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();
const resolveUrl = '/ocu/api/office/owner-chat/sessions/sess-1/resolve';
const resolveRequests = () =>
	harness.officeRequests().filter(({ url }) => url.endsWith('/resolve'));

function conflictDialog() {
	return [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog')].find((node) => {
		const labelledBy = node.getAttribute('aria-labelledby');
		const name = labelledBy
			? labelledBy
					.split(/\s+/)
					.map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
					.join(' ')
			: node.getAttribute('aria-label');
		return name === 'Resolve conflict';
	});
}

const savedAs = {
	session_id: 'sess-1',
	state: 'editing',
	file_id: 'new-copy-id',
	path: 'report (2).docx'
};

function respondToResolve(response: Response | Promise<Response>) {
	const workspaceScenario = harness.scenario;
	harness.scenario = (url, init) =>
		url.endsWith('/resolve') ? response : workspaceScenario(url, init);
}

async function releaseResolve(release: (response: Response) => void, response: Response) {
	const bodyRead = vi.spyOn(response, 'json');
	release(response);
	await vi.waitFor(() => expect(bodyRead).toHaveBeenCalledTimes(1));
	await bodyRead.mock.results[0].value;
	await tick();
}

async function openConflict(reason = 'baseline_mismatch') {
	await harness.open();
	await harness.ready('report.docx');
	const frame = await harness.selectAndEdit('report.docx');
	const handshake = await harness.acceptEditing(frame);
	postOfficeState(frame, handshake.openMessage.generation, {
		state: 'conflict',
		dirty: true,
		reason
	});
	await tick();
	expect(get(ocuOffice)[chat]).toMatchObject({
		fileId: 'report.docx',
		sessionId: 'sess-1',
		generation: handshake.openMessage.generation,
		state: 'conflict',
		reason
	});
	expect(conflictDialog()).toBeDefined();
	return { frame, ...handshake };
}

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('Office conflict dialog', () => {
	it('offers Save as new file for the accepted conflict and sends one save_as resolve', async () => {
		const workspaceScenario = harness.scenario;
		harness.scenario = (url, init) =>
			url === resolveUrl
				? json({
						session_id: 'sess-1',
						state: 'editing',
						file_id: 'report-conflict.docx',
						path: 'report-conflict.docx'
					})
				: workspaceScenario(url, init);

		await harness.open();
		await harness.ready('report.docx');
		const frame = await harness.selectAndEdit('report.docx');
		const { openMessage } = await harness.acceptEditing(frame);
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			workspace_changed: true,
			reason: 'workspace_changed'
		});
		await tick();

		expect(get(ocuOffice)[chat]).toMatchObject({
			fileId: officeDocx.file_id,
			sessionId: 'sess-1',
			generation: openMessage.generation,
			state: 'conflict',
			dirty: true,
			workspaceChanged: true,
			reason: 'workspace_changed'
		});
		expect(resolveRequests()).toEqual([]);

		const dialog = conflictDialog();
		expect(dialog, 'The accepted current conflict opens the Resolve conflict dialog').toBeDefined();
		const saveAs = namedButton('Save as new file');
		expect(dialog!.contains(saveAs)).toBe(true);
		expect(saveAs.disabled).toBe(false);
		expect(dialog!.contains(namedButton('Overwrite workspace file'))).toBe(true);
		saveAs.click();

		await vi.waitFor(() => expect(resolveRequests()).toHaveLength(1));
		const [request] = resolveRequests();
		expect(request.url).toBe(resolveUrl);
		expect(request.init).toMatchObject({
			method: 'POST',
			credentials: 'same-origin',
			cache: 'no-store',
			body: '{"action":"save_as"}'
		});
		const headers = new Headers(request.init?.headers);
		expect(headers.get('X-Requested-With')).toBe('ocu-workspace');
		expect(headers.get('Content-Type')).toBe('application/json');
	});
});

describe('Office conflict choices and lifetime', () => {
	it('focuses Save as new file and submits the safe default from the dialog', async () => {
		respondToResolve(json(savedAs));
		await openConflict();
		expect(document.activeElement).toBe(namedButton('Save as new file'));
		const form = conflictDialog()!.querySelector('form');
		expect(form).not.toBeNull();
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
		expect(resolveRequests().map(({ init }) => init?.body)).toEqual(['{"action":"save_as"}']);
	});

	it('requires a second explicit overwrite confirmation and sends nothing when declined', async () => {
		respondToResolve(json(savedAs));
		await openConflict();
		namedButton('Overwrite workspace file').click();
		await tick();
		expect(resolveRequests()).toEqual([]);
		namedButton('Cancel overwrite').click();
		await tick();
		expect(namedControl('Confirm overwrite')).toBeUndefined();
		expect(resolveRequests()).toEqual([]);
		namedButton('Overwrite workspace file').click();
		await tick();
		namedButton('Confirm overwrite').click();
		await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
		expect(resolveRequests().map(({ url, init }) => ({ url, body: init?.body }))).toEqual([
			{ url: resolveUrl, body: '{"action":"overwrite"}' }
		]);
	});

	it('offers only Save as new file when the original path is missing', async () => {
		respondToResolve(json(savedAs));
		await openConflict('path_missing');
		expect(namedControl('Overwrite workspace file')).toBeUndefined();
		expect(namedControl('Confirm overwrite')).toBeUndefined();
		namedButton('Save as new file').click();
		await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
		expect(resolveRequests().map(({ init }) => init?.body)).toEqual(['{"action":"save_as"}']);
	});

	it('invalidates overwrite confirmation when the reason becomes path_missing, even before a DOM flush', async () => {
		const { frame, openMessage } = await openConflict();
		namedButton('Overwrite workspace file').click();
		await tick();
		const staleConfirmation = namedButton('Confirm overwrite');
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'path_missing'
		});
		staleConfirmation.click();
		await tick();
		expect(resolveRequests()).toEqual([]);
		expect(namedControl('Confirm overwrite')).toBeUndefined();
		expect(namedControl('Overwrite workspace file')).toBeUndefined();
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		expect(namedControl('Overwrite workspace file')).toBeDefined();
		expect(namedControl('Confirm overwrite')).toBeUndefined();
	});

	it('dismisses without discarding content, stays dismissed on repeated conflict, and rearms on genuine reentry', async () => {
		const { frame, openMessage } = await openConflict();
		const offered = [...conflictDialog()!.querySelectorAll('button')].map(
			(button) => button.getAttribute('aria-label') ?? button.textContent?.trim()
		);
		expect(offered.sort()).toEqual([
			'Close conflict dialog',
			'Overwrite workspace file',
			'Save as new file'
		]);
		namedButton('Close conflict dialog').click();
		await tick();
		expect(conflictDialog()).toBeUndefined();
		expect(document.querySelector('[data-office-status]')?.textContent).toContain('Conflict');
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		expect(conflictDialog()).toBeUndefined();
		namedButton('Resolve conflict').click();
		await tick();
		expect(conflictDialog()).toBeDefined();
		namedButton('Close conflict dialog').click();
		postOfficeState(frame, openMessage.generation);
		await tick();
		expect(namedControl('Resolve conflict')).toBeUndefined();
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		expect(conflictDialog()).toBeDefined();
		expect(resolveRequests()).toEqual([]);
	});

	it.each([
		[409, 'unsafe_path'],
		[503, 'publish_timeout']
	] as const)(
		'keeps a refused resolve open with the literal %s reason %s and allows an explicit retry',
		async (status, reason) => {
			respondToResolve(json({ reason }, status));
			await openConflict();
			namedButton('Save as new file').click();
			await vi.waitFor(() =>
				expect(conflictDialog()?.querySelector('[role="alert"]')?.textContent).toContain(reason)
			);
			expect(conflictDialog()).toBeDefined();
			expect(namedButton('Save as new file').disabled).toBe(false);
			harness.scenario = (url) =>
				url.endsWith('/resolve') ? json(savedAs) : json(listing([officeDocx]));
			namedButton('Save as new file').click();
			await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
			expect(resolveRequests()).toHaveLength(2);
		}
	);

	it('closes workspace_missing with a content-kept message and quiesces repeated conflict and reentry', async () => {
		respondToResolve(json({ reason: 'workspace_missing' }, 409));
		const { frame, openMessage } = await openConflict();
		const saveAs = namedButton('Save as new file');
		saveAs.click();
		await vi.waitFor(() =>
			expect(document.querySelector('[role="alert"]')?.textContent).toBe(
				'The workspace files are gone. Your content is kept in the version store.'
			)
		);
		expect(conflictDialog()).toBeUndefined();
		expect(namedControl('Resolve conflict')).toBeUndefined();
		for (const state of ['conflict', 'editing', 'conflict']) {
			postOfficeState(frame, openMessage.generation, {
				state,
				dirty: true,
				reason: state === 'conflict' ? 'baseline_mismatch' : null
			});
			await tick();
			saveAs.click();
			expect(conflictDialog()).toBeUndefined();
			expect(namedControl('Resolve conflict')).toBeUndefined();
		}
		expect(resolveRequests()).toHaveLength(1);
	});

	it('coalesces repeated activation while resolving and does not reopen on the same conflict report', async () => {
		let release!: (response: Response) => void;
		respondToResolve(
			new Promise<Response>((resolve) => {
				release = resolve;
			})
		);
		const { frame, openMessage } = await openConflict();
		const saveAs = namedButton('Save as new file');
		saveAs.click();
		saveAs.click();
		const form = conflictDialog()!.querySelector('form');
		expect(form).not.toBeNull();
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();
		expect(saveAs.disabled).toBe(true);
		expect(namedButton('Overwrite workspace file').disabled).toBe(true);
		expect(resolveRequests()).toHaveLength(1);
		release(json(savedAs));
		await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch',
			workspace_changed: true
		});
		await tick();
		expect(conflictDialog()).toBeUndefined();
		expect(resolveRequests()).toHaveLength(1);
	});

	it('keeps the original editor binding and live document through save-as and authoritative Files refresh', async () => {
		respondToResolve(json(savedAs));
		const { frame, openMessage, sent } = await openConflict();
		const documentBefore = frame.contentDocument;
		const srcBefore = frame.src;
		maximizeControl()!.click();
		await tick();
		expect(
			document.querySelector('[aria-label="Selected workspace file"]')?.contains(conflictDialog()!)
		).toBe(true);
		namedButton('Save as new file').click();
		await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
		expect(get(ocuOffice)[chat]).toMatchObject({
			fileId: 'report.docx',
			sessionId: 'sess-1',
			generation: openMessage.generation,
			state: 'conflict',
			dirty: true
		});
		expect(document.querySelector('[data-office-status]')?.textContent).not.toContain('Saved');
		postOfficeState(frame, openMessage.generation);
		await tick();
		harness.setListing(
			[
				officeDocx,
				{
					...officeDocx,
					file_id: 'new-copy-id',
					path: 'report (2).docx',
					name: 'report (2).docx',
					url: `/ocu/files/${chat}/report%20%282%29.docx`
				}
			],
			undefined,
			2
		);
		namedButton('Refresh workspace files').click();
		await vi.waitFor(() => expect(namedControl('report (2).docx')).toBeDefined());
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		expect(namedButton('report.docx').getAttribute('aria-pressed')).toBe('true');
		expect(namedButton('report (2).docx').getAttribute('aria-pressed')).toBe('false');
		expect(editorFrame('report.docx')).toBe(frame);
		expect(frame.contentDocument).toBe(documentBefore);
		expect(frame.src).toBe(srcBefore);
		expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
		expect(frame.getAttribute('allow')).toBe('');
		expect(get(ocuOffice)[chat]).toMatchObject({
			fileId: 'report.docx',
			sessionId: 'sess-1',
			generation: openMessage.generation,
			state: 'editing',
			dirty: false
		});
		expect(officeCommandCalls(sent)).toEqual([]);
	});

	it.each(['success', 'refusal', 'workspace_missing'] as const)(
		'ignores retired-session %s completion while a new conflict has its own pending request',
		async (outcome) => {
			let releaseOld!: (response: Response) => void;
			let releaseNew!: (response: Response) => void;
			const oldResponse = new Promise<Response>((resolve) => {
				releaseOld = resolve;
			});
			const newResponse = new Promise<Response>((resolve) => {
				releaseNew = resolve;
			});
			const workspaceScenario = harness.scenario;
			harness.scenario = (url, init) =>
				url === resolveUrl
					? oldResponse
					: url.endsWith('/sessions/sess-2/resolve')
						? newResponse
						: workspaceScenario(url, init);
			const { frame, openMessage } = await openConflict();
			const retiredControl = namedButton('Save as new file');
			retiredControl.click();
			postOfficeState(frame, openMessage.generation, {
				session_id: 'sess-2',
				state: 'conflict',
				dirty: true,
				reason: 'baseline_mismatch'
			});
			retiredControl.click();
			expect(resolveRequests()).toHaveLength(1);
			await tick();
			expect(conflictDialog()).toBeDefined();
			namedButton('Save as new file').click();
			await releaseResolve(
				releaseOld,
				outcome === 'success'
					? json(savedAs)
					: json({ reason: outcome === 'refusal' ? 'unsafe_path' : 'workspace_missing' }, 409)
			);
			expect(conflictDialog()).toBeDefined();
			expect(conflictDialog()!.querySelector('[role="alert"]')).toBeNull();
			expect(namedButton('Save as new file').disabled).toBe(true);
			expect(get(ocuOffice)[chat]).toMatchObject({ sessionId: 'sess-2', state: 'conflict' });
			releaseNew(json({ ...savedAs, session_id: 'sess-2' }));
			await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
			expect(resolveRequests().map(({ url }) => url)).toEqual([
				resolveUrl,
				'/ocu/api/office/owner-chat/sessions/sess-2/resolve'
			]);
		}
	);

	it.each(['selection', 'generation', 'view', 'flag', 'unmount'] as const)(
		'retires pending resolve on %s and ignores both stale controls and completion',
		async (cause) => {
			let release!: (response: Response) => void;
			const response = new Promise<Response>((resolve) => {
				release = resolve;
			});
			respondToResolve(response);
			const { frame, openMessage } = await openConflict();
			const saveAs = namedButton('Save as new file');
			saveAs.click();
			if (cause === 'selection') namedButton('page.html').click();
			if (cause === 'generation') {
				namedButton('Edit').click();
				await tick();
				const replacement = editorFrame('report.docx')!;
				const { openMessage: next } = await harness.acceptEditing(replacement, 'sess-2');
				postOfficeState(replacement, next.generation, {
					session_id: 'sess-2',
					state: 'conflict',
					dirty: true,
					reason: 'baseline_mismatch'
				});
			}
			if (cause === 'view') selectWorkspaceView(chat, 'browser');
			if (cause === 'flag') config.set(officeConfig(false));
			if (cause === 'unmount') {
				await unmount(harness.component!);
				harness.component = undefined;
			}
			saveAs.click();
			await tick();
			const before = get(ocuOffice)[chat];
			const selectedBefore = get(ocuWorkspaces)[chat].selectedFileId;
			await releaseResolve(release, json({ reason: 'workspace_missing' }, 409));
			expect(get(ocuOffice)[chat]).toEqual(before);
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe(selectedBefore);
			expect(document.body.textContent).not.toContain('Your content is kept in the version store.');
			expect(resolveRequests()).toHaveLength(1);
			postOfficeState(frame, openMessage.generation, {
				state: 'conflict',
				dirty: true,
				reason: 'baseline_mismatch'
			});
			await tick();
			expect(resolveRequests()).toHaveLength(1);
		}
	);

	it.each(['chat', 'enabled'] as const)(
		'ignores pending resolution after the mounted %s prop revokes its context',
		async (prop) => {
			let release!: (response: Response) => void;
			const response = new Promise<Response>((resolve) => {
				release = resolve;
			});
			respondToResolve(response);
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
				const { openMessage } = await harness.acceptEditing(frame);
				postOfficeState(frame, openMessage.generation, {
					state: 'conflict',
					dirty: true,
					reason: 'baseline_mismatch'
				});
				await tick();
				namedButton('Save as new file').click();
				if (prop === 'enabled') mounted.$set({ enabled: false });
				else mounted.$set({ chatId: 'other-chat' });
				await tick();
				const before = get(ocuOffice);
				await releaseResolve(release, json({ reason: 'workspace_missing' }, 409));
				expect(get(ocuOffice)).toEqual(before);
				expect(conflictDialog()).toBeUndefined();
				expect(document.body.textContent).not.toContain(
					'Your content is kept in the version store.'
				);
				expect(resolveRequests()).toHaveLength(1);
			} finally {
				mounted.$destroy();
			}
		}
	);

	it('does not offer resolution until a validated conflict carries a nonempty session', async () => {
		await harness.open();
		await harness.ready('report.docx');
		const frame = await harness.selectAndEdit('report.docx');
		const { openMessage } = harness.handshake(frame);
		postOfficeState(frame, openMessage.generation, {
			session_id: null,
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		expect(get(ocuOffice)[chat]).toMatchObject({ state: 'conflict', sessionId: undefined });
		expect(conflictDialog()).toBeUndefined();
		expect(namedControl('Resolve conflict')).toBeUndefined();
		expect(resolveRequests()).toEqual([]);
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		expect(conflictDialog()).toBeDefined();
	});

	it('treats Escape as dismissal without resolving or discarding the conflict', async () => {
		const ancestorKeydown = vi.fn();
		window.addEventListener('keydown', ancestorKeydown);
		try {
			await openConflict();
			namedButton('Save as new file').dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
			);
			expect(ancestorKeydown).toHaveBeenCalledTimes(1);
			ancestorKeydown.mockClear();
			const event = new KeyboardEvent('keydown', {
				key: 'Escape',
				bubbles: true,
				cancelable: true
			});
			namedButton('Save as new file').dispatchEvent(event);
			await tick();
			expect(event.defaultPrevented).toBe(true);
			expect(ancestorKeydown).not.toHaveBeenCalled();
			expect(conflictDialog()).toBeUndefined();
			expect(get(ocuOffice)[chat]).toMatchObject({ state: 'conflict', dirty: true });
			expect(namedControl('Resolve conflict')).toBeDefined();
			expect(resolveRequests()).toEqual([]);
		} finally {
			window.removeEventListener('keydown', ancestorKeydown);
		}
	});

	it('keeps one request in flight through conflict leave and reentry and ignores the old episode outcome', async () => {
		let release!: (response: Response) => void;
		respondToResolve(
			new Promise<Response>((resolve) => {
				release = resolve;
			})
		);
		const { frame, openMessage } = await openConflict();
		namedButton('Save as new file').click();
		postOfficeState(frame, openMessage.generation);
		await tick();
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		expect(conflictDialog()).toBeDefined();
		expect(namedButton('Save as new file').disabled).toBe(true);
		const form = conflictDialog()!.querySelector('form');
		expect(form).not.toBeNull();
		form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		expect(resolveRequests()).toHaveLength(1);
		await releaseResolve(release, json(savedAs));
		expect(conflictDialog()).toBeDefined();
		expect(namedButton('Save as new file').disabled).toBe(false);
		harness.scenario = () => json(savedAs);
		namedButton('Save as new file').click();
		await vi.waitFor(() => expect(conflictDialog()).toBeUndefined());
		expect(resolveRequests()).toHaveLength(2);
	});

	it('retains workspace_missing terminal refusal when host polling reports the error before the resolve completes', async () => {
		let release!: (response: Response) => void;
		respondToResolve(
			new Promise<Response>((resolve) => {
				release = resolve;
			})
		);
		const { frame, openMessage } = await openConflict();
		namedButton('Save as new file').click();
		postOfficeState(frame, openMessage.generation, {
			state: 'error',
			dirty: true,
			reason: 'workspace_missing'
		});
		await tick();
		expect(get(ocuOffice)[chat]).toMatchObject({ state: 'error', reason: 'workspace_missing' });
		await releaseResolve(release, json({ reason: 'workspace_missing' }, 409));
		expect(document.querySelector('[role="alert"]')?.textContent).toBe(
			'The workspace files are gone. Your content is kept in the version store.'
		);
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		expect(conflictDialog()).toBeUndefined();
		expect(namedControl('Resolve conflict')).toBeUndefined();
		expect(resolveRequests()).toHaveLength(1);
	});
});
