// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { showArtifacts, showCallOverlay, showControls, showEmbeds } from '$lib/stores';
import { closeWorkspacePanel, ocuWorkspaces, selectWorkspaceFile } from '$lib/stores/ocu';
import { chat, file, listing, describeBody } from '../../../../test/ocu-workspace-fixtures';
import { createWorkspaceReconciliation } from './workspace-reconciliation';

type Transport = NonNullable<Parameters<typeof createWorkspaceReconciliation>[0]['transport']>;
let stop: (() => void) | undefined;
const firstPage = {
	kind: 'listing' as const,
	listing: listing([file('page.html')]),
	etag: 'W/"first"'
};

function fixture() {
	const describeCalls: string[] = [];
	const listCalls: Array<{ cursor?: string; etag?: string }> = [];
	const writes: Array<{ chatId: string; prefs: object }> = [];
	let launches = 0;
	let refreshes = 0;
	const api: Transport = {
		describe: async (_token, id) => {
			describeCalls.push(id);
			return { ...describeBody };
		},
		list: async (_base, _id, cursor, options) => {
			listCalls.push({ cursor, etag: options?.etag });
			return firstPage;
		},
		launch: async () => {
			launches++;
			return { state: 'running' };
		},
		refresh: async () => {
			refreshes++;
			return { revision: 1 };
		},
		prefs: async (_token, id, prefs) => {
			writes.push({ chatId: id, prefs });
			return { prefs };
		}
	};
	return {
		api,
		describeCalls,
		listCalls,
		writes,
		get launches() {
			return launches;
		},
		get refreshes() {
			return refreshes;
		}
	};
}
const controller = (api: Transport, visible?: () => boolean) =>
	createWorkspaceReconciliation({
		token: () => 'owner-session',
		translate: (key: string) => key,
		available: () => true,
		transport: api,
		visible
	});

function clickFileLink(owner: ReturnType<typeof controller>, id: string, path: string) {
	const anchor = document.createElement('a');
	anchor.href = `${window.location.origin}/ocu/files/${id}/${path}`;
	const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
	Object.defineProperty(event, 'target', { value: anchor });
	owner.handleLinkClick(event, id);
	expect(event.defaultPrevented).toBe(true);
}

beforeEach(() => {
	ocuWorkspaces.set({});
});
afterEach(() => {
	stop?.();
	stop = undefined;
	vi.useRealTimers();
	ocuWorkspaces.set({});
});

