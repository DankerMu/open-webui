import { get } from 'svelte/store';
import {
	getWorkspace,
	launchWorkspace,
	listWorkspaceFiles,
	putWorkspacePrefs,
	refreshWorkspace,
	workspaceFileUrl,
	WorkspaceRequestError,
	type WorkspaceFile,
	type WorkspaceListing,
	type WorkspaceListingResult,
	type WorkspacePrefs
} from '$lib/apis/ocu';
import {
	acceptWorkspacePrefs,
	applyDescribe,
	applyWorkspaceListing,
	beginGeneration,
	consumeWorkspaceDirty,
	hydrateWorkspacePrefs,
	isCurrentGeneration,
	markDirty,
	ocuWorkspaces,
	openWorkspacePanel,
	queueWorkspacePrefs,
	retireGeneration,
	selectWorkspaceFile,
	selectWorkspaceView,
	setWorkspacePresentation,
	stageWorkspacePrefs
} from '$lib/stores/ocu';
import { showArtifacts, showCallOverlay, showControls, showEmbeds } from '$lib/stores';
import { recogniseOcuLink } from '$lib/utils/ocu-links';
import { isSavedChatId } from '$lib/utils/chatId';

export const WORKSPACE_RECONCILIATION = Symbol('workspace-reconciliation');
const MAX_PAGES = 100;
const visibleDelay = 3_000;
const hiddenDelay = 15_000;

type ListingWindow = {
	files: WorkspaceFile[];
	revision: number;
	cursor: string | null;
	etag?: string;
};
type LinkResolution =
	| { kind: 'found'; file: WorkspaceFile }
	| { kind: 'absent' }
	| { kind: 'inconclusive' };
type Command = 'poll' | 'refresh' | 'launch' | 'more' | 'retry';

type Transport = {
	describe: typeof getWorkspace;
	list: typeof listWorkspaceFiles;
	launch: typeof launchWorkspace;
	refresh: typeof refreshWorkspace;
	prefs: typeof putWorkspacePrefs;
};
const defaultTransport: Transport = {
	describe: getWorkspace,
	list: listWorkspaceFiles,
	launch: launchWorkspace,
	refresh: refreshWorkspace,
	prefs: putWorkspacePrefs
};

