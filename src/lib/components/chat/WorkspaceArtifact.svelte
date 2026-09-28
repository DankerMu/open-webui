<script lang="ts">
	import { getContext, onMount, tick } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { get } from 'svelte/store';
	import {
		getWorkspace,
		launchWorkspace,
		listWorkspaceFiles,
		putWorkspacePrefs,
		refreshWorkspace,
		workspaceFileUrl,
		workspaceRuntimeUrl,
		WorkspaceRequestError,
		type WorkspaceFile,
		type WorkspacePrefs
	} from '$lib/apis/ocu';
	import {
		applyDescribe,
		applyWorkspaceListing,
		beginGeneration,
		isCurrentGeneration,
		ocuWorkspaces,
		queueWorkspacePrefs,
		type OcuWorkspaceState,
		retireGeneration,
		selectWorkspaceView,
		selectWorkspaceFile
	} from '$lib/stores/ocu';

	import { isSavedChatId } from '$lib/utils/chatId';
	export let chatId: string;
	export let onClose: (() => void) | undefined = undefined;
	const i18n: Writable<i18nType> = getContext('i18n');

	export let enabled = false;
	const READY_DEADLINE = 10_000;
	const RESULT_DEADLINE = 30_000;
	const MAX_PAGES = 100;
	let phase: 'loading' | 'ready' | 'empty' | 'error' | 'stopped' | 'disconnected' | 'unavailable' =
		'loading';
	let notice = '';
	let previewState = '';
	let previewError = false;
	let busy = false;
	let officeFrame: HTMLIFrameElement | undefined;
	let frameKey = 0;
	let requestGeneration = 0;
	let readyTimer: ReturnType<typeof setTimeout> | undefined;
	let resultTimer: ReturnType<typeof setTimeout> | undefined;
	let live = false;
	let activeGeneration = 0;
	$: workspace = $ocuWorkspaces[chatId];
	$: selected = workspace?.files.find((file) => file.file_id === workspace.selectedFileId);
	$: selectedUrl =
		selected && workspace?.baseUrl ? workspaceFileUrl(workspace.baseUrl, chatId, selected) : '';
	$: office = selected && ['docx', 'xlsx', 'pptx'].includes(selected.type);
	$: generated =
		selected &&
		!office &&
		['text/html', 'image/svg+xml', 'application/xhtml+xml', 'application/xml', 'text/xml'].includes(
			selected.mime.split(';')[0].trim().toLowerCase()
		);
	$: downloadUrl = selectedUrl ? `${selectedUrl}?download=1` : '';
	$: runtimeView =
		workspace?.view === 'browser' || workspace?.view === 'terminal' ? workspace.view : null;
	$: runtimeUrl =
		runtimeView &&
		workspace?.status === 'running' &&
		workspace.baseUrl === '/ocu' &&
		workspace.views.includes(runtimeView)
			? workspaceRuntimeUrl(workspace.baseUrl, chatId, runtimeView)
			: '';

	function retireFrame() {
		clearTimeout(readyTimer);
		clearTimeout(resultTimer);
		readyTimer = undefined;
		resultTimer = undefined;
		requestGeneration++;
		frameKey++;
		officeFrame = undefined;
	}

	function frameFailure(message: string) {
		retireFrame();
		previewState = message;
		previewError = true;
	}

	async function startOffice() {
		retireFrame();
		previewState = $i18n.t('Connecting Office preview');
		previewError = false;
		const key = frameKey;
		await tick();
		if (!live || !office || !officeFrame || key !== frameKey) return;
		readyTimer = setTimeout(
			() => frameFailure($i18n.t('Office preview did not become ready')),
			READY_DEADLINE
		);
	}

	function trustedPreviewFrame(event: MessageEvent): HTMLIFrameElement | undefined {
		const frame = officeFrame;
		if (!live || !selected || !office || !frame?.contentWindow) return;
		if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
		const expected = new URL(
			`${workspace?.baseUrl}/preview/${encodeURIComponent(chatId)}?embed=files`,
			window.location.origin
		);
		if (frame.src !== expected.href) return;
		return frame;
	}

	type OfficeStateMessage = {
		type: 'ocu:preview-state';
		chat_id: string;
		file_id: string;
		generation: number;
		state: 'loading' | 'ready' | 'error' | 'missing' | 'unsupported';
	};

	function matchingOfficeState(data: unknown, file: WorkspaceFile): data is OfficeStateMessage {
		if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
		if (Object.keys(data).sort().join(',') !== 'chat_id,file_id,generation,state,type')
			return false;
		return (
			'type' in data &&
			data.type === 'ocu:preview-state' &&
			'chat_id' in data &&
			data.chat_id === chatId &&
			'file_id' in data &&
			data.file_id === file.file_id &&
			'generation' in data &&
			data.generation === requestGeneration &&
			'state' in data &&
			typeof data.state === 'string' &&
			['loading', 'ready', 'error', 'missing', 'unsupported'].includes(data.state)
		);
	}

	function validPreviewEnvelope(data: unknown): data is { chat_id: string; type: unknown } {
		return (
			!!data &&
			typeof data === 'object' &&
			!Array.isArray(data) &&
			'chat_id' in data &&
			data.chat_id === chatId &&
			'type' in data
		);
	}

	function receivePreview(event: MessageEvent) {
		const frame = trustedPreviewFrame(event);
		const file = selected;
		if (!frame?.contentWindow || !file) return;
		const data: unknown = event.data;
		if (!validPreviewEnvelope(data)) return;
		if (data.type === 'ocu:preview-ready') {
			if (Object.keys(data).sort().join(',') !== 'chat_id,type' || !readyTimer) return;
			clearTimeout(readyTimer);
			readyTimer = undefined;
			const generation = ++requestGeneration;
			previewState = $i18n.t('Rendering Office file');
			frame.contentWindow.postMessage(
				{ type: 'ocu:preview-select', chat_id: chatId, file_id: file.file_id, generation },
				window.location.origin
			);
			resultTimer = setTimeout(
				() => frameFailure($i18n.t('Office preview timed out')),
				RESULT_DEADLINE
			);
			return;
		}
		if (!matchingOfficeState(data, file) || !resultTimer) return;
		if (data.state === 'loading') return;
		clearTimeout(resultTimer);
		resultTimer = undefined;
		previewError = data.state !== 'ready';
		if (!previewError) {
			previewState = '';
			return;
		}
		const stateLabel =
			data.state === 'error'
				? $i18n.t('error')
				: data.state === 'missing'
					? $i18n.t('missing')
					: $i18n.t('unsupported');
		previewState = $i18n.t('Office preview {{state}}', { state: stateLabel });
	}

	function savePrefs(prefs: WorkspacePrefs): Promise<void> {
		return queueWorkspacePrefs(chatId, async () => {
			if (live) await putWorkspacePrefs(localStorage.token, chatId, prefs);
		});
	}

	function selectFile(file: WorkspaceFile) {
		retireFrame();
		selectWorkspaceFile(chatId, file.file_id);
		previewState = '';
		previewError = false;
		if (['docx', 'xlsx', 'pptx'].includes(file.type)) void startOffice();
		const generation = activeGeneration;
		void savePrefs({ view: 'files', open: true, selected_file_id: file.file_id }).catch(() => {
			if (live && isCurrentGeneration(chatId, generation))
				notice = $i18n.t('Selection could not be saved');
		});
	}

	function returnToFiles() {
		selectWorkspaceView(chatId, 'files');
		if (selected && office) void startOffice();
	}

	function selectView(view: OcuWorkspaceState['view']) {
		const current = get(ocuWorkspaces)[chatId];
		if (!live || !current || current.view === view) return;
		if (
			view !== 'files' &&
			(current.status !== 'running' || current.baseUrl !== '/ocu' || !current.views.includes(view))
		)
			return;
		if (current.view === 'files') retireFrame();
		if (view === 'files') returnToFiles();
		else selectWorkspaceView(chatId, view);
		const generation = activeGeneration;
		void savePrefs({
			view,
			open: true,
			selected_file_id: current.selectedFileId ?? null
		}).catch(() => {
			if (live && isCurrentGeneration(chatId, generation))
				notice = $i18n.t('Workspace preference could not be saved');
		});
	}

	type ListingWindow = { files: WorkspaceFile[]; revision: number; cursor: string | null };
	// A missing identity requires the final page; a found identity retains the loaded window.
	function windowReady(
		cursor: string | null,
		loaded: number,
		required: number,
		selectedId: string | undefined,
		seen: Set<string>
	): boolean {
		if (!cursor) return true;
		return loaded >= required && (!selectedId || seen.has(selectedId));
	}

	async function readPageSequence(
		baseUrl: string,
		generation: number,
		initial: WorkspaceFile[],
		startCursor: string | null,
		startRevision: number | undefined,
		requiredCount: number,
		selectedId: string | undefined
	): Promise<ListingWindow | null> {
		const files = [...initial];
		const seen = new Set(files.map((file) => file.file_id));
		let cursor = startCursor;
		let revision = startRevision;
		for (let pages = 0; pages < MAX_PAGES; pages++) {
			const page = await listWorkspaceFiles(baseUrl, chatId, cursor ?? undefined);
			if (!live || !isCurrentGeneration(chatId, generation)) return null;
			if (revision !== undefined && revision !== page.revision)
				throw new WorkspaceRequestError(409, 'stale_cursor');
			revision = page.revision;
			for (const file of page.files) {
				if (seen.has(file.file_id)) throw new WorkspaceRequestError(0, 'invalid_response');
				seen.add(file.file_id);
				files.push(file);
			}
			if (page.next_cursor === cursor && cursor !== null)
				throw new WorkspaceRequestError(0, 'invalid_response');
			cursor = page.next_cursor;
			if (!cursor && files.length !== page.total)
				throw new WorkspaceRequestError(0, 'listing_incomplete');
			if (windowReady(cursor, files.length, requiredCount, selectedId, seen))
				return { files, revision, cursor };
		}
		throw new WorkspaceRequestError(0, 'listing_incomplete');
	}

	async function reconcileSelection(
		current: OcuWorkspaceState,
		generation: number,
		result: ListingWindow
	) {
		const selectedId = current.selectedFileId;
		if (!selectedId) return;
		const after = result.files.find((file) => file.file_id === selectedId);
		if (!after && !result.cursor) {
			retireFrame();
			selectWorkspaceFile(chatId, undefined);
			notice = $i18n.t('Selected file was removed');
			try {
				await savePrefs({ view: current.view, open: current.open, selected_file_id: null });
			} catch {
				if (live && isCurrentGeneration(chatId, generation))
					notice = $i18n.t('Selected file was removed; preference could not be cleared');
			}
			return;
		}
		const before = current.files.find((file) => file.file_id === selectedId);
		if (before && after && (before.path !== after.path || before.revision !== after.revision)) {
			retireFrame();
			if (['docx', 'xlsx', 'pptx'].includes(after.type)) void startOffice();
		}
	}

	async function readCoherentWindow(current: OcuWorkspaceState, generation: number, more: boolean) {
		if (!current.baseUrl) throw new WorkspaceRequestError(0, 'invalid_response');
		const requiredCount = current.files.length + (more ? 1 : 0);
		try {
			return await readPageSequence(
				current.baseUrl,
				generation,
				more ? current.files : [],
				more ? current.nextCursor : null,
				more ? current.listingRevision : undefined,
				requiredCount,
				current.selectedFileId
			);
		} catch (error) {
			if (!(error instanceof WorkspaceRequestError && error.status === 409)) throw error;
			return readPageSequence(
				current.baseUrl,
				generation,
				[],
				null,
				undefined,
				requiredCount,
				current.selectedFileId
			);
		}
	}

	async function reconcile(generation: number, more = false): Promise<void> {
		const current = get(ocuWorkspaces)[chatId];
		const result = await readCoherentWindow(current, generation, more);
		if (!result || !live || !isCurrentGeneration(chatId, generation)) return;
		const latestSelection = get(ocuWorkspaces)[chatId]?.selectedFileId;
		if (
			latestSelection !== current.selectedFileId &&
			latestSelection &&
			!result.files.some((file) => file.file_id === latestSelection)
		) {
			notice = $i18n.t('Selection changed during refresh; refresh again');
			return;
		}
		applyWorkspaceListing(chatId, generation, result.files, result.revision, result.cursor);
		phase = current.status === 'stopped' ? 'stopped' : result.files.length ? 'ready' : 'empty';
		await reconcileSelection({ ...current, selectedFileId: latestSelection }, generation, result);
	}

	async function describe(generation: number) {
		const body = await getWorkspace(localStorage.token, chatId);
		if (!live || !isCurrentGeneration(chatId, generation)) return null;
		if (
			body.chat_id !== chatId ||
			!Array.isArray(body.capabilities) ||
			!Array.isArray(body.views) ||
			!['running', 'stopped', 'unavailable'].includes(body.status)
		)
			throw new WorkspaceRequestError(0, 'invalid_response');
		applyDescribe(chatId, generation, body);
		const currentView = get(ocuWorkspaces)[chatId]?.view;
		if (
			currentView &&
			currentView !== 'files' &&
			(body.status !== 'running' || body.base_url !== '/ocu' || !body.views.includes(currentView))
		) {
			returnToFiles();
			notice = $i18n.t('Workspace view is unavailable');
		}
		if (body.status === 'unavailable') {
			phase = body.reason === 'ocu_unreachable' ? 'disconnected' : 'unavailable';
			return null;
		}
		return body;
	}

	async function load(launch = false) {
		if (busy || !live) return;
		busy = true;
		notice = '';
		const generation = (activeGeneration = beginGeneration(chatId));
		if (!get(ocuWorkspaces)[chatId]?.files.length) phase = 'loading';
		try {
			if (launch) {
				await launchWorkspace(localStorage.token, chatId);
				if (!live || !isCurrentGeneration(chatId, generation)) return;
			}
			if (!(await describe(generation))) return;
			await reconcile(generation);
		} catch (error) {
			if (!live || !isCurrentGeneration(chatId, generation)) return;
			phase = 'error';
			notice =
				error instanceof WorkspaceRequestError
					? $i18n.t('Workspace {{reason}}', { reason: error.reason })
					: $i18n.t('Workspace request failed');
		} finally {
			if (live && isCurrentGeneration(chatId, generation)) busy = false;
		}
	}

	async function loadMore() {
		if (busy || !workspace?.nextCursor || !live) return;
		busy = true;
		notice = '';
		const generation = (activeGeneration = beginGeneration(chatId));
		try {
			await reconcile(generation, true);
		} catch {
			if (live && isCurrentGeneration(chatId, generation))
				notice = $i18n.t('More files could not be loaded; existing files remain available');
		} finally {
			if (live && isCurrentGeneration(chatId, generation)) busy = false;
		}
	}

	async function refresh() {
		if (busy || !live) return;
		busy = true;
		notice = '';
		const generation = (activeGeneration = beginGeneration(chatId));
		try {
			const body = await describe(generation);
			if (!body) return;
			if (body.capabilities.includes('refresh')) {
				await refreshWorkspace(localStorage.token, chatId);
				if (!live || !isCurrentGeneration(chatId, generation)) return;
			}
			await reconcile(generation);
		} catch {
			if (live && isCurrentGeneration(chatId, generation)) {
				notice = $i18n.t('Refresh failed; existing files remain available');
				if (!get(ocuWorkspaces)[chatId]?.files.length) phase = 'error';
			}
		} finally {
			if (live && isCurrentGeneration(chatId, generation)) busy = false;
		}
	}

	onMount(() => {
		if (!enabled || !isSavedChatId(chatId) || chatId === 'default') return;
		live = true;
		window.addEventListener('message', receivePreview);
		void load();
		return () => {
			live = false;
			retireFrame();
			retireGeneration(chatId);
			window.removeEventListener('message', receivePreview);
		};
	});
