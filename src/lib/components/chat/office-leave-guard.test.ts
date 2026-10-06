// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { chatId } from '$lib/stores';
import { ocuWorkspaces, selectWorkspaceFile, selectWorkspaceView } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import { chat, describeBody, json } from '../../../../test/ocu-workspace-fixtures';
import {
	editorFrame,
	expectOfficeCloseHeld,
	namedButton,
	officeCommandCalls,
	postOfficeState,
	htmlFile,
	officeDocx,
	publishedOfficeVersions
} from './workspace-artifact-office-test';
import { officeLeaveSnapshot, guardOfficeAction } from './office-leave-guard';
import {
	createOfficeGuardTestHarness,
	deliver,
	status,
	statusUrl,
	versionsUrl
} from './office-leave-guard-test';

const { harness, holdStatus, openDirty } = createOfficeGuardTestHarness();

describe('Office departure ownership', () => {
	it('prompts only for the current connected editor and removes prompting after clean, refusal, retirement and absence', async () => {
		const { frame, openMessage } = await openDirty();
		const unload = () => {
			const event = new Event('beforeunload', { cancelable: true });
			window.dispatchEvent(event);
			return event.defaultPrevented;
		};
		expect(unload()).toBe(true);
		postOfficeState(frame, openMessage.generation, { dirty: false });
		expect(unload()).toBe(false);
		postOfficeState(frame, openMessage.generation, { dirty: true });
		chatId.set('chat-b');
		expect(unload()).toBe(false);
		chatId.set(chat);
		expect(unload()).toBe(true);
		postOfficeState(frame, openMessage.generation, {
			state: 'refused',
			session_id: null,
			reason: 'unsupported_type',
			dirty: true
		});
		await tick();
		expect(unload()).toBe(false);
		expect(editorFrame('report.docx')).toBeNull();
		await unmount(harness.component!);
		harness.component = undefined;
		expect(get(ocuOffice)[chat].dirty).toBe(true);
		expect(unload()).toBe(false);
	});

	it.each(['editor', 'file', 'view'] as const)(
		'retains the original document for %s departure until the broker accepts close',
		async (trigger) => {
			harness.setListing([officeDocx, htmlFile], { ...describeBody, views: ['files', 'browser'] });
			const { frame, sent, openMessage } = await openDirty();
			const held = holdStatus();
			const originalWindow = frame.contentWindow;
			namedButton(
				trigger === 'editor' ? 'Close editor' : trigger === 'file' ? 'page.html' : 'Browser'
			).click();
			await tick();
			expectOfficeCloseHeld(frame, originalWindow, sent, openMessage.generation);
			postOfficeState(frame, openMessage.generation, { state: 'closing', dirty: true });
			await tick();
			expect(editorFrame('report.docx')).toBe(frame);
			await deliver(held, status('closing', { last_committed_seq: 1, last_published_seq: 1 }));
			expect(editorFrame('report.docx')).toBeNull();
			expect(frame.isConnected).toBe(false);
			expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
			if (trigger === 'file')
				expect(document.querySelector('iframe[title="page.html"]')).not.toBeNull();
			if (trigger === 'view')
				expect(document.querySelector('iframe[title="Workspace Browser"]')).not.toBeNull();
			if (trigger === 'editor') expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		}
	);

	it.each(['selection', 'view', 'panel'] as const)(
		'retains a live editor when the workspace store directly changes %s',
		async (trigger) => {
			const { frame, sent } = await openDirty();
			const held = holdStatus();
			if (trigger === 'selection') selectWorkspaceFile(chat, 'page.html');
			else if (trigger === 'view') selectWorkspaceView(chat, 'browser');
			else
				ocuWorkspaces.update((states) => ({ ...states, [chat]: { ...states[chat], open: false } }));
			await tick();
			expect(editorFrame('report.docx')).toBe(frame);
			expect(frame.isConnected).toBe(true);
			expect(officeCommandCalls(sent)[0][0].command).toBe('close');
			await deliver(held, status('closing'));
			expect(frame.isConnected).toBe(false);
		}
	);

	it('does not close or follow a refused editor even when an earlier valid snapshot remembered a session', async () => {
		const { frame, sent, openMessage } = await openDirty();
		postOfficeState(frame, openMessage.generation, {
			state: 'refused',
			reason: 'unsupported_type'
		});
		await tick();
		namedButton('page.html').click();
		await tick();
		expect(officeCommandCalls(sent)).toEqual([]);
		expect(harness.officeRequests().map(({ url }) => url)).toEqual([versionsUrl]);
		expect(document.querySelector('iframe[title="page.html"]')).not.toBeNull();
	});

	it('does not close when the owner selects the current file or view without a pending departure', async () => {
		const { frame, sent } = await openDirty();
		namedButton('report.docx').click();
		namedButton('Files').click();
		await tick();
		expect(editorFrame('report.docx')).toBe(frame);
		expect(officeCommandCalls(sent)).toEqual([]);
	});

	it('joins duplicate triggers and executes only the latest destination after one close', async () => {
		const { frame, sent } = await openDirty();
		const held = holdStatus();
		const visited: string[] = [];
		const leave = guardOfficeAction(
			() => chat,
			(target: string) => visited.push(target)
		);
		const first = leave('chat-b');
		const second = leave('chat-c');
		await first;
		expect(visited).toEqual([]);
		expect(frame.isConnected).toBe(true);
		expect(officeCommandCalls(sent)).toHaveLength(1);
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(1);
		await deliver(held, status('closing'));
		await second;
		expect(visited).toEqual(['chat-c']);
	});

	it('replaces a pending different-file intention with staying on the original file', async () => {
		await openDirty();
		const held = holdStatus();
		namedButton('page.html').click();
		await tick();
		namedButton('report.docx').click();
		await deliver(held, status('closing'));
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		expect(document.querySelector('iframe[title="page.html"]')).toBeNull();
	});

	it('replaces a pending click intention when an external workspace choice supersedes it', async () => {
		await openDirty();
		const held = holdStatus();
		namedButton('page.html').click();
		await tick();
		selectWorkspaceView(chat, 'browser');
		await deliver(held, status('closing'));
		expect(get(ocuWorkspaces)[chat].view).toBe('browser');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
	});

	it('requires matching ended-session evidence before a live conflict permits departure', async () => {
		const { frame, sent, openMessage } = await openDirty();
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			reason: 'baseline_mismatch'
		});
		await tick();
		const held = holdStatus();
		let ended = false;
		const fallback = harness.scenario;
		harness.scenario = (url, init) =>
			url === versionsUrl
				? json({
						...publishedOfficeVersions(),
						open_session: {
							session_id: 'sess-1',
							state: 'conflict',
							reason: 'baseline_mismatch',
							editor_ended: ended
						}
					})
				: fallback(url, init);
		vi.useFakeTimers();
		namedButton('page.html').click();
		await deliver(held, status('conflict', { reason: 'baseline_mismatch' }));
		expect(frame.isConnected).toBe(true);
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
		ended = true;
		harness.scenario = (url, init) =>
			url === statusUrl
				? status('conflict', { reason: 'baseline_mismatch' })
				: url === versionsUrl
					? json({
							...publishedOfficeVersions(),
							open_session: {
								session_id: 'sess-1',
								state: 'conflict',
								reason: 'baseline_mismatch',
								editor_ended: true
							}
						})
					: fallback(url, init);
		await vi.advanceTimersByTimeAsync(1000);
		await tick();
		expect(frame.isConnected).toBe(false);
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('conflict');
		expect(document.querySelector('[aria-label="Resolve conflict"]')).toBeNull();
		expect(officeCommandCalls(sent)).toHaveLength(1);
	});

	it('ignores ended-session evidence belonging to another session', async () => {
		const { frame } = await openDirty();
		const held = holdStatus();
		const fallback = harness.scenario;
		harness.scenario = (url, init) =>
			url === versionsUrl
				? json({
						...publishedOfficeVersions(),
						open_session: {
							session_id: 'other-session',
							state: 'conflict',
							reason: 'baseline_mismatch',
							editor_ended: true
						}
					})
				: fallback(url, init);
		namedButton('Close editor').click();
		await deliver(held, status('conflict', { reason: 'baseline_mismatch' }));
		expect(frame.isConnected).toBe(true);
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
	});

	it('keeps a forced-teardown session follower after its live frame and message authority disappear', async () => {
		const { frame, openMessage } = await openDirty();
		const oldWindow = frame.contentWindow;
		const held = holdStatus();
		await unmount(harness.component!);
		harness.component = undefined;
		expect(frame.isConnected).toBe(false);
		await deliver(held, status('closed'));
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saved');
		postOfficeState(frame, openMessage.generation, { dirty: true, state: 'editing' }, oldWindow);
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saved');
	});

	it('ignores forged dirty and session messages rather than registering an unload prompt or following an attacker session', async () => {
		const { frame, sent, openMessage } = await openDirty();
		postOfficeState(frame, openMessage.generation, { dirty: false });
		const attacker = document.createElement('iframe');
		document.body.append(attacker);
		postOfficeState(
			frame,
			openMessage.generation,
			{ dirty: true, session_id: 'attacker' },
			attacker.contentWindow
		);
		postOfficeState(frame, openMessage.generation + 1, { dirty: true, session_id: 'attacker' });
		const unload = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(unload);
		expect(unload.defaultPrevented).toBe(false);
		const held = holdStatus();
		namedButton('Close editor').click();
		await deliver(held, status('closed'));
		expect(
			harness.officeRequests().filter(({ url }) => url.endsWith('/sessions/attacker'))
		).toEqual([]);
		expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
			outcome: 'saved',
			generation: openMessage.generation
		});
		expect(officeCommandCalls(sent)[0][0].generation).toBe(openMessage.generation);
	});

	it('reports the captured name even when newer listing metadata arrives during close', async () => {
		const { frame } = await openDirty();
		const held = holdStatus();
		namedButton('Close editor').click();
		harness.setListing(
			[harness.reclassifiedFile('renamed.docx', 'docx', officeDocx.mime), htmlFile],
			describeBody,
			2
		);
		namedButton('Refresh workspace files').click();
		await vi.waitFor(() =>
			expect(get(ocuWorkspaces)[chat].files).toContainEqual(
				expect.objectContaining({ file_id: 'report.docx', name: 'renamed.docx', revision: 2 })
			)
		);
		expect(editorFrame('report.docx')).toBe(frame);
		await deliver(held, status('closed'));
		expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
			outcome: 'saved',
			name: 'report.docx'
		});
	});
});
