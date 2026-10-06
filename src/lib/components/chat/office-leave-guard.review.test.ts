// @vitest-environment jsdom
import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import { chat, file, json, listing } from '../../../../test/ocu-workspace-fixtures';
import { createOfficeEditorController, officeEditorSrc } from './office-editor-frame';
import {
	createOfficeLeaveGuard,
	officeLeaveSnapshot,
	registerOfficeNavigation
} from './office-leave-guard';
import {
	createOfficeGuardTestHarness,
	deliver,
	expectUnconfirmedSelection,
	status,
	statusUrl,
	versionsUrl
} from './office-leave-guard-test';
import {
	editAction,
	editorFrame,
	namedButton,
	officeCommandCalls,
	officeDocx,
	htmlFile,
	postOfficeState,
	publishedOfficeVersions
} from './workspace-artifact-office-test';

const { harness, holdStatus, openDirty } = createOfficeGuardTestHarness();

describe('Office review departure counterexamples', () => {
	it('COR-2 retains a same closing session attached after follower expiry with every old status read settled', async () => {
		await openDirty();
		const fallback = harness.scenario;
		const consumed: MockInstance[] = [];
		harness.scenario = (url, init) => {
			if (url !== statusUrl) return fallback(url, init);
			const response = status('closing');
			consumed.push(vi.spyOn(response, 'json'));
			return response;
		};
		vi.useFakeTimers();
		namedButton('Close editor').click();
		await vi.advanceTimersByTimeAsync(15_000);
		await tick();
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('unconfirmed');
		expect(consumed[0]).toHaveBeenCalledTimes(1);
		for (const read of consumed) {
			expect(read).toHaveBeenCalledTimes(1);
			await read.mock.results[0].value;
		}
		const settledReads = harness.officeRequests().filter(({ url }) => url === statusUrl).length;
		await vi.advanceTimersByTimeAsync(1000);
		expect(harness.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(
			settledReads
		);
		const { frame, sent, openMessage } = await harness.remountAcceptedEditor();
		postOfficeState(frame, openMessage.generation, { state: 'closing', dirty: true });
		await tick();
		const attempted = Date.now();
		namedButton('page.html').click();
		await vi.advanceTimersByTimeAsync(0);
		await tick();
		expect(editorFrame('report.docx')).toBe(frame);
		expect(frame.isConnected).toBe(true);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('saving');
		await vi.advanceTimersByTimeAsync(attempted + 14_999 - Date.now());
		expect(frame.isConnected).toBe(true);
		await vi.advanceTimersByTimeAsync(1);
		await tick();
		expectUnconfirmedSelection(frame, sent, openMessage.generation);
	});

	it('COR-2 an independent guard initially observing closing holds its own undelivered close until the deadline', async () => {
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		const guard = createOfficeLeaveGuard(() => undefined);
		const controller = createOfficeEditorController({
			origin: () => window.location.origin,
			onTimeout: () => {
				throw new Error('The independent editor did not become ready');
			}
		});
		const frame = document.createElement('iframe');
		frame.title = 'Office editor: report.docx';
		frame.src = officeEditorSrc('/ocu', chat);
		document.body.append(frame);
		const generation = controller.start(chat, officeDocx.file_id, frame.src);
		controller.attach(frame);
		harness.handshake(frame);
		postOfficeState(frame, generation, { state: 'closing', dirty: true });
		const sent = vi.spyOn(frame.contentWindow!, 'postMessage');
		sent.mockClear();
		const closeHeld = Promise.withResolvers<void>();
		// The embedded page has not processed this generation's close command.
		sent.mockImplementation(() => {
			void closeHeld.promise.then(() =>
				postOfficeState(frame, generation, { state: 'closed', dirty: false })
			);
		});
		const detach = guard.attach(frame, {
			editor: controller,
			chat,
			file: officeDocx.file_id,
			name: 'report.docx',
			translate: (key) => key,
			retire: () => {
				controller.dispose();
				frame.remove();
			}
		});
		const fallback = harness.scenario;
		harness.scenario = (url, init) => (url === statusUrl ? status('closing') : fallback(url, init));
		const departed: string[] = [];
		vi.useFakeTimers();
		try {
			const departure = guard.action(
				() => chat,
				() => departed.push('next-chat')
			)();
			await vi.advanceTimersByTimeAsync(0);
			expect(frame.isConnected).toBe(true);
			expect(departed).toEqual([]);
			expect(get(guard.snapshot).holding[chat]).toBe(true);
			await vi.advanceTimersByTimeAsync(14_999);
			expect(frame.isConnected).toBe(true);
			expect(departed).toEqual([]);
			await vi.advanceTimersByTimeAsync(1);
			await departure;
			expect(frame.isConnected).toBe(false);
			expect(departed).toEqual(['next-chat']);
			expect(get(guard.snapshot).reports[chat]).toMatchObject({
				outcome: 'unconfirmed',
				generation
			});
			expect(officeCommandCalls(sent)).toEqual([
				[
					{ type: 'ocu:office-command', chat_id: chat, generation, command: 'close' },
					window.location.origin
				]
			]);
		} finally {
			guard.dispose();
			detach();
			controller.dispose();
			frame.remove();
			closeHeld.resolve();
		}
	});

	it('IS-1 follows ended conflict on the current document after live Save as without rebinding its frame', async () => {
		const destination = {
			...file('report (2).docx', 'new-copy-id', 2),
			url: `/ocu/files/${chat}/report%20%282%29.docx`
		};
		const destinationVersions = `/ocu/api/office/${chat}/documents/new-copy-id/versions`;
		const resolveUrl = `/ocu/api/office/${chat}/sessions/sess-1/resolve`;
		const resolved = Promise.withResolvers<Response>();
		const fallback = harness.scenario;
		harness.scenario = (url, init) => {
			if (url === resolveUrl) return resolved.promise;
			if (url.includes('/outputs/'))
				return json(listing([officeDocx, destination, htmlFile], null, 2));
			if (url === destinationVersions)
				return json({
					...publishedOfficeVersions('new-copy-id'),
					open_session: {
						session_id: 'sess-1',
						state: 'conflict',
						reason: 'baseline_mismatch',
						editor_ended: true
					}
				});
			return fallback(url, init);
		};
		const { frame, sent, openMessage } = await openDirty();
		const originalWindow = frame.contentWindow;
		const originalDocument = frame.contentDocument;
		const originalSrc = frame.src;
		postOfficeState(frame, openMessage.generation, {
			state: 'conflict',
			dirty: true,
			reason: 'baseline_mismatch'
		});
		await tick();
		namedButton('Save as new file').click();
		expect(harness.officeRequests().find(({ url }) => url === resolveUrl)?.init?.body).toBe(
			'{"action":"save_as"}'
		);
		await deliver(
			resolved,
			json({
				session_id: 'sess-1',
				state: 'editing',
				file_id: 'new-copy-id',
				path: 'report (2).docx'
			})
		);
		postOfficeState(frame, openMessage.generation, { state: 'editing', dirty: true });
		await tick();
		expect(editorFrame('report.docx')).toBe(frame);
		expect(frame.contentWindow).toBe(originalWindow);
		expect(frame.contentDocument).toBe(originalDocument);
		expect(frame.src).toBe(originalSrc);
		expect(get(ocuOffice)[chat]).toMatchObject({
			fileId: 'report.docx',
			sessionId: 'sess-1',
			generation: openMessage.generation,
			state: 'editing'
		});
		const held = holdStatus();
		const notices = vi.spyOn(toast, 'message');
		const beforeDeparture = harness.officeRequests().length;
		namedButton('page.html').click();
		await deliver(
			held,
			status('conflict', {
				file_id: 'new-copy-id',
				reason: 'baseline_mismatch',
				saved_as: { file_id: 'new-copy-id', path: 'report (2).docx' }
			})
		);
		expect(
			harness
				.officeRequests()
				.slice(beforeDeparture)
				.map(({ url }) => url)
		).toEqual([statusUrl, destinationVersions]);
		expect(harness.officeRequests().filter(({ url }) => url === versionsUrl)).toHaveLength(1);
		expect(frame.isConnected).toBe(false);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html');
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('conflict');
		expect(notices.mock.calls.map(([message]) => message)).toContain(
			'Office conflict waiting; open report (2).docx to resolve it'
		);
		expect(officeCommandCalls(sent)).toHaveLength(1);
	});

	it.each(['single page', 'paginated'] as const)(
		'COR-3 keeps a pre-READY disappearance and return read-only after a %s listing until fresh Edit',
		async (paging) => {
			await harness.open();
			await harness.ready('report.docx');
			const oldFrame = await harness.selectAndEdit('report.docx');
			const oldWindow = oldFrame.contentWindow;
			const oldGeneration = get(ocuOffice)[chat].generation;
			const oldSent = vi.spyOn(oldWindow!, 'postMessage');
			const tail = Promise.withResolvers<Response>();
			const fallback = harness.scenario;
			harness.scenario = (url, init) => {
				if (!url.includes('/outputs/')) return fallback(url, init);
				if (new URL(url, window.location.origin).searchParams.has('cursor')) return tail.promise;
				return json(
					listing(
						[htmlFile],
						paging === 'paginated' ? 'missing-tail' : null,
						2,
						paging === 'paginated' ? 2 : 1
					)
				);
			};
			namedButton('Refresh workspace files').click();
			if (paging === 'paginated') {
				await vi.waitFor(() =>
					expect(harness.calls.some(({ url }) => url.includes('cursor=missing-tail'))).toBe(true)
				);
				expect(editorFrame('report.docx')).toBe(oldFrame);
				await deliver(tail, json(listing([file('notes.html')], null, 2, 2)));
			}
			await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].listingRevision).toBe(2));
			await tick();
			expect(oldFrame.isConnected).toBe(false);
			harness.setListing([officeDocx, htmlFile], undefined, 3);
			namedButton('Refresh workspace files').click();
			await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].listingRevision).toBe(3));
			await tick();
			expect(editorFrame('report.docx')).toBeNull();
			namedButton('report.docx').click();
			await tick();
			expect(editorFrame('report.docx')).toBeNull();
			expect(editAction()).toBeDefined();
			window.dispatchEvent(
				new MessageEvent('message', {
					origin: window.location.origin,
					source: oldWindow,
					data: { type: 'ocu:office-ready', chat_id: chat }
				})
			);
			expect(oldSent).not.toHaveBeenCalled();
			const fresh = await harness.selectAndEdit('report.docx');
			expect(fresh).not.toBe(oldFrame);
			const { openMessage, sent } = await harness.acceptEditing(fresh);
			expect(openMessage.generation).toBeGreaterThan(oldGeneration);
			expect(openMessage.file_id).toBe('report.docx');
			postOfficeState(fresh, openMessage.generation, { dirty: true });
			await tick();
			expect(get(ocuOffice)[chat]).toMatchObject({
				state: 'editing',
				sessionId: 'sess-1',
				dirty: true,
				generation: openMessage.generation
			});
			expect(sent).toHaveBeenCalledTimes(1);
			expect(harness.officeRequests().map(({ url }) => url)).toEqual([versionsUrl, versionsUrl]);
		}
	);
	it('COR-1 replays canceled Back as popstate after rollback and preserves all three history entries', async () => {
		const { frame, sent } = await openDirty();
		const held = holdStatus();
		const originalUrl = window.location.href;
		const originalState = window.history.state;
		const routes = ['/c/history-a', '/c/history-b', '/c/history-c'];
		window.history.replaceState({ entry: 'A' }, '', routes[0]);
		window.history.pushState({ entry: 'B' }, '', routes[1]);
		window.history.pushState({ entry: 'C' }, '', routes[2]);
		const length = window.history.length;
		const rollback = Promise.withResolvers<void>();
		const originalGo = window.history.go.bind(window.history);
		let delta = 0;
		let rollingBack = false;
		let currentUrl = new URL(routes[2], window.location.origin);
		let beforeNavigate!: Parameters<Parameters<typeof registerOfficeNavigation>[0]>[0];
		const arrived: Array<{ path: string; type: string; delta: number }> = [];
		const goto = vi.fn(async (url: string) => window.history.pushState({}, '', url));
		const stopNavigation = registerOfficeNavigation(
			(callback) => (beforeNavigate = callback),
			goto
		);
		vi.spyOn(window.history, 'go').mockImplementation((amount = 0) => {
			delta = amount;
			originalGo(amount);
		});
		// The browser changes its history index before SvelteKit asks beforeNavigate.
		// Canceled popstate rolls back asynchronously; its event is not a new intention.
		const onPopstate = (event: PopStateEvent) => {
			if (rollingBack) {
				rollingBack = false;
				return;
			}
			const traversal = delta;
			let canceled = false;
			const navigation = {
				type: 'popstate' as const,
				delta: traversal,
				from: { url: currentUrl },
				event,
				willUnload: false,
				to: { url: new URL(window.location.href) },
				cancel: () => (canceled = true)
			};
			beforeNavigate(navigation);
			if (canceled) {
				void rollback.promise.then(() => {
					rollingBack = true;
					window.history.go(-traversal);
				});
			} else {
				arrived.push({ path: window.location.pathname, type: navigation.type, delta: traversal });
				currentUrl = new URL(window.location.href);
			}
		};
		window.addEventListener('popstate', onPopstate);
		try {
			window.history.go(-1);
			await vi.waitFor(() => expect(window.location.pathname).toBe(routes[1]));
			expect(arrived).toEqual([]);
			expect(frame.isConnected).toBe(true);
			// Acceptance may arrive before the canceled traversal has finished rolling back.
			await deliver(held, status('closing'));
			expect(goto).not.toHaveBeenCalled();
			expect(arrived).toEqual([]);
			rollback.resolve();
			await vi.waitFor(() =>
				expect(arrived).toEqual([{ path: routes[1], type: 'popstate', delta: -1 }])
			);
			expect(window.history.go).toHaveBeenNthCalledWith(1, -1);
			expect(window.history.go).toHaveBeenNthCalledWith(2, 1);
			expect(window.history.go).toHaveBeenNthCalledWith(3, -1);
			expect(window.history.state).toEqual({ entry: 'B' });
			window.history.go(-1);
			await vi.waitFor(() => expect(window.location.pathname).toBe(routes[0]));
			expect(window.history.state).toEqual({ entry: 'A' });
			window.history.go(1);
			await vi.waitFor(() => expect(window.location.pathname).toBe(routes[1]));
			window.history.go(1);
			await vi.waitFor(() => expect(window.location.pathname).toBe(routes[2]));
			expect(window.history.state).toEqual({ entry: 'C' });
			expect(arrived).toEqual([
				{ path: routes[1], type: 'popstate', delta: -1 },
				{ path: routes[0], type: 'popstate', delta: -1 },
				{ path: routes[1], type: 'popstate', delta: 1 },
				{ path: routes[2], type: 'popstate', delta: 1 }
			]);
			expect(window.history.length).toBe(length);
			expect(goto).not.toHaveBeenCalled();
			expect(officeCommandCalls(sent)).toHaveLength(1);
		} finally {
			stopNavigation();
			window.removeEventListener('popstate', onPopstate);
			window.history.replaceState(originalState, '', originalUrl);
		}
	});
});