</script>

<section class="flex h-full flex-col gap-2 p-3" aria-label={$i18n.t('Workspace Files')}>
	<header class="flex items-center justify-between">
		<h2>{$i18n.t('Workspace Files')}</h2>
		<div class="flex items-center gap-2">
			<button
				type="button"
				on:click={refresh}
				disabled={busy}
				aria-label={$i18n.t('Refresh workspace files')}>{$i18n.t('Refresh')}</button
			>
			{#if onClose}<button type="button" on:click={onClose} aria-label={$i18n.t('Close workspace')}
					>{$i18n.t('Close')}</button
				>{/if}
		</div>
	</header>
	<nav class="flex gap-2" aria-label={$i18n.t('Workspace views')}>
		<button
			type="button"
			on:click={() => selectView('files')}
			aria-pressed={workspace?.view === 'files'}>{$i18n.t('Files')}</button
		>
		{#if workspace?.views.includes('browser')}
			<button
				type="button"
				on:click={() => selectView('browser')}
				disabled={workspace.status !== 'running' || workspace.baseUrl !== '/ocu'}
				aria-pressed={workspace.view === 'browser'}>{$i18n.t('Browser')}</button
			>
		{/if}
		{#if workspace?.views.includes('terminal')}
			<button
				type="button"
				on:click={() => selectView('terminal')}
				disabled={workspace.status !== 'running' || workspace.baseUrl !== '/ocu'}
				aria-pressed={workspace.view === 'terminal'}>{$i18n.t('Terminal')}</button
			>
		{/if}
	</nav>
	{#if notice}<p role="alert">{notice}</p>{/if}
	{#if runtimeUrl}
		{#key `${chatId}:${runtimeView}`}
			<iframe
				title={$i18n.t('Workspace {{view}}', {
					view: $i18n.t(runtimeView === 'browser' ? 'Browser' : 'Terminal')
				})}
				src={runtimeUrl}
				sandbox="allow-scripts allow-same-origin allow-forms"
				class="min-h-0 w-full flex-1"
			></iframe>
		{/key}
	{:else}
		{#if phase === 'loading'}<p role="status">{$i18n.t('Loading workspace files')}</p>{/if}
		{#if phase === 'unavailable'}<p role="status">
				{$i18n.t('This workspace is created by the first tool call.')}
			</p>{/if}
		{#if phase === 'disconnected'}<p role="alert">
				{$i18n.t('Workspace service is unreachable.')}
				<button type="button" on:click={() => load()}>{$i18n.t('Reconnect')}</button>
			</p>{/if}
		{#if phase === 'error'}<p role="alert">
				{$i18n.t('Workspace files could not be loaded.')}
				<button type="button" on:click={() => load()}>{$i18n.t('Retry')}</button>
			</p>{/if}
		{#if workspace?.status === 'stopped'}<p role="status">
				{$i18n.t('Workspace is stopped; saved files remain available.')}
				{#if workspace?.capabilities.includes('launch')}<button
						type="button"
						on:click={() => load(true)}>{$i18n.t('Launch')}</button
					>{/if}
			</p>{/if}
		{#if phase === 'empty' || (phase === 'stopped' && !workspace?.files.length)}<p role="status">
				{$i18n.t('No workspace files yet.')}
			</p>{/if}
		{#if workspace?.files.length}
			<ul aria-label={$i18n.t('Workspace file list')} class="overflow-y-auto shrink-0 max-h-48">
				{#each workspace.files as file (file.file_id)}
					<li>
						<button
							type="button"
							on:click={() => selectFile(file)}
							aria-pressed={selected?.file_id === file.file_id}>{file.name || file.path}</button
						>
					</li>
				{/each}
			</ul>
			{#if workspace.nextCursor}<button type="button" on:click={loadMore} disabled={busy}
					>{$i18n.t('More files')}</button
				>{/if}
		{/if}
		{#if selected && downloadUrl}
			<div class="flex flex-col min-h-0 flex-1" aria-label={$i18n.t('Selected workspace file')}>
				<a href={downloadUrl} download={selected.name}>{$i18n.t('Download')} {selected.name}</a>
				{#if generated}
					<iframe
						title={selected.name}
						src={`${selectedUrl}?revision=${selected.revision}`}
						sandbox="allow-scripts allow-forms"
						class="w-full flex-1"
					></iframe>
				{:else if office}
					{#if previewState}<p role="status">{previewState}</p>{/if}
					{#if previewError}
						<button type="button" on:click={startOffice}>{$i18n.t('Retry Office preview')}</button>
					{:else}
						{#key frameKey}<iframe
								bind:this={officeFrame}
								title={`${$i18n.t('Office preview')}: ${selected.name}`}
								src={`${workspace.baseUrl}/preview/${encodeURIComponent(chatId)}?embed=files`}
								sandbox="allow-scripts allow-same-origin allow-forms"
								class="w-full flex-1"
							></iframe>{/key}
					{/if}
				{:else}<p role="status">
						{$i18n.t('Preview not supported for this file type. Download the file to open it.')}
					</p>{/if}
			</div>
		{/if}
	{/if}
</section>
