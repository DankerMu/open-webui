// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { chatId, showControls } from '$lib/stores';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import { chat, describeBody, json, listing } from '../../../../test/ocu-workspace-fixtures';
import {
	editorFrame,
	namedButton,
	officeCommandCalls,
	htmlFile,
	officeDocx,
	publishedOfficeVersions
} from './workspace-artifact-office-test';
import {
	officeLeaveGuard,
	officeLeaveSnapshot,
	guardOfficeAction,
	registerOfficeNavigation,
	officeCloseText
} from './office-leave-guard';
import {
	createOfficeGuardTestHarness,
	deliver,
	expectUnconfirmedSelection,
	status,
	statusUrl
} from './office-leave-guard-test';

const { harness, holdStatus, openDirty } = createOfficeGuardTestHarness();
describe('Office close outcomes and deadlines', () => {
	it('follows two chat sessions independently and never lets A overwrite B editor state or close outcome', async () => {
		await openDirty();
		vi.useFakeTimers();
		const acceptedA = holdStatus();
		const finalA = Promise.withResolvers<Response>();
		const acceptedB = Promise.withResolvers<Response>();
		const finalB = Promise.withResolvers<Response>();
		const bStatusUrl = '/ocu/api/office/chat-b/sessions/sess-b';
		const fallback = harness.scenario;
		let followingB = false;
		const departure = guardOfficeAction(
			() => chat,
			async () => {
				await unmount(harness.component!);
				harness.component = undefined;
				chatId.set('chat-b');
			}
		)();
		await deliver(acceptedA, status('closing'));
		await departure;
		harness.scenario = (url, init) =>
			url === statusUrl
				? finalA.promise
				: url === bStatusUrl
					? followingB
						? finalB.promise
						: acceptedB.promise
					: url.includes('/workspaces/chat-b')
						? json({ ...describeBody, chat_id: 'chat-b' })
						: url.includes('/outputs/chat-b')
							? json({
									...listing([{ ...officeDocx, url: '/ocu/files/chat-b/report.docx' }]),
									chat_id: 'chat-b'
								})
							: url.includes('/office/chat-b/documents/')
								? json(publishedOfficeVersions())
								: fallback(url, init);
		await harness.open(true, 'chat-b');
		await harness.ready('report.docx');
		const frameB = await harness.selectAndEdit('report.docx');
		const sentB = vi.spyOn(frameB.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: frameB.contentWindow,
				data: { type: 'ocu:office-ready', chat_id: 'chat-b' }
			})
		);
		const generationB = get(ocuOffice)['chat-b'].generation;
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: frameB.contentWindow,
				data: {
					type: 'ocu:office-state',
					chat_id: 'chat-b',
					file_id: 'report.docx',
					generation: generationB,
					session_id: 'sess-b',
					state: 'editing',
					dirty: true,
					workspace_changed: false,
					reason: null
				}
			})
		);
		await tick();
		namedButton('Close editor').click();
		const bLiveState = get(ocuOffice)['chat-b'];
		await vi.advanceTimersByTimeAsync(1000);
		await deliver(finalA, status('error', { reason: 'A_disk_full' }));
		expect(editorFrame('report.docx')).toBe(frameB);
		expect(get(ocuOffice)['chat-b']).toBe(bLiveState);
		expect(get(officeLeaveSnapshot).reports['chat-b'].outcome).toBe('saving');
		await deliver(acceptedB, status('closing', { session_id: 'sess-b' }));
		followingB = true;
		await vi.advanceTimersByTimeAsync(1000);
		await deliver(finalB, status('closed', { session_id: 'sess-b' }));
		expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
			outcome: 'failed',
			reason: 'A_disk_full'
		});
		expect(get(officeLeaveSnapshot).reports['chat-b'].outcome).toBe('saved');
		expect(officeCommandCalls(sentB)).toEqual([
			[
				{
					type: 'ocu:office-command',
					chat_id: 'chat-b',
					generation: generationB,
					command: 'close'
				},
				window.location.origin
			]
		]);
		expect(harness.officeRequests().filter(({ url }) => url === bStatusUrl)).toHaveLength(2);
	});

	it.each([
		{ state: 'closed', extra: {}, outcome: 'saved', text: 'Office changes saved: report.docx' },
		{
			state: 'closed',
			extra: { saved_as: { file_id: 'copy', path: 'folder/report (2).docx' }, file_id: 'copy' },
			outcome: 'saved_as',
			text: 'Office changes saved as a new file: report (2).docx'
		},
		{
			state: 'error',
			extra: { reason: 'disk_full_literal' },
			outcome: 'failed',
			text: 'Office save failed for report.docx: disk_full_literal'
		},
		{
			state: 'orphaned',
			extra: { reason: 'editor_state_lost' },
			outcome: 'failed',
			text: 'Office save failed for report.docx: editor_state_lost'
		},
		{
			state: 'closed',
			extra: { last_published_seq: 1 },
			outcome: 'unconfirmed',
			text: 'Office save unconfirmed: report.docx'
		}
	])(
		'reports $outcome only from the broker $state result and stops following',
		async ({ state, extra, outcome, text }) => {
			await openDirty();
			const held = holdStatus();
			vi.useFakeTimers();
			namedButton('Close editor').click();
			await tick();
			expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
			await deliver(held, status(state, extra));
			const report = get(officeLeaveSnapshot).reports[chat];
			expect(report.outcome).toBe(outcome);
			expect(
				officeCloseText(report, (key, values) =>
					key.replace(/{{(\w+)}}/g, (_, name) => values?.[name] ?? '')
				)
			).toBe(text);
			await vi.advanceTimersByTimeAsync(15_000);
			expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(1);
			expect(get(officeLeaveSnapshot).reports[chat]).toBe(report);
		}
	);

	it('expires a hung read at fifteen seconds, releases the latest intention once and rejects every late authority', async () => {
		const { frame, sent } = await openDirty();
		const held = holdStatus();
		vi.useFakeTimers();
		const visited: string[] = [];
		const leave = guardOfficeAction(
			() => chat,
			(target: string) => visited.push(target)
		);
		const attempted = Date.now();
		const obsolete = leave('chat-b');
		const current = leave('chat-c');
		await obsolete;
		await vi.advanceTimersByTimeAsync(attempted + 14_999 - Date.now());
		expect(visited).toEqual([]);
		expect(frame.isConnected).toBe(true);
		await vi.advanceTimersByTimeAsync(attempted + 15_000 - Date.now());
		await current;
		expect(visited).toEqual(['chat-c']);
		expect(frame.isConnected).toBe(false);
		const report = get(officeLeaveSnapshot).reports[chat];
		expect(report.outcome).toBe('unconfirmed');
		await deliver(held, status('closed'));
		await vi.advanceTimersByTimeAsync(20_000);
		expect(get(officeLeaveSnapshot).reports[chat]).toBe(report);
		expect(visited).toEqual(['chat-c']);
		expect(officeCommandCalls(sent)).toHaveLength(1);
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(1);
	});

	it('keeps status reads nonoverlapping and stops a closing session at the original deadline', async () => {
		await openDirty();
		const first = holdStatus();
		const second = Promise.withResolvers<Response>();
		vi.useFakeTimers();
		const attempted = Date.now();
		namedButton('Close editor').click();
		await deliver(first, status('closing'));
		const fallback = harness.scenario;
		harness.scenario = (url, init) => (url === statusUrl ? second.promise : fallback(url, init));
		await vi.advanceTimersByTimeAsync(1000);
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(attempted + 14_999 - Date.now());
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(attempted + 15_000 - Date.now());
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('unconfirmed');
		await deliver(second, status('closed'));
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('unconfirmed');
	});

	it.each(['network', 'http', 'invalid binding'] as const)(
		'treats a %s read problem as uncertainty, not broker failure, and never re-closes',
		async (problem) => {
			const { sent } = await openDirty();
			const fallback = harness.scenario;
			harness.scenario = (url, init) =>
				url !== statusUrl
					? fallback(url, init)
					: problem === 'network'
						? Promise.reject(new Error('offline'))
						: problem === 'http'
							? json({ reason: 'gateway_down_literal' }, 502)
							: status('closed', { session_id: 'wrong-session' });
			vi.useFakeTimers();
			namedButton('Close editor').click();
			await vi.advanceTimersByTimeAsync(15_000);
			expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
				outcome: 'unconfirmed',
				reason:
					problem === 'http'
						? 'gateway_down_literal'
						: problem === 'network'
							? 'request_failed'
							: 'invalid_response'
			});
			expect(officeCommandCalls(sent)).toHaveLength(1);
			const requests = harness.officeRequests().filter(({ url }) => url === statusUrl).length;
			await vi.advanceTimersByTimeAsync(5000);
			expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(
				requests
			);
		}
	);

	it.each(['completion', 'timeout'] as const)(
		'protects a replacement from the old %s and remembers shared-session uncertainty for a later departure',
		async (ending) => {
			await openDirty();
			const old = holdStatus();
			vi.useFakeTimers();
			namedButton('Close editor').click();
			const { frame: newer, sent, openMessage } = await harness.remountAcceptedEditor();
			const current = get(ocuOffice)[chat];
			if (ending === 'completion') await deliver(old, status('closed'));
			else await vi.advanceTimersByTimeAsync(15_000);
			expect(editorFrame('report.docx')).toBe(newer);
			expect(newer.isConnected).toBe(true);
			expect(get(ocuOffice)[chat]).toBe(current);
			expect(current.generation).toBe(openMessage.generation);
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
			expect(get(officeLeaveSnapshot).reports[chat]).toBeUndefined();
			const fallback = harness.scenario;
			harness.scenario = (url, init) =>
				url === statusUrl ? status('closing') : fallback(url, init);
			const attempted = Date.now();
			namedButton('Close editor').click();
			await tick();
			await vi.advanceTimersByTimeAsync(attempted + 14_999 - Date.now());
			expect(newer.isConnected).toBe(true);
			expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
			await vi.advanceTimersByTimeAsync(attempted + 15_000 - Date.now());
			await tick();
			expect(newer.isConnected).toBe(false);
			expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
				outcome: 'unconfirmed',
				generation: openMessage.generation
			});
			expect(officeCommandCalls(sent)).toHaveLength(1);
			if (ending === 'timeout') {
				expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(1);
			}
		}
	);

	it('retains replacement uncertainty when it mounts after the old timeout while the old network request is still pending', async () => {
		await openDirty();
		const old = holdStatus();
		vi.useFakeTimers();
		namedButton('Close editor').click();
		await vi.advanceTimersByTimeAsync(15_000);
		await tick();
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('unconfirmed');
		const { frame: newer, sent, openMessage } = await harness.remountAcceptedEditor();
		const fresh = holdStatus();
		const fallback = harness.scenario;
		const attempted = Date.now();
		namedButton('page.html').click();
		await tick();
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(1);
		await deliver(old, status('closed'));
		await vi.advanceTimersByTimeAsync(1000);
		await deliver(fresh, status('closing'));
		expect(newer.isConnected).toBe(true);
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
		harness.scenario = (url, init) => (url === statusUrl ? status('closed') : fallback(url, init));
		await vi.advanceTimersByTimeAsync(attempted + 14_999 - Date.now());
		expect(newer.isConnected).toBe(true);
		await vi.advanceTimersByTimeAsync(1);
		await tick();
		expectUnconfirmedSelection(newer, sent, openMessage.generation);
	});

	it('sends replacement-generation close but never mistakes old or fresh shared-session closing for its delivery', async () => {
		const { sent: oldSent } = await openDirty();
		const old = holdStatus();
		vi.useFakeTimers();
		namedButton('Close editor').click();
		await unmount(harness.component!);
		harness.component = undefined;
		await vi.advanceTimersByTimeAsync(5000);
		const { frame: newer, sent, openMessage } = await harness.openAcceptedEditor();
		const fresh = holdStatus();
		const fallback = harness.scenario;
		const attempted = Date.now();
		namedButton('page.html').click();
		await tick();
		const pending = get(officeLeaveSnapshot).reports[chat];
		expect(pending).toMatchObject({ outcome: 'saving', generation: openMessage.generation });
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(1);
		await deliver(old, status('closed'));
		expect(editorFrame('report.docx')).toBe(newer);
		expect(newer.isConnected).toBe(true);
		expect(get(officeLeaveSnapshot).reports[chat]).toBe(pending);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		await vi.advanceTimersByTimeAsync(1000);
		await deliver(fresh, status('closing'));
		expect(newer.isConnected).toBe(true);
		expect(get(officeLeaveSnapshot).reports[chat]).toBe(pending);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		expect(officeCommandCalls(oldSent)).toHaveLength(1);
		expect(officeCommandCalls(sent)).toEqual([
			[
				{
					type: 'ocu:office-command',
					chat_id: chat,
					generation: openMessage.generation,
					command: 'close'
				},
				window.location.origin
			]
		]);
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(2);
		harness.scenario = (url, init) => (url === statusUrl ? status('closed') : fallback(url, init));
		await vi.advanceTimersByTimeAsync(attempted + 14_999 - Date.now());
		await tick();
		expect(newer.isConnected).toBe(true);
		expect(get(officeLeaveSnapshot).reports[chat]).toBe(pending);
		namedButton('page.html').click();
		await vi.advanceTimersByTimeAsync(1);
		await tick();
		expectUnconfirmedSelection(newer, sent, openMessage.generation);
	});

	it('does not execute a pending old intention or replace a newer same-chat editor report', async () => {
		const { frame } = await openDirty();
		const old = holdStatus();
		const visited: string[] = [];
		const pending = guardOfficeAction(
			() => chat,
			() => visited.push('chat-b')
		)();
		const { frame: newer, openMessage } = await harness.remountAcceptedEditor('sess-2');
		await pending;
		const current = get(ocuOffice)[chat];
		await deliver(old, status('closed'));
		expect(visited).toEqual([]);
		expect(frame.isConnected).toBe(false);
		expect(editorFrame('report.docx')).toBe(newer);
		expect(get(ocuOffice)[chat]).toBe(current);
		expect(current.generation).toBe(openMessage.generation);
		expect(get(officeLeaveSnapshot).reports[chat]).toBeUndefined();
	});

	it("allows chat B after acceptance while following A and replays only A's outcome on return", async () => {
		const previousControls = get(showControls);
		showControls.set(true);
		const stopGuard = officeLeaveGuard.mount();
		try {
			await openDirty();
			const first = holdStatus();
			const final = Promise.withResolvers<Response>();
			const notices = vi.spyOn(toast, 'message');
			vi.useFakeTimers();
			const leave = guardOfficeAction(
				() => chat,
				async () => {
					await unmount(harness.component!);
					harness.component = undefined;
					chatId.set('chat-b');
				}
			);
			const departure = leave();
			await deliver(first, status('closing', { last_committed_seq: 1, last_published_seq: 1 }));
			await departure;
			const fallback = harness.scenario;
			harness.scenario = (url, init) =>
				url === statusUrl
					? final.promise
					: url.includes('/workspaces/chat-b')
						? json({ ...describeBody, chat_id: 'chat-b' })
						: url.includes('/outputs/chat-b')
							? json({
									...listing([{ ...htmlFile, url: '/ocu/files/chat-b/page.html' }]),
									chat_id: 'chat-b'
								})
							: fallback(url, init);
			await harness.open(true, 'chat-b');
			await harness.ready('page.html');
			namedButton('page.html').click();
			await tick();
			await vi.waitFor(() =>
				expect(get(ocuWorkspaces)['chat-b'].serverPrefs).toEqual({
					open: true,
					selected_file_id: 'page.html',
					view: 'files'
				})
			);
			const before = get(ocuWorkspaces)['chat-b'];
			const surface = document.querySelector('iframe[title="page.html"]');
			notices.mockClear();
			await vi.advanceTimersByTimeAsync(1000);
			await deliver(final, status('closed'));
			expect(get(ocuWorkspaces)['chat-b']).toBe(before);
			expect(document.querySelector('iframe[title="page.html"]')).toBe(surface);
			expect(get(ocuWorkspaces)['chat-b'].selectedFileId).toBe('page.html');
			expect(get(ocuWorkspaces)['chat-b'].files).toEqual([
				{
					file_id: 'page.html',
					path: 'page.html',
					name: 'page.html',
					url: '/ocu/files/chat-b/page.html',
					type: 'html',
					mime: 'text/html',
					revision: 1,
					size: 10
				}
			]);
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(notices).not.toHaveBeenCalled();
			expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saved');
			chatId.set(chat);
			expect(notices.mock.calls.map(([message]) => message)).toContain(
				'Office changes saved: report.docx'
			);
		} finally {
			stopGuard();
			showControls.set(previousControls);
		}
	});

	it('cancels real navigation before frame removal and admits only the latest requested route after broker acceptance', async () => {
		const { frame, sent } = await openDirty();
		const held = holdStatus();
		let beforeNavigate!: (navigation: {
			willUnload: boolean;
			to: { url: URL } | null;
			cancel: () => void;
		}) => void;
		const destinations: string[] = [];
		registerOfficeNavigation(
			(callback) => {
				beforeNavigate = callback;
			},
			async (url) => {
				destinations.push(url);
			}
		);
		const canceledB = vi.fn();
		const canceledC = vi.fn();
		beforeNavigate({
			willUnload: false,
			to: { url: new URL('/c/chat-b', window.location.origin) },
			cancel: canceledB
		});
		beforeNavigate({
			willUnload: false,
			to: { url: new URL('/c/chat-c', window.location.origin) },
			cancel: canceledC
		});
		expect(canceledB).toHaveBeenCalledTimes(1);
		expect(canceledC).toHaveBeenCalledTimes(1);
		expect(frame.isConnected).toBe(true);
		await deliver(held, status('closing'));
		expect(destinations).toEqual([`${window.location.origin}/c/chat-c`]);
		expect(officeCommandCalls(sent)).toHaveLength(1);
	});
});
