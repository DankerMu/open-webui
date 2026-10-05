<script lang="ts">
	import { getContext, onMount, tick } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { get } from 'svelte/store';
	import {
		workspaceFileUrl,
		workspaceRuntimeUrl,
		workspaceFilesEnabled,
		type WorkspaceFile
	} from '$lib/apis/ocu';
	import { config } from '$lib/stores';
	import { ocuWorkspaces, selectWorkspaceView, type OcuWorkspaceState } from '$lib/stores/ocu';
	import { formatFileSize } from '$lib/utils';
	import {
		WORKSPACE_RECONCILIATION,
		type WorkspaceReconciliation
	} from './workspace-reconciliation';
	import { buildWorkspaceFileRows, workspaceFileKind } from './workspace-file-rows';
	import {
		OFFICE_EDITOR_ALLOW,
		OFFICE_EDITOR_SANDBOX,
		createOfficeEditorController,
		officeEditorFrame,
		officeEditorSrc
	} from './office-editor-frame';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Refresh from '$lib/components/icons/Refresh.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	import Folder from '$lib/components/icons/Folder.svelte';
	import FolderOpen from '$lib/components/icons/FolderOpen.svelte';
	import GlobeAlt from '$lib/components/icons/GlobeAlt.svelte';
	import Terminal from '$lib/components/icons/Terminal.svelte';
	import Info from '$lib/components/icons/Info.svelte';
	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import ChevronRight from '$lib/components/icons/ChevronRight.svelte';
	import Photo from '$lib/components/icons/Photo.svelte';
	import Document from '$lib/components/icons/Document.svelte';
	import DocumentChartBar from '$lib/components/icons/DocumentChartBar.svelte';
	import ChartBar from '$lib/components/icons/ChartBar.svelte';
	import Code from '$lib/components/icons/Code.svelte';
	import DocumentPage from '$lib/components/icons/DocumentPage.svelte';
	import Download from '$lib/components/icons/Download.svelte';
	import { isSavedChatId } from '$lib/utils/chatId';
	export let chatId: string;
	export let onClose: (() => void) | undefined = undefined;
	const i18n: Writable<i18nType> = getContext('i18n');
	const controller: WorkspaceReconciliation = getContext(WORKSPACE_RECONCILIATION);

	export let enabled = false;
	const READY_DEADLINE = 10_000;
	const RESULT_DEADLINE = 30_000;
	let localNotice = '';
	let previewState = '';
	let previewError = false;
	let officeFrame: HTMLIFrameElement | undefined;
	let frameKey = 0;
	let requestGeneration = 0;
	let readyTimer: ReturnType<typeof setTimeout> | undefined;
	let resultTimer: ReturnType<typeof setTimeout> | undefined;
	let live = false;
	let officeIdentity = '';
	let editorKey = 0;
	let editorFileId = '';
	let editorChatId = '';
	let editorSrc = '';
	let editorError = '';
	const editor = createOfficeEditorController({
		origin: () => window.location.origin,
		onTimeout() {
			editorError = $i18n.t('Office editor did not become ready');
		}
	});
	$: phase = workspace?.phase ?? 'loading';
	$: notice = localNotice || workspace?.notice || '';
	$: busy = workspace?.busy ?? false;
	$: workspace = $ocuWorkspaces[chatId];
	$: fileCount = workspace?.files.length ?? 0;
	$: fileRows = buildWorkspaceFileRows(workspace?.files ?? []);
	$: selected = workspace?.files.find((file) => file.file_id === workspace.selectedFileId);
	$: selectedUrl =
		selected && workspace?.baseUrl ? workspaceFileUrl(workspace.baseUrl, chatId, selected) : '';
	$: office = selected && ['docx', 'xlsx', 'pptx'].includes(selected.type);
	$: officeEdit =
		office &&
		enabled &&
		isSavedChatId(chatId) &&
		chatId !== 'default' &&
		workspaceFilesEnabled($config) &&
		$config?.features &&
		'enable_ocu_office_edit' in $config.features &&
		$config.features.enable_ocu_office_edit === true &&
		workspace?.baseUrl === '/ocu';
	$: generated =
		selected &&
		!office &&
		['text/html', 'image/svg+xml', 'application/xhtml+xml', 'application/xml', 'text/xml'].includes(
			selected.mime.split(';')[0].trim().toLowerCase()
		);
	const FILE_KIND_ICONS = {
		web: GlobeAlt,
		image: Photo,
		document: Document,
		sheet: DocumentChartBar,
		slides: ChartBar,
		code: Code,
		other: DocumentPage
	} as const;
	$: downloadUrl = selectedUrl ? `${selectedUrl}?download=1` : '';
	$: selectedRow = selected
		? fileRows.find((row) => row.kind === 'file' && row.file.file_id === selected.file_id)
		: undefined;
	$: selectedKind = selected ? workspaceFileKind(selected) : 'other';
	$: SelectedKindIcon = FILE_KIND_ICONS[selectedKind];
	$: selectedDirectory =
		selectedRow?.kind === 'file' && selectedRow.nested
			? (fileFolder[fileRows.indexOf(selectedRow)] ?? '')
			: '';
	$: runtimeView =
		workspace?.view === 'browser' || workspace?.view === 'terminal' ? workspace.view : null;
	$: runtimeUrl =
		runtimeView &&
		workspace?.status === 'running' &&
		workspace.baseUrl === '/ocu' &&
		workspace.views.includes(runtimeView)
			? workspaceRuntimeUrl(workspace.baseUrl, chatId, runtimeView)
			: '';
	$: {
		const key =
			live && workspace?.view === 'files' && office && selected && !editorFileId
				? `${selected.file_id}:${selected.path}:${selected.revision}`
				: '';
		if (key && key !== officeIdentity) {
			officeIdentity = key;
			void startOffice();
		} else if (!key && officeIdentity) {
			officeIdentity = '';
			retireFrame();
		}
	}
	$: {
		if (
			editorFileId &&
			(!live ||
				!officeEdit ||
				workspace?.view !== 'files' ||
				editorChatId !== chatId ||
				selected?.file_id !== editorFileId)
		)
			stopEditor();
	}

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

	function selectFile(file: WorkspaceFile) {
		localNotice = '';
		if (selected?.file_id === file.file_id && office && !editorFileId) void startOffice();
		else {
			previewState = '';
			previewError = false;
		}
		void controller.selectFile(chatId, file).catch(() => {
			if (live) localNotice = $i18n.t('Selection could not be saved');
		});
	}

	function selectView(view: OcuWorkspaceState['view']) {
		const current = get(ocuWorkspaces)[chatId];
		if (!live || !current || current.view === view) return;
		if (
			view !== 'files' &&
			(current.status !== 'running' || current.baseUrl !== '/ocu' || !current.views.includes(view))
		)
			return;
		localNotice = '';
		selectWorkspaceView(chatId, view);
		void controller.writePrefs(chatId, { view, open: true }).catch(() => {
			if (live) localNotice = $i18n.t('Workspace preference could not be saved');
		});
	}

	function refresh() {
		localNotice = '';
		void controller.refresh();
	}
	function load(launch = false) {
		localNotice = '';
		if (launch) void controller.launch();
		else void controller.retry();
	}
	function loadMore() {
		localNotice = '';
		void controller.more();
	}
	function stopEditor() {
		editor.dispose();
		editorFileId = '';
		editorChatId = '';
		editorSrc = '';
		editorError = '';
	}
	function startEditor() {
		if (!live || !officeEdit || !selected || !workspace?.baseUrl) return;
		editorError = '';
		editorSrc = officeEditorSrc(workspace.baseUrl, chatId);
		editor.start(chatId, selected.file_id, new URL(editorSrc, window.location.origin).href);
		editorFileId = selected.file_id;
		editorChatId = chatId;
		editorKey += 1;
	}

	let collapsedFolders = new Set<string>();
	function toggleFolder(path: string) {
		const next = new Set(collapsedFolders);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		collapsedFolders = next;
	}
	$: fileFolder = (() => {
		const membership: string[] = [];
		let current = '';
		for (const row of fileRows) {
			if (row.kind === 'folder') {
				current = row.path;
				membership.push('');
				continue;
			}
			membership.push(row.nested ? current : '');
			if (!row.nested) current = '';
		}
		return membership;
	})();
	onMount(() => {
		if (!enabled || !isSavedChatId(chatId) || chatId === 'default') return;
		live = true;
		window.addEventListener('message', receivePreview);
		return () => {
			live = false;
			stopEditor();
			retireFrame();
			window.removeEventListener('message', receivePreview);
		};
	});
