// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { Toaster, toast } from 'svelte-sonner';
import { chatId, showControls } from '$lib/stores';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { chat, describeBody, json } from '../../../../test/ocu-workspace-fixtures';
import { htmlFile, namedButton, officeCommandCalls } from './workspace-artifact-office-test';
import { officeLeaveGuard, officeLeaveSnapshot } from './office-leave-guard';
import {
	createOfficeGuardTestHarness,
	deliver,
	status,
	statusUrl
} from './office-leave-guard-test';

const { harness, holdStatus, openDirty } = createOfficeGuardTestHarness();

beforeEach(() => {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {}
		}))
	);
});

function visibleNotifications(text: string) {
	return [
		...document.querySelectorAll<HTMLElement>(
			'[data-sonner-toast][data-visible="true"][data-removed="false"]'
		)
	].filter((node) => node.querySelector('[data-title]')?.textContent?.trim() === text);
}

describe('Office owner notifications', () => {
	it('keeps the confirmed saved outcome visible after replacing saving progress', async () => {
		await openDirty();
		const toaster = mount(Toaster, { target: document.body });
		try {
			await tick();
			const held = holdStatus();
			vi.useFakeTimers();
			namedButton('Close editor').click();
			await tick();
			expect(visibleNotifications('Saving Office changes: report.docx')).toHaveLength(1);
			expect(visibleNotifications('Office changes saved: report.docx')).toEqual([]);
			await deliver(held, status('closed'));
			await vi.advanceTimersByTimeAsync(1000);
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			expect(visibleNotifications('Saving Office changes: report.docx')).toEqual([]);
		} finally {
			await unmount(toaster);
		}
	});

	it('replays only the active owner after a rapid chat roundtrip and ignores an older presentation dismissal', async () => {
		const previousControls = get(showControls);
		showControls.set(true);
		const stopShell = officeLeaveGuard.mount();
		let toaster: Record<string, unknown> | undefined;
		try {
			await openDirty();
			toaster = mount(Toaster, { target: document.body });
			await tick();
			const held = holdStatus();
			vi.useFakeTimers();
			const stopPanel = officeLeaveGuard.mount();
			try {
				namedButton('Close editor').click();
				await deliver(held, status('closed'));
			} finally {
				stopPanel();
			}
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			chatId.set('chat-b');
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toEqual([]);
			chatId.set(chat);
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(1000);
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			chatId.set('chat-b');
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toEqual([]);
		} finally {
			stopShell();
			showControls.set(previousControls);
			if (toaster) await unmount(toaster);
		}
	});
});

const SAVING = 'Saving Office changes: report.docx';
const SAVED_AS = 'Office changes saved as a new file: report (2).docx';
const UNCONFIRMED = 'Office save unconfirmed: report.docx';

function closedStatus(
	fileId: string,
	savedAs: { file_id: string; path: string } | null,
	seq: number
) {
	return json({
		session_id: 'sess-1',
		state: 'closed',
		file_id: fileId,
		saved_as: savedAs,
		save_seq: seq,
		last_committed_seq: seq,
		last_published_seq: seq
	});
}

async function departByRemoval(sent: { mock: { calls: unknown[][] } }, generation: number) {
	harness.setListing([htmlFile], describeBody, 2);
	const held = holdStatus();
	namedButton('Refresh workspace files').click();
	await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].listingRevision).toBe(2));
	await tick();
	expect(officeCommandCalls(sent)).toEqual([
		[
			{ type: 'ocu:office-command', chat_id: chat, generation, command: 'close' },
			window.location.origin
		]
	]);
	await vi.waitFor(() =>
		expect(harness.officeRequests().map(({ url }) => url)).toContain(statusUrl)
	);
	return held;
}

function clearedPreferences() {
	return harness.calls.filter(
		({ url, init }) =>
			url.endsWith('/prefs') &&
			init?.method === 'PUT' &&
			JSON.parse(String(init.body)).selected_file_id === null
	);
}

describe('Office removal-triggered close', () => {
	// The broker skips symbolic links while enumerating (outputs_broker.py S_ISLNK), so a symlink
	// swapped in for report.docx reaches the sidebar as the same listing drop as a deletion.
	it.each(['deleted', 'replaced by a symbolic link'])(
		'names the saved copy when the open file is %s',
		async () => {
			const { frame, sent, openMessage } = await openDirty();
			const toaster = mount(Toaster, { target: document.body });
			try {
				await tick();
				const notices = vi.spyOn(toast, 'message');
				const held = await departByRemoval(sent, openMessage.generation);
				await deliver(
					held,
					closedStatus('copy-id', { file_id: 'copy-id', path: 'report (2).docx' }, 1)
				);
				await tick();
				expect(notices.mock.calls.map(([message]) => message)).toEqual([SAVING, SAVED_AS]);
				expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
					outcome: 'saved_as',
					name: 'report.docx',
					path: 'report (2).docx',
					generation: openMessage.generation
				});
				await vi.waitFor(() => expect(visibleNotifications(SAVED_AS)).toHaveLength(1));
				expect(visibleNotifications(SAVING)).toEqual([]);
				expect(frame.isConnected).toBe(false);
				await vi.waitFor(() =>
					expect(document.body.textContent).toContain('Selected file was removed')
				);
				expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
				expect(clearedPreferences()).toHaveLength(1);
				expect(officeCommandCalls(sent)).toHaveLength(1);
			} finally {
				await unmount(toaster);
			}
		}
	);

	it('names no copy when the removal-triggered close publishes nothing', async () => {
		const { frame, sent, openMessage } = await harness.openAcceptedEditor();
		const toaster = mount(Toaster, { target: document.body });
		try {
			await tick();
			const notices = vi.spyOn(toast, 'message');
			const held = await departByRemoval(sent, openMessage.generation);
			await deliver(held, closedStatus('report.docx', null, 0));
			await tick();
			expect(notices.mock.calls.map(([message]) => message)).toEqual([SAVING, UNCONFIRMED]);
			expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
				outcome: 'unconfirmed',
				name: 'report.docx',
				path: undefined
			});
			await vi.waitFor(() => expect(visibleNotifications(UNCONFIRMED)).toHaveLength(1));
			expect(document.body.textContent).not.toContain('saved as a new file');
			expect(document.body.textContent).not.toContain('report (2).docx');
			expect(frame.isConnected).toBe(false);
			await vi.waitFor(() =>
				expect(document.body.textContent).toContain('Selected file was removed')
			);
			expect(officeCommandCalls(sent)).toHaveLength(1);
		} finally {
			await unmount(toaster);
		}
	});
});