describe('one active-chat workspace producer', () => {
	it('reconciles a closed panel without implicit mutations and uses one visible or hidden poll timer', async () => {
		vi.useFakeTimers();
		let visible = true;
		const transport = fixture();
		const owner = controller(transport.api, () => visible);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.advanceTimersByTimeAsync(0);
		expect(get(ocuWorkspaces)[chat].files.map((entry) => entry.path)).toEqual(['page.html']);
		expect(transport.describeCalls).toEqual([chat]);
		expect(transport.listCalls).toHaveLength(1);
		expect([transport.launches, transport.refreshes, transport.writes.length]).toEqual([0, 0, 0]);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(transport.describeCalls).toEqual([chat, chat]);
		visible = false;
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(14_999);
		expect(transport.describeCalls).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(transport.describeCalls).toHaveLength(3);
		stop();
		stop = undefined;
		await vi.advanceTimersByTimeAsync(15_000);
		expect(transport.describeCalls).toHaveLength(3);
	});

	it('records an idle current-chat hint without making a request inside the event handler', async () => {
		vi.useFakeTimers();
		const transport = fixture();
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.advanceTimersByTimeAsync(0);
		expect(get(ocuWorkspaces)[chat].phase).toBe('ready');
		expect(transport.describeCalls).toEqual([chat]);
		expect(
			owner.acceptHint({
				chat_id: chat,
				data: {
					type: 'ocu:workspace_changed',
					data: { chat_id: chat, reason: 'tool_completed' }
				}
			})
		).toBe(true);
		expect(get(ocuWorkspaces)[chat].dirty).toBe(true);
		expect(transport.describeCalls).toEqual([chat]);
		await vi.advanceTimersByTimeAsync(0);
		expect(transport.describeCalls).toEqual([chat, chat]);
		expect(get(ocuWorkspaces)[chat].dirty).toBe(false);
	});

	it('keeps a hint received during an in-flight pass for one non-overlapping follow-up and never reads a background chat', async () => {
		const transport = fixture();
		const pending = Promise.withResolvers<Awaited<ReturnType<Transport['list']>>>();
		let lists = 0;
		transport.api.list = async () => {
			lists++;
			return lists === 1
				? pending.promise
				: {
						kind: 'listing',
						listing: listing([file('page.html'), file('new.html')], null, 2),
						etag: null
					};
		};
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(lists).toBe(1));
		const hint = (id: string, payloadId = id) =>
			owner.acceptHint({
				chat_id: id,
				message_id: 'does-not-exist',
				data: {
					type: 'ocu:workspace_changed',
					data: { chat_id: payloadId, reason: 'tool_completed', revision: 999 }
				}
			});
		expect(hint('background-chat')).toBe(true);
		expect(hint(chat)).toBe(true);
		expect(hint('mismatch', chat)).toBe(true);
		expect(get(ocuWorkspaces)['background-chat']).toMatchObject({ dirty: true, revision: 0 });
		expect(get(ocuWorkspaces).mismatch).toBeUndefined();
		expect(transport.describeCalls).toEqual([chat]);
		pending.resolve(firstPage);
		await vi.waitFor(() =>
			expect(get(ocuWorkspaces)[chat].files.map((entry) => entry.path)).toEqual([
				'page.html',
				'new.html'
			])
		);
		expect(lists).toBe(2);
		expect(transport.describeCalls).toEqual([chat, chat]);
		expect(get(ocuWorkspaces)[chat].dirty).toBe(false);
		expect(transport.describeCalls).not.toContain('background-chat');
	});

	it('runs an authoritative pass after a dirty hint arrives ahead of queued More', async () => {
		vi.useFakeTimers();
		const transport = fixture();
		const held = Promise.withResolvers<Awaited<ReturnType<Transport['list']>>>();
		const first = {
			kind: 'listing' as const,
			listing: listing([file('page.html')], 'second', 1, 2),
			etag: null
		};
		let firstReads = 0;
		transport.api.list = async (_base, _id, cursor) =>
			cursor
				? { kind: 'listing', listing: listing([file('next.html')], null, 1, 2), etag: null }
				: ++firstReads === 2
					? held.promise
					: first;
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.advanceTimersByTimeAsync(0);
		expect(get(ocuWorkspaces)[chat].nextCursor).toBe('second');
		owner.reconnect();
		const more = owner.more();
		await vi.advanceTimersByTimeAsync(0);
		expect(firstReads).toBe(2);
		owner.acceptHint({
			chat_id: chat,
			data: { type: 'ocu:workspace_changed', data: { chat_id: chat, reason: 'tool_completed' } }
		});
		expect(get(ocuWorkspaces)[chat].dirty).toBe(true);
		held.resolve(first);
		await more;
		await vi.advanceTimersByTimeAsync(0);
		expect(transport.describeCalls).toEqual([chat, chat, chat]);
		expect(firstReads).toBe(3);
		expect(get(ocuWorkspaces)[chat].dirty).toBe(false);
	});

	it.each([
		{ startVisible: true, nextVisible: false, delay: 15_000 },
		{ startVisible: false, nextVisible: true, delay: 3_000 }
	])(
		'reschedules the $delay ms poll when visibility changes during an in-flight read',
		async ({ startVisible, nextVisible, delay }) => {
			vi.useFakeTimers();
			let visible = startVisible;
			let hold = false;
			const held = Promise.withResolvers<Awaited<ReturnType<Transport['list']>>>();
			const transport = fixture();
			transport.api.list = async () => (hold ? held.promise : firstPage);
			const owner = controller(transport.api, () => visible);
			owner.observe(chat, true);
			stop = owner.mount();
			await vi.advanceTimersByTimeAsync(0);
			expect(transport.describeCalls).toHaveLength(1);
			hold = true;
			owner.reconnect();
			await vi.advanceTimersByTimeAsync(0);
			expect(transport.describeCalls).toHaveLength(2);
			visible = nextVisible;
			document.dispatchEvent(new Event('visibilitychange'));
			hold = false;
			held.resolve(firstPage);
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(transport.describeCalls).toHaveLength(2);
			await vi.advanceTimersByTimeAsync(1);
			expect(transport.describeCalls).toHaveLength(3);
		}
	);

	it('reuses an accepted matching ETag response without clearing selection, and rejects unqualified 304', async () => {
		const transport = fixture();
		let listings = 0;
		transport.api.list = async (_base, _id, _cursor, options) => {
			transport.listCalls.push({ etag: options?.etag });
			listings++;
			return listings === 1 ? firstPage : { kind: 'not_modified', etag: 'W/"first"' };
		};
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].files).toHaveLength(1));
		selectWorkspaceFile(chat, 'page.html');
		const before = get(ocuWorkspaces)[chat].files[0];
		owner.reconnect();
		await vi.waitFor(() => expect(listings).toBe(2));
		expect(transport.listCalls[1].etag).toBe('W/"first"');
		expect(get(ocuWorkspaces)[chat].files[0]).toBe(before);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html');
		stop();
		stop = undefined;
		ocuWorkspaces.set({});

		const invalid = fixture();
		invalid.api.list = async () => ({ kind: 'not_modified', etag: 'W/"unknown"' });
		const noCache = controller(invalid.api);
		noCache.observe(chat, true);
		stop = noCache.mount();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].phase).toBe('error'));
		expect(get(ocuWorkspaces)[chat].files).toEqual([]);
	});

	it('merges an explicit open patch over delayed nested prefs, but never writes guessed defaults on failed hydration', async () => {
		const transport = fixture();
		const held = Promise.withResolvers<Awaited<ReturnType<Transport['describe']>>>();
		transport.api.describe = async () => held.promise;
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		const opened = owner.writePrefs(chat, { open: true });
		expect(transport.writes).toEqual([]);
		held.resolve({
			...describeBody,
			views: ['files', 'terminal'],
			prefs: { view: 'terminal', selected_file_id: 'page.html', open: false }
		});
		await opened;
		expect(transport.writes).toEqual([
			{
				chatId: chat,
				prefs: { view: 'terminal', selected_file_id: 'page.html', open: true }
			}
		]);
		expect(get(ocuWorkspaces)[chat]).toMatchObject({
			view: 'terminal',
			selectedFileId: 'page.html',
			open: true,
			hydrated: true
		});
		stop();
		stop = undefined;

		ocuWorkspaces.set({});
		const failed = fixture();
		failed.api.describe = async () => {
			throw new Error('transport down');
		};
		const disconnected = controller(failed.api);
		disconnected.observe(chat, true);
		stop = disconnected.mount();
		await expect(disconnected.writePrefs(chat, { open: true })).rejects.toThrow('hydration failed');
		expect(failed.writes).toEqual([]);
		expect(get(ocuWorkspaces)[chat].hydrated).toBe(false);
	});

	it('resolves an unloaded encoded path through coherent pagination using the real file identity', async () => {
		const transport = fixture();
		const encoded = {
			...file('last.html', 'real-file-id'),
			path: 'nested/last.html',
			url: `/ocu/files/${chat}/nested/last.html`
		};
		transport.api.list = async (_base, _id, cursor) =>
			cursor
				? { kind: 'listing', listing: listing([encoded], null, 1, 2), etag: null }
				: { kind: 'listing', listing: listing([file('page.html')], 'second', 1, 2), etag: null };
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].nextCursor).toBe('second'));
		const resolved = await owner.resolvePath(chat, 'nested/last.html');
		expect(resolved).toMatchObject({ kind: 'found', file: { file_id: 'real-file-id' } });
		if (resolved.kind === 'found') await owner.selectFile(chat, resolved.file);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('real-file-id');
		expect(transport.writes.at(-1)?.prefs).toMatchObject({ selected_file_id: 'real-file-id' });
	});

	it('resolves a root href to the exact canonical file on a later page, not a loaded nested suffix', async () => {
		const transport = fixture();
		const nested = {
			...file('report.html', 'nested-id'),
			path: 'nested/report.html',
			url: `/ocu/files/${chat}/nested/report.html`
		};
		const root = file('report.html', 'root-id');
		const cursors: Array<string | undefined> = [];
		transport.api.list = async (_base, _id, cursor) => {
			cursors.push(cursor);
			return cursor
				? { kind: 'listing', listing: listing([root], null, 1, 2), etag: null }
				: { kind: 'listing', listing: listing([nested], 'second', 1, 2), etag: null };
		};
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].nextCursor).toBe('second'));
		const resolved = await owner.resolvePath(chat, 'report.html');
		expect(resolved).toMatchObject({ kind: 'found', file: { file_id: 'root-id' } });
		expect(cursors).toContain('second');
		if (resolved.kind === 'found') await owner.selectFile(chat, resolved.file);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('root-id');
	});

	it('returns absence for a root href when only a nested suffix exists after complete enumeration', async () => {
		const transport = fixture();
		const nested = {
			...file('report.html', 'nested-id'),
			path: 'nested/report.html',
			url: `/ocu/files/${chat}/nested/report.html`
		};
		transport.api.list = async (_base, _id, cursor) =>
			cursor
				? { kind: 'listing', listing: listing([file('other.html')], null, 1, 2), etag: null }
				: { kind: 'listing', listing: listing([nested], 'second', 1, 2), etag: null };
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].nextCursor).toBe('second'));
		expect(await owner.resolvePath(chat, 'report.html')).toEqual({ kind: 'absent' });
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
		expect(get(ocuWorkspaces)[chat].files.map((entry) => entry.file_id)).toEqual([
			'nested-id',
			'other.html'
		]);
	});

	it('keeps a link lookup failure distinct from a successfully proven missing file', async () => {
		vi.useFakeTimers();
		const transport = fixture();
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.advanceTimersByTimeAsync(0);
		expect(get(ocuWorkspaces)[chat].files).toHaveLength(1);
		let failedReads = 0;
		transport.api.list = async () => {
			failedReads++;
			throw new Error('listing offline');
		};
		clickFileLink(owner, chat, 'missing.html');
		await vi.advanceTimersByTimeAsync(0);
		expect(failedReads).toBe(1);
		expect(get(ocuWorkspaces)[chat]).toMatchObject({
			files: [file('page.html')],
			selectedFileId: undefined,
			notice: 'Workspace request failed'
		});
	});

	it('reports a link target missing after a complete successful listing', async () => {
		const transport = fixture();
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].files).toHaveLength(1));
		clickFileLink(owner, chat, 'missing.html');
		await vi.waitFor(() =>
			expect(get(ocuWorkspaces)[chat].notice).toBe('Selected file was removed')
		);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
	});

	it.each([
		{ queued: false, reenter: false },
		{ queued: false, reenter: true },
		{ queued: true, reenter: true }
	])(
		'never applies a $queued queued link result after A→B with return=$reenter',
		async ({ queued, reenter }) => {
			vi.useFakeTimers();
			const transport = fixture();
			const held = Promise.withResolvers<Awaited<ReturnType<Transport['list']>>>();
			let aReads = 0;
			transport.api.describe = async (_token, id) => {
				transport.describeCalls.push(id);
				return { ...describeBody, chat_id: id };
			};
			transport.api.list = async (_base, id) => {
				if (id === 'B')
					return { kind: 'listing', listing: { ...listing([]), chat_id: 'B' }, etag: null };
				return ++aReads === 2 ? held.promise : firstPage;
			};
			const owner = controller(transport.api);
			owner.observe(chat, true);
			stop = owner.mount();
			await vi.advanceTimersByTimeAsync(0);
			expect(get(ocuWorkspaces)[chat].files).toHaveLength(1);
			if (queued) owner.reconnect();
			clickFileLink(owner, chat, 'retired.html');
			await vi.advanceTimersByTimeAsync(0);
			expect(aReads).toBe(2);
			owner.observe('B', true);
			if (reenter) owner.observe(chat, true);
			await vi.advanceTimersByTimeAsync(0);
			held.resolve(firstPage);
			await vi.advanceTimersByTimeAsync(0);
			const current = get(ocuWorkspaces)[reenter ? chat : 'B'];
			expect(current.selectedFileId).toBeUndefined();
			expect(current.notice).toBe('');
			expect(current.files.map((entry) => entry.file_id)).toEqual(reenter ? ['page.html'] : []);
		}
	);

	it('intercepts only a same-origin current-chat file and preserves unrelated native clicks', async () => {
		const previous = {
			controls: get(showControls),
			artifacts: get(showArtifacts),
			embeds: get(showEmbeds),
			call: get(showCallOverlay)
		};
		try {
			const transport = fixture();
			const owner = controller(transport.api);
			owner.observe(chat, true);
			stop = owner.mount();
			await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].files).toHaveLength(1));
			const click = (href: string, modifiers: MouseEventInit = {}) => {
				const anchor = document.createElement('a');
				anchor.href = href;
				const event = new MouseEvent('click', {
					bubbles: true,
					cancelable: true,
					button: 0,
					...modifiers
				});
				Object.defineProperty(event, 'target', { value: anchor });
				owner.handleLinkClick(event, chat);
				return event.defaultPrevented;
			};
			const base = `${window.location.origin}/ocu/files/${chat}/page.html`;
			expect(click(base)).toBe(true);
			await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html'));
			expect(get(showControls)).toBe(true);
			expect(click(`https://foreign.example/ocu/files/${chat}/page.html`)).toBe(false);
			expect(click(`${window.location.origin}/ocu/files/other/page.html`)).toBe(false);
			expect(click(`${base}?download=1`)).toBe(false);
			expect(click(`${window.location.origin}/ocu/files/${chat}/archive`)).toBe(false);
			expect(click(base, { ctrlKey: true })).toBe(false);
			expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html');
		} finally {
			showControls.set(previous.controls);
			showArtifacts.set(previous.artifacts);
			showEmbeds.set(previous.embeds);
			showCallOverlay.set(previous.call);
		}
	});

	it('merges an acknowledged retired PUT into the next ordered patch without repainting newer local intent', async () => {
		const transport = fixture();
		const held = Promise.withResolvers<{ prefs: object }>();
		const writes: Array<Parameters<Transport['prefs']>[2]> = [];
		transport.api.prefs = async (_token, _id, prefs) => {
			writes.push(prefs);
			return writes.length === 1 ? held.promise : { prefs };
		};
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(get(ocuWorkspaces)[chat].hydrated).toBe(true));
		const acknowledged = { view: 'terminal' as const, selected_file_id: 'page.html' };
		const oldWrite = owner.writePrefs(chat, acknowledged);
		await vi.waitFor(() => expect(writes).toEqual([acknowledged]));
		owner.observe('other-chat', true);
		owner.observe(chat, true);
		await vi.waitFor(() =>
			expect(transport.describeCalls.filter((id) => id === chat)).toHaveLength(2)
		);
		closeWorkspacePanel(chat);
		const newWrite = owner.writePrefs(chat, { open: false });
		expect(writes).toHaveLength(1);
		held.resolve({ prefs: acknowledged });
		await Promise.all([oldWrite, newWrite]);
		expect(writes).toEqual([acknowledged, { ...acknowledged, open: false }]);
		expect(get(ocuWorkspaces)[chat]).toMatchObject({
			view: 'files',
			open: false,
			selectedFileId: undefined
		});
	});

	it('retires a delayed describe before any stale status or listing reaches another chat', async () => {
		const transport = fixture();
		const held = Promise.withResolvers<Awaited<ReturnType<Transport['describe']>>>();
		transport.api.describe = async (_token, id) => {
			transport.describeCalls.push(id);
			return id === chat ? held.promise : { ...describeBody, chat_id: 'B' };
		};
		const owner = controller(transport.api);
		owner.observe(chat, true);
		stop = owner.mount();
		await vi.waitFor(() => expect(transport.describeCalls).toEqual([chat]));
		owner.observe('B', true);
		held.resolve({ ...describeBody, revision: 99 });
		await vi.waitFor(() => expect(get(ocuWorkspaces).B?.status).toBe('running'));
		expect(get(ocuWorkspaces)[chat]?.status).toBeUndefined();
		expect(transport.describeCalls).toEqual([chat, 'B']);
	});
});