</script>

<section class="flex h-full min-h-0 flex-col gap-2 p-3" aria-label={$i18n.t('Workspace Files')}>
	<header
		class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 pb-2 dark:border-gray-800"
	>
		<div class="flex min-w-0 items-center gap-2">
			<h2 class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
				{$i18n.t('Workspace Files')}
			</h2>
			{#if fileCount}
				<span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">
					{#if workspace?.nextCursor}
						{$i18n.t('{{count}}+ files', { count: fileCount })}
					{:else}
						{$i18n.t('{{count}} files', { count: fileCount })}
					{/if}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-1">
			<Tooltip content={$i18n.t('Refresh')}>
				<button
					class="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
					type="button"
					on:click={refresh}
					disabled={busy}
					aria-label={$i18n.t('Refresh workspace files')}
					><Refresh className={`size-4 ${busy ? 'animate-spin' : ''}`} /></button
				>
			</Tooltip>
			{#if onClose}
				<Tooltip content={$i18n.t('Close')}>
					<button
						class="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-800"
						type="button"
						on:click={onClose}
						aria-label={$i18n.t('Close workspace')}><XMark className="size-4" /></button
					>
				</Tooltip>
			{/if}
		</div>
	</header>
	<nav
		class="flex shrink-0 gap-1 rounded-lg border border-gray-100 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-850"
		aria-label={$i18n.t('Workspace views')}
	>
		<button
			class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 {workspace?.view ===
			'files'
				? 'bg-white font-medium shadow-sm dark:bg-gray-700'
				: 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
			type="button"
			on:click={() => selectView('files')}
			aria-pressed={workspace?.view === 'files'}
			><Folder className="size-4" />{$i18n.t('Files')}</button
		>
		{#if workspace?.views.includes('browser')}
			<button
				class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-40 {workspace.view ===
				'browser'
					? 'bg-white font-medium shadow-sm dark:bg-gray-700'
					: 'text-gray-500 enabled:hover:bg-gray-100 dark:text-gray-400 dark:enabled:hover:bg-gray-800'}"
				type="button"
				on:click={() => selectView('browser')}
				disabled={workspace.status !== 'running' || workspace.baseUrl !== '/ocu'}
				aria-pressed={workspace.view === 'browser'}
				><GlobeAlt className="size-4" />{$i18n.t('Browser')}</button
			>
		{/if}
		{#if workspace?.views.includes('terminal')}
			<button
				class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-40 {workspace.view ===
				'terminal'
					? 'bg-white font-medium shadow-sm dark:bg-gray-700'
					: 'text-gray-500 enabled:hover:bg-gray-100 dark:text-gray-400 dark:enabled:hover:bg-gray-800'}"
				type="button"
				on:click={() => selectView('terminal')}
				disabled={workspace.status !== 'running' || workspace.baseUrl !== '/ocu'}
				aria-pressed={workspace.view === 'terminal'}
				><Terminal className="size-4" />{$i18n.t('Terminal')}</button
			>
		{/if}
	</nav>
	{#if notice}<p
			class="flex shrink-0 items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
			role="alert"
		>
			<Info className="size-4 shrink-0" />{notice}
		</p>{/if}
	{#if runtimeUrl}
		<div
			class="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
		>
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
		</div>
	{:else}
		{#if phase === 'loading'}
			<p class="sr-only" role="status">{$i18n.t('Loading workspace files')}</p>
			<div class="space-y-2" aria-hidden="true">
				{#each [0, 1, 2] as row}
					<div class="flex h-8 items-center gap-2 rounded-lg bg-gray-50 px-2 dark:bg-gray-850">
						<div class="size-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
						<div
							class="h-2 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
							style:width={`${70 - row * 15}%`}
						></div>
					</div>
				{/each}
			</div>
		{/if}
		{#if phase === 'unavailable'}<p
				class="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-850 dark:text-gray-400"
				role="status"
			>
				<Info className="mt-0.5 size-4 shrink-0" />
				{$i18n.t('This workspace is created by the first tool call.')}
			</p>{/if}
		{#if phase === 'disconnected'}<p
				class="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
				role="alert"
			>
				<Info className="size-4 shrink-0" />
				{$i18n.t('Workspace service is unreachable.')}
				<button
					class="h-7 rounded-md border border-current/20 px-2 text-xs font-medium hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-900/30"
					type="button"
					on:click={() => load()}>{$i18n.t('Reconnect')}</button
				>
			</p>{/if}
		{#if phase === 'error'}<p
				class="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
				role="alert"
			>
				<Info className="size-4 shrink-0" />
				{$i18n.t('Workspace files could not be loaded.')}
				<button
					class="h-7 rounded-md border border-current/20 px-2 text-xs font-medium hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-900/30"
					type="button"
					on:click={() => load()}>{$i18n.t('Retry')}</button
				>
			</p>{/if}
		{#if workspace?.status === 'stopped'}<p
				class="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-850 dark:text-gray-400"
				role="status"
			>
				<Info className="size-4 shrink-0" />
				{$i18n.t('Workspace is stopped; saved files remain available.')}
				{#if workspace?.capabilities.includes('launch')}<button
						class="h-7 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
						type="button"
						on:click={() => load(true)}>{$i18n.t('Launch')}</button
					>{/if}
			</p>{/if}
		{#if phase === 'empty' || (phase === 'stopped' && !workspace?.files.length)}<p
				class="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-850 dark:text-gray-400"
				role="status"
			>
				<Folder className="size-4 shrink-0" />
				{$i18n.t('No workspace files yet.')}
			</p>{/if}
		{#if workspace?.files.length}
			<ul
				aria-label={$i18n.t('Workspace file list')}
				class="min-h-0 overflow-y-auto {selected ? 'max-h-[40%] shrink-0' : 'flex-1'}"
			>
				{#each fileRows as row, index (row.kind === 'folder' ? `folder:${row.path}` : `file:${row.file.file_id}`)}
					{#if row.kind === 'folder'}
						<li>
							<button
								type="button"
								class="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-gray-500 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-white/4"
								aria-label={$i18n.t('Folder {{path}}', { path: row.path })}
								aria-expanded={!collapsedFolders.has(row.path)}
								on:click={() => toggleFolder(row.path)}
							>
								{#if collapsedFolders.has(row.path)}
									<ChevronRight className="size-4 shrink-0" />
									<Folder className="size-4 shrink-0" />
								{:else}
									<ChevronDown className="size-4 shrink-0" />
									<FolderOpen className="size-4 shrink-0" />
								{/if}
								<span class="min-w-0 flex-1 truncate">{row.path}</span>
								<span class="shrink-0">{row.count}</span>
							</button>
						</li>
					{:else}
						{@const fileKind = workspaceFileKind(row.file)}
						{@const KindIcon = FILE_KIND_ICONS[fileKind]}
						{@const accessibleName = row.file.name || row.file.path}
						{@const folder = fileFolder[index] ?? ''}
						<li hidden={row.nested && collapsedFolders.has(folder)}>
							<Tooltip content={row.name} className="block w-full" as="div">
								<button
									type="button"
									class="flex h-8 w-full items-center gap-1.5 rounded-lg pr-2 text-left hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-400 dark:hover:bg-white/4 {row.nested
										? 'pl-7'
										: 'pl-2'} {selected?.file_id === row.file.file_id
										? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100'
										: 'text-gray-700 dark:text-gray-200'}"
									title={row.name}
									on:click={() => selectFile(row.file)}
									aria-label={accessibleName}
									aria-pressed={selected?.file_id === row.file.file_id}
								>
									<span data-file-kind={fileKind} class="contents">
										<KindIcon className="size-4 shrink-0" />
									</span>
									<span class="min-w-0 flex-1 truncate text-sm">{row.name}</span>
									<span data-file-size class="shrink-0 text-xs text-gray-400" aria-hidden="true"
										>{formatFileSize(row.file.size)}</span
									>
								</button>
							</Tooltip>
						</li>
					{/if}
				{/each}
			</ul>
			{#if workspace.nextCursor}<button
					type="button"
					class="h-8 w-full rounded-lg px-2 text-left text-xs text-gray-500 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/4"
					on:click={loadMore}
					disabled={busy}>{$i18n.t('More files')}</button
				>{/if}
		{/if}
		{#if selected && downloadUrl}
			<div
				class="flex min-h-0 flex-1 flex-col gap-2 overflow-visible"
				aria-label={$i18n.t('Selected workspace file')}
			>
				<div
					data-selected-bar
					class="flex h-8 shrink-0 items-center gap-1.5 overflow-visible border-b border-gray-100 pr-1 dark:border-gray-800"
				>
					<span data-file-kind={selectedKind} class="contents">
						<svelte:component this={SelectedKindIcon} className="size-4 shrink-0" />
					</span>
					<Tooltip
						content={selectedRow?.kind === 'file' ? selectedRow.name : selected.name}
						className="min-w-0 flex-1"
						as="div"
					>
						<span
							data-selected-name
							class="block min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100"
							>{selectedRow?.kind === 'file' ? selectedRow.name : selected.name}</span
						>
					</Tooltip>
					{#if selectedDirectory}
						<span class="min-w-0 max-w-[30%] truncate text-xs text-gray-400"
							>{selectedDirectory}</span
						>
					{/if}
					<span data-file-size class="shrink-0 text-xs text-gray-400" aria-hidden="true"
						>{formatFileSize(selected.size)}</span
					>
					<div class="ml-auto flex shrink-0 items-center gap-1">
						{#if officeEdit}
							<Tooltip content={$i18n.t('Edit')} className="flex">
								<button
									class="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-800"
									type="button"
									on:click={startEditor}
									aria-label={$i18n.t('Edit')}><Pencil className="size-4" /></button
								>
							</Tooltip>
						{/if}
						<Tooltip content={$i18n.t('Download')} className="flex">
							<a
								class="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-800"
								href={downloadUrl}
								download={selected.name}
								><span class="sr-only">{$i18n.t('Download')} {selected.name}</span><Download
									className="size-4"
								/></a
							>
						</Tooltip>
					</div>
				</div>
				<div
					data-selected-preview
					class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
				>
					{#if generated}
						<iframe
							title={selected.name}
							src={`${selectedUrl}?revision=${selected.revision}`}
							sandbox="allow-scripts allow-forms"
							class="min-h-0 w-full flex-1 border-0"
						></iframe>
					{:else if editorFileId && selected.file_id === editorFileId}
						{#if editorError}
							<div
								class="m-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
							>
								<p role="status">{editorError}</p>
								<button
									class="h-7 rounded-md border border-current/20 px-2 text-xs font-medium hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-900/30"
									type="button"
									on:click={startEditor}>{$i18n.t('Retry')}</button
								>
							</div>
						{:else}
							{#key editorKey}<iframe
									use:officeEditorFrame={editor}
									title={`${$i18n.t('Office editor')}: ${selected.name}`}
									src={editorSrc}
									sandbox={OFFICE_EDITOR_SANDBOX}
									allow={OFFICE_EDITOR_ALLOW}
									class="min-h-0 w-full flex-1 border-0"
								></iframe>{/key}
						{/if}
					{:else if office}
						{#if previewError}
							<div
								class="m-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400"
							>
								{#if previewState}<p role="status">{previewState}</p>{/if}
								<button
									class="h-7 rounded-md border border-current/20 px-2 text-xs font-medium hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-900/30"
									type="button"
									on:click={startOffice}>{$i18n.t('Retry Office preview')}</button
								>
							</div>
						{:else}
							{#if previewState}
								<p
									class="flex shrink-0 items-center gap-2 px-3 py-2 text-xs text-gray-500 dark:text-gray-400"
									role="status"
								>
									<Spinner className="size-4" />{previewState}
								</p>
							{/if}
							{#key frameKey}<iframe
									bind:this={officeFrame}
									title={`${$i18n.t('Office preview')}: ${selected.name}`}
									src={`${workspace.baseUrl}/preview/${encodeURIComponent(chatId)}?embed=files`}
									sandbox="allow-scripts allow-same-origin allow-forms"
									class="min-h-0 w-full flex-1 border-0"
								></iframe>{/key}
						{/if}
					{:else}
						<div
							class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
						>
							<span data-file-kind={selectedKind} class="contents">
								<svelte:component
									this={SelectedKindIcon}
									className="size-8 shrink-0 text-gray-400"
								/>
							</span>
							<p class="text-sm text-gray-500 dark:text-gray-400" role="status">
								{$i18n.t('Preview not supported for this file type. Download the file to open it.')}
							</p>
							<a
								class="h-8 rounded-md border border-gray-200 px-3 text-xs font-medium leading-8 text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
								href={downloadUrl}
								download={selected.name}>{$i18n.t('Download')}</a
							>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</section>