export function createWorkspaceReconciliation(options: {
	token: () => string;
	available: () => boolean;
	translate: (key: string, values?: Record<string, string>) => string;
	visible?: () => boolean;
	transport?: Transport;
}) {
	const transport = options.transport ?? defaultTransport;
	let activeId: string | null = null;
	let mounted = false;
	let running = false;
	let runSequence = 0;
	let ownershipEpoch = 0;
	let requested = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopDirtyWatch: (() => void) | undefined;
	let wakeFor: number | undefined;
	let abort: AbortController | undefined;
	const queued: Array<{
		mode: Command;
		wantedPath?: string;
		resolve: (result: ListingWindow | null) => void;
	}> = [];
	const hydration = new Map<string, Set<{ resolve: () => void; reject: (error: Error) => void }>>();
	const isActive = (id: string, generation: number) =>
		mounted && activeId === id && isCurrentGeneration(id, generation);
	const isVisible = () => options.visible?.() ?? document.visibilityState !== 'hidden';

	function settleHydration(id: string, error?: Error) {
		const waiters = hydration.get(id);
		hydration.delete(id);
		for (const waiter of waiters ?? []) {
			if (error) waiter.reject(error);
			else waiter.resolve();
		}
	}
	function waitForHydration(id: string): Promise<void> {
		if (get(ocuWorkspaces)[id]?.hydrated) return Promise.resolve();
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const waiters = hydration.get(id) ?? new Set();
		waiters.add({ resolve, reject });
		hydration.set(id, waiters);
		return promise;
	}
	function clearTimer() {
		clearTimeout(timer);
		timer = undefined;
	}
	function schedule(delay = isVisible() ? visibleDelay : hiddenDelay) {
		clearTimer();
		if (!mounted || !activeId) return;
		timer = setTimeout(() => {
			timer = undefined;
			void run();
		}, delay);
	}
	function poke() {
		if (!mounted || !activeId) return;
		clearTimer();
		if (running) requested = true;
		else void run();
	}
	function watchDirty() {
		stopDirtyWatch?.();
		stopDirtyWatch = ocuWorkspaces.subscribe((states) => {
			const id = activeId;
			if (!mounted || !id || !states[id]?.dirty) return;
			const owner = ownershipEpoch;
			if (wakeFor === owner) return;
			wakeFor = owner;
			queueMicrotask(() => {
				if (wakeFor === owner) wakeFor = undefined;
				if (
					!mounted ||
					activeId !== id ||
					owner !== ownershipEpoch ||
					!get(ocuWorkspaces)[id]?.dirty
				)
					return;
				if (running) requested = true;
				else poke();
			});
		});
	}
	function retire() {
		stopDirtyWatch?.();
		stopDirtyWatch = undefined;
		wakeFor = undefined;
		ownershipEpoch++;
		runSequence++;
		for (const command of queued.splice(0)) command.resolve(null);
		running = false;
		clearTimer();
		abort?.abort();
		abort = undefined;
		if (activeId) {
			retireGeneration(activeId);
			settleHydration(activeId, new Error('workspace context retired'));
		}
		activeId = null;
		requested = false;
	}
	function observe(chatId: string | null, available: boolean) {
		const next = available && isSavedChatId(chatId) && chatId !== 'default' ? chatId : null;
		if (next === activeId) return;
		retire();
		activeId = next;
		if (mounted && next) {
			watchDirty();
			poke();
		}
	}
	function mount() {
		mounted = true;
		const onVisibility = () => {
			if (!running) schedule();
		};
		watchDirty();
		document.addEventListener('visibilitychange', onVisibility);
		if (activeId) poke();
		return () => {
			mounted = false;
			document.removeEventListener('visibilitychange', onVisibility);
			retire();
		};
	}
	function hint(id: string) {
		markDirty(id);
	}
	function isWorkspaceHint(
		value: unknown
	): value is { type: 'ocu:workspace_changed'; data?: unknown } {
		return (
			!!value &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			'type' in value &&
			value.type === 'ocu:workspace_changed'
		);
	}
	function validHintChat(id: unknown, data: unknown): id is string {
		return (
			typeof id === 'string' &&
			isSavedChatId(id) &&
			id !== 'default' &&
			!!data &&
			typeof data === 'object' &&
			!Array.isArray(data) &&
			'chat_id' in data &&
			data.chat_id === id &&
			'reason' in data &&
			data.reason === 'tool_completed'
		);
	}
	function acceptHint(event: unknown): boolean {
		if (
			!options.available() ||
			!event ||
			typeof event !== 'object' ||
			Array.isArray(event) ||
			!('data' in event) ||
			!isWorkspaceHint(event.data)
		)
			return false;
		if ('chat_id' in event && validHintChat(event.chat_id, event.data.data)) hint(event.chat_id);
		return true;
	}
	function reconnect() {
		poke();
	}

	async function writePrefs(id: string, patch: WorkspacePrefs): Promise<void> {
		const owner = ownershipEpoch;
		stageWorkspacePrefs(id, patch);
		return queueWorkspacePrefs(id, async () => {
			await waitForHydration(id);
			if (!mounted || activeId !== id || owner !== ownershipEpoch)
				throw new Error('workspace context retired');
			const state = get(ocuWorkspaces)[id];
			const prefs = { ...state.serverPrefs, ...patch };
			await transport.prefs(options.token(), id, prefs);
			acceptWorkspacePrefs(id, prefs);
		});
	}

	function encodedFileUrl(baseUrl: string, id: string, encodedPath: string): string {
		return `${baseUrl}/files/${encodeURIComponent(id)}/${encodedPath}`;
	}
	function windowReady(
		cursor: string | null,
		loaded: number,
		required: number,
		selectedId: string | undefined,
		seenIds: Set<string>,
		wantedPath?: string,
		seenPaths?: Set<string>
	) {
		if (!cursor) return true;
		return (
			loaded >= required &&
			(!selectedId || seenIds.has(selectedId)) &&
			(!wantedPath || !!seenPaths?.has(wantedPath))
		);
	}
	function acceptedCache(id: string, expected: string | undefined, actual: string) {
		const cached = get(ocuWorkspaces)[id];
		if (!expected || cached.etag !== actual || cached.listingRevision === undefined)
			throw new WorkspaceRequestError(304, 'invalid_response');
		return cached;
	}
	function appendPage(
		page: WorkspaceListing,
		files: WorkspaceFile[],
		ids: Set<string>,
		paths: Set<string>,
		cursor: string | null,
		revision: number | undefined
	): string | null {
		if (revision !== undefined && revision !== page.revision)
			throw new WorkspaceRequestError(409, 'stale_cursor');
		for (const file of page.files) {
			if (ids.has(file.file_id)) throw new WorkspaceRequestError(0, 'invalid_response');
			ids.add(file.file_id);
			paths.add(file.url);
			files.push(file);
		}
		if (page.next_cursor === cursor && cursor !== null)
			throw new WorkspaceRequestError(0, 'invalid_response');
		if (!page.next_cursor && files.length !== page.total)
			throw new WorkspaceRequestError(0, 'listing_incomplete');
		return page.next_cursor;
	}
	async function readPageSequence(
		id: string,
		baseUrl: string,
		generation: number,
		signal: AbortSignal,
		initial: WorkspaceFile[],
		startCursor: string | null,
		startRevision: number | undefined,
		required: number,
		selectedId: string | undefined,
		cachedEtag?: string,
		wantedPath?: string
	): Promise<ListingWindow | null> {
		let files = [...initial];
		let seenIds = new Set(files.map((file) => file.file_id));
		let seenPaths = new Set(files.map((file) => file.url));
		const wantedUrl = wantedPath ? encodedFileUrl(baseUrl, id, wantedPath) : undefined;
		let cursor = startCursor;
		let revision = startRevision;
		let etag: string | undefined;
		for (let pages = 0; pages < MAX_PAGES; pages++) {
			const response: WorkspaceListingResult = await transport.list(
				baseUrl,
				id,
				cursor ?? undefined,
				{
					etag: cursor ? undefined : cachedEtag,
					signal
				}
			);
			if (!isActive(id, generation)) return null;
			if (response.kind === 'not_modified') {
				const cached = acceptedCache(id, cachedEtag, response.etag);
				files = [...cached.files];
				seenIds = new Set(files.map((file) => file.file_id));
				seenPaths = new Set(files.map((file) => file.url));
				cursor = cached.nextCursor;
				revision = cached.listingRevision;
				etag = response.etag;
			} else {
				const page = response.listing;
				if (!cursor) etag = response.etag ?? undefined;
				cursor = appendPage(page, files, seenIds, seenPaths, cursor, revision);
				revision = page.revision;
			}
			if (windowReady(cursor, files.length, required, selectedId, seenIds, wantedUrl, seenPaths))
				return { files, revision: revision!, cursor, etag };
			cachedEtag = undefined;
		}
		throw new WorkspaceRequestError(0, 'listing_incomplete');
	}
	async function readCoherentWindow(
		id: string,
		generation: number,
		signal: AbortSignal,
		more = false,
		wantedPath?: string
	) {
		const current = get(ocuWorkspaces)[id];
		if (more && !current?.nextCursor) return null;
		if (!current?.baseUrl) throw new WorkspaceRequestError(0, 'invalid_response');
		const required = current.files.length + (more ? 1 : 0);
		const read = (
			initial: WorkspaceFile[],
			cursor: string | null,
			revision?: number,
			etag?: string
		) =>
			readPageSequence(
				id,
				current.baseUrl!,
				generation,
				signal,
				initial,
				cursor,
				revision,
				required,
				current.selectedFileId,
				etag,
				wantedPath
			);
		try {
			return await read(
				more ? current.files : [],
				more ? current.nextCursor : null,
				more ? current.listingRevision : undefined,
				!more && current.listingRevision === current.revision ? current.etag : undefined
			);
		} catch (error) {
			if (!(error instanceof WorkspaceRequestError && error.status === 409)) throw error;
			return read([], null);
		}
	}
	async function reconcile(
		id: string,
		generation: number,
		signal: AbortSignal,
		more = false,
		wantedPath?: string
	) {
		const current = get(ocuWorkspaces)[id];
		const result = await readCoherentWindow(id, generation, signal, more, wantedPath);
		if (!result || !isActive(id, generation)) return null;
		if (result.revision < current.revision) return null;
		const latestSelection = get(ocuWorkspaces)[id]?.selectedFileId;
		if (
			latestSelection !== current.selectedFileId &&
			latestSelection &&
			!result.files.some((file) => file.file_id === latestSelection)
		) {
			setWorkspacePresentation(id, generation, {
				notice: options.translate('Selection changed during refresh; refresh again')
			});
			return null;
		}
		applyWorkspaceListing(
			id,
			generation,
			result.files,
			result.revision,
			result.cursor,
			result.etag
		);
		setWorkspacePresentation(id, generation, {
			phase: current.status === 'stopped' ? 'stopped' : result.files.length ? 'ready' : 'empty'
		});
		if (
			latestSelection &&
			!result.cursor &&
			!result.files.some((file) => file.file_id === latestSelection)
		) {
			selectWorkspaceFile(id, undefined);
			setWorkspacePresentation(id, generation, {
				notice: options.translate('Selected file was removed')
			});
			try {
				await writePrefs(id, { selected_file_id: null });
			} catch {
				if (isActive(id, generation))
					setWorkspacePresentation(id, generation, {
						notice: options.translate('Selected file was removed; preference could not be cleared')
					});
			}
		}
		return result;
	}

	function acceptDescription(
		id: string,
		generation: number,
		body: Awaited<ReturnType<typeof getWorkspace>>
	) {
		if (
			body.chat_id !== id ||
			!Array.isArray(body.capabilities) ||
			!Array.isArray(body.views) ||
			!['running', 'stopped', 'unavailable'].includes(body.status)
		)
			throw new WorkspaceRequestError(0, 'invalid_response');
		applyDescribe(id, generation, body);
		if (!get(ocuWorkspaces)[id].hydrated) {
			if (!body.prefs || typeof body.prefs !== 'object' || Array.isArray(body.prefs))
				throw new WorkspaceRequestError(0, 'invalid_response');
			hydrateWorkspacePrefs(id, generation, body.prefs);
			settleHydration(id);
		}
		const state = get(ocuWorkspaces)[id];
		if (
			state.view !== 'files' &&
			(body.status !== 'running' || state.baseUrl !== '/ocu' || !body.views.includes(state.view))
		) {
			selectWorkspaceView(id, 'files');
			setWorkspacePresentation(id, generation, {
				notice: options.translate('Workspace view is unavailable')
			});
		}
		if (body.status === 'unavailable')
			setWorkspacePresentation(id, generation, {
				phase: body.reason === 'ocu_unreachable' ? 'disconnected' : 'unavailable'
			});
	}
	async function executeRun(
		id: string,
		generation: number,
		signal: AbortSignal,
		mode: Command,
		wantedPath?: string
	): Promise<ListingWindow | null> {
		if (mode === 'launch') {
			await transport.launch(options.token(), id);
			if (!isActive(id, generation)) return null;
		}
		if (mode !== 'more') {
			const body = await transport.describe(options.token(), id, signal);
			if (!isActive(id, generation)) return null;
			acceptDescription(id, generation, body);
			if (body.status === 'unavailable') return null;
			if (mode === 'refresh' && body.capabilities.includes('refresh')) {
				await transport.refresh(options.token(), id);
				if (!isActive(id, generation)) return null;
			}
		}
		return reconcile(id, generation, signal, mode === 'more', wantedPath);
	}
	function presentRunFailure(id: string, generation: number, mode: Command, error: unknown) {
		if (!get(ocuWorkspaces)[id].hydrated)
			settleHydration(id, new Error('workspace hydration failed'));
		const current = get(ocuWorkspaces)[id];
		setWorkspacePresentation(id, generation, {
			phase: current.files.length ? current.phase : 'error',
			notice:
				mode === 'more'
					? options.translate('More files could not be loaded; existing files remain available')
					: mode === 'refresh'
						? options.translate('Refresh failed; existing files remain available')
						: error instanceof WorkspaceRequestError
							? options.translate('Workspace {{reason}}', { reason: error.reason })
							: options.translate('Workspace request failed')
		});
	}
	function finishRun(id: string, generation: number, controller: AbortController, owner: number) {
		if (owner !== runSequence) return;
		if (isActive(id, generation)) setWorkspacePresentation(id, generation, { busy: false });
		if (abort === controller) abort = undefined;
		running = false;
		if (!mounted || activeId !== id) return;
		const command = queued.shift();
		if (command) void run(command.mode, command.wantedPath).then(command.resolve);
		else if (requested || get(ocuWorkspaces)[id]?.dirty) poke();
		else schedule();
	}
	async function run(mode: Command = 'poll', wantedPath?: string): Promise<ListingWindow | null> {
		const id = activeId;
		if (!mounted || !id) return null;
		if (running) {
			if (mode === 'poll' && !wantedPath) {
				requested = true;
				return null;
			}
			const { promise, resolve } = Promise.withResolvers<ListingWindow | null>();
			queued.push({ mode, wantedPath, resolve });
			return promise;
		}
		running = true;
		const owner = ++runSequence;
		requested = false;
		clearTimer();
		const generation = beginGeneration(id);
		const controller = (abort = new AbortController());
		if (mode !== 'more') consumeWorkspaceDirty(id);
		const current = get(ocuWorkspaces)[id];
		setWorkspacePresentation(id, generation, {
			busy: mode !== 'poll',
			notice: '',
			phase: current.status === undefined ? 'loading' : current.phase
		});
		try {
			return await executeRun(id, generation, controller.signal, mode, wantedPath);
		} catch (error) {
			if (!isActive(id, generation)) return null;
			presentRunFailure(id, generation, mode, error);
			return null;
		} finally {
			finishRun(id, generation, controller, owner);
		}
	}

	async function resolvePath(id: string, encodedPath: string): Promise<LinkResolution> {
		if (activeId !== id || !mounted) return { kind: 'inconclusive' };
		const current = get(ocuWorkspaces)[id];
		const wantedUrl = encodedFileUrl('/ocu', id, encodedPath);
		const match = (files: WorkspaceFile[]) =>
			files.find((file) => {
				try {
					return workspaceFileUrl('/ocu', id, file) === wantedUrl;
				} catch {
					return false;
				}
			});
		const loaded = match(current?.files ?? []);
		if (loaded) return { kind: 'found', file: loaded };
		const result = await run('poll', encodedPath);
		if (activeId !== id || !result) return { kind: 'inconclusive' };
		const file = match(result.files);
		if (file) return { kind: 'found', file };
		return result.cursor === null ? { kind: 'absent' } : { kind: 'inconclusive' };
	}
	function retry() {
		return run('retry');
	}
	function refresh() {
		return run('refresh');
	}
	function launch() {
		return run('launch');
	}
	function isUnmodifiedClick(event: MouseEvent): event is MouseEvent & { target: Element } {
		return (
			event.button === 0 &&
			!event.defaultPrevented &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey &&
			event.target instanceof Element
		);
	}
	function previewLinkPath(event: MouseEvent, id: string | null): string | null {
		if (!options.available() || !id || activeId !== id || !isUnmodifiedClick(event)) return null;
		const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
		if (!anchor || anchor.hasAttribute('download')) return null;
		const url = new URL(anchor.href);
		if (url.search || url.hash) return null;
		const path = recogniseOcuLink(anchor.href, `${window.location.origin}/ocu`, id);
		return path && path !== 'archive' ? path : null;
	}
	function handleLinkClick(event: MouseEvent, id: string | null) {
		const encodedPath = previewLinkPath(event, id);
		if (!encodedPath || !id) return;
		const owner = ownershipEpoch;
		const currentLink = () => mounted && activeId === id && owner === ownershipEpoch;
		event.preventDefault();
		showArtifacts.set(false);
		showEmbeds.set(false);
		showCallOverlay.set(false);
		showControls.set(true);
		openWorkspacePanel(id);
		void writePrefs(id, { open: true }).catch(() => {
			const current = get(ocuWorkspaces)[id];
			if (currentLink() && current)
				setWorkspacePresentation(id, current.generation, {
					notice: options.translate('Workspace preference could not be saved')
				});
		});
		void resolvePath(id, encodedPath).then((result) => {
			if (!currentLink()) return;
			if (result.kind === 'found') {
				void selectFile(id, result.file).catch(() => {
					const current = get(ocuWorkspaces)[id];
					if (currentLink() && current)
						setWorkspacePresentation(id, current.generation, {
							notice: options.translate('Selection could not be saved')
						});
				});
			} else if (result.kind === 'absent') {
				const current = get(ocuWorkspaces)[id];
				if (current)
					setWorkspacePresentation(id, current.generation, {
						notice: options.translate('Selected file was removed')
					});
			}
		});
	}
	function delegateLinks(node: HTMLElement, id: string | null) {
		let currentId = id;
		const onClick = (event: MouseEvent) => handleLinkClick(event, currentId);
		node.addEventListener('click', onClick);
		return {
			update(nextId: string | null) {
				currentId = nextId;
			},
			destroy() {
				node.removeEventListener('click', onClick);
			}
		};
	}
	function more() {
		return run('more');
	}
	function selectFile(id: string, file: WorkspaceFile) {
		if (activeId !== id) return Promise.resolve();
		selectWorkspaceFile(id, file.file_id);
		return writePrefs(id, { view: 'files', open: true, selected_file_id: file.file_id });
	}
	return {
		observe,
		mount,
		retire,
		acceptHint,
		reconnect,
		refresh,
		retry,
		launch,
		more,
		writePrefs,
		selectFile,
		resolvePath,
		handleLinkClick,
		delegateLinks
	};
}

export type WorkspaceReconciliation = ReturnType<typeof createWorkspaceReconciliation>;
