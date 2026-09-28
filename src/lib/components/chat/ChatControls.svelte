<script context="module" lang="ts">
	let savedTab: 'controls' | 'files' | 'overview' = 'controls';
</script>

<script lang="ts">
	import { onMount, tick, getContext } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import {
		config,
		terminalServers,
		showControls,
		showCallOverlay,
		temporaryChatEnabled,
		showArtifacts,
		showEmbeds,
		settings,
		showFileNavPath,
		selectedTerminalId,
		user
	} from '$lib/stores';

	import Controls from './Controls/Controls.svelte';
	import CallOverlay from './MessageInput/CallOverlay.svelte';
	import Drawer from '../common/Drawer.svelte';
	import ResizableSidePanel from '../common/ResizableSidePanel.svelte';
	import Artifacts from './Artifacts.svelte';
	import Embeds from './ChatControls/Embeds.svelte';
	import FileNav from './FileNav.svelte';
	import PyodideFileNav from './PyodideFileNav.svelte';
	import Overview from './Overview.svelte';
	import { isSavedChatId } from '$lib/utils/chatId';
	import WorkspaceArtifact from './WorkspaceArtifact.svelte';
	import { putWorkspacePrefs, workspaceFilesEnabled } from '$lib/apis/ocu';
	import {
		closeWorkspacePanel,
		ocuWorkspaces,
		openWorkspacePanel,
		queueWorkspacePrefs
	} from '$lib/stores/ocu';

	const i18n: Writable<i18nType> = getContext('i18n');

	export let history;
	export let models = [];

	export let chatId: string | null = null;
	export let chatUser = null;

	export let chatFiles = [];
	export let params = {};

	export let eventTarget: EventTarget;
	export let submitPrompt: Function;
	export let stopResponse: Function;
	export let showMessage: Function;
	export let ensureSavedChat: () => Promise<string | null>;
	export let firstSendPending = false;
	export let files;
	export let modelId;

	export let codeInterpreterEnabled = false;

	let largeScreen = false;
	let dragged = false;
	let mounted = false;
	let controlsWidth = 350;

	let workspaceActionPending = false;
	let workspaceError = '';
	let controlsWasOpen = false;
	let actionEpoch = 0;
	let actionChatId = chatId;
	let actionHistory = history;
	$: if (actionChatId !== chatId || actionHistory !== history) {
		actionChatId = chatId;
		actionHistory = history;
		actionEpoch++;
		workspaceActionPending = false;
		workspaceError = '';
	}
	$: workspaceActionAvailable =
		workspaceFilesEnabled($config) &&
		!$temporaryChatEnabled &&
		(!chatId || (isSavedChatId(chatId) && chatId !== 'default'));
	$: workspaceAvailable = workspaceActionAvailable && isSavedChatId(chatId);
	$: workspace = chatId ? $ocuWorkspaces[chatId] : undefined;
	$: showWorkspace =
		workspaceAvailable &&
		workspace?.open &&
		$showControls &&
		!$showArtifacts &&
		!$showEmbeds &&
		!$showCallOverlay;
	$: workspaceChanged =
		!!workspace && !workspace.open && workspace.revision > workspace.acknowledgedRevision;
	$: {
		const controlsOpen = $showControls;
		if (mounted && chatId && workspace?.open) {
			if (controlsWasOpen && !controlsOpen) {
				closeWorkspacePanel(chatId);
				persistOpen(chatId, false);
			} else if (
				!controlsWasOpen &&
				!controlsOpen &&
				workspaceAvailable &&
				!$showArtifacts &&
				!$showEmbeds &&
				!$showCallOverlay
			) {
				showControls.set(true);
			}
		}
		controlsWasOpen = controlsOpen;
	}
	$: if (
		mounted &&
		chatId &&
		workspace?.open &&
		($showArtifacts || $showEmbeds || $showCallOverlay)
	) {
		closeWorkspacePanel(chatId);
		persistOpen(chatId, false);
	}
	// Tab state for Controls+Files panel
	let activeTab = savedTab;
	// svelte-ignore reactive_declaration_module_script_dependency
	$: {
		savedTab = activeTab;
	}

	$: hasMessages = history?.messages && Object.keys(history.messages).length > 0;

	$: showControlsTab = $user?.role === 'admin' || ($user?.permissions?.chat?.controls ?? true);
	const chatContext = (terminal: any) => terminal?.contexts?.chat ?? {};
	const chatContextAvailable = (terminal: any) => chatContext(terminal) !== false;
	const chatContextNeedsSavedChat = (terminal: any) =>
		chatContext(terminal)?.context_id === 'chat_id';
	$: selectedSystemTerminal = ($terminalServers ?? []).find(
		(t) => t.id && t.id === $selectedTerminalId
	);
	$: selectedSystemTerminalAvailable =
		selectedSystemTerminal &&
		chatContextAvailable(selectedSystemTerminal) &&
		!(chatContextNeedsSavedChat(selectedSystemTerminal) && !isSavedChatId(chatId));
	$: terminalFilesAvailable = !!(
		$selectedTerminalId &&
		(selectedSystemTerminalAvailable ||
			(!selectedSystemTerminal &&
				($user?.role === 'admin' || ($user?.permissions?.features?.direct_tool_servers ?? true))))
	);
	$: showFilesTab =
		terminalFilesAvailable ||
		(codeInterpreterEnabled && $config?.code?.interpreter_engine !== 'jupyter');
	$: showOverviewTab = hasMessages;

	// Tab fallback: if active tab becomes hidden, switch to next available
	$: if (!showOverviewTab && activeTab === 'overview') activeTab = 'controls';
	$: if (!showFilesTab && activeTab === 'files') activeTab = 'controls';
	$: if (!showControlsTab && activeTab === 'controls') {
		if (showFilesTab) activeTab = 'files';
		else if (showOverviewTab) activeTab = 'overview';
	}

	// Auto-close if there are no visible tabs
	$: if (!showControlsTab && !showFilesTab && !showOverviewTab) {
		showControls.set(false);
	}

	// Auto-switch to Files tab when display_file is triggered
	$: if ($showFileNavPath && terminalFilesAvailable) {
		activeTab = 'files';
		showControls.set(true);
	}

	// Keep Files selected when a terminal is active; opening the panel is handled by selection UI.
	$: if ($selectedTerminalId && terminalFilesAvailable) {
		activeTab = 'files';
	}

	// Clear selected direct terminal if user lost permission
	$: if (
		$selectedTerminalId &&
		$terminalServers !== null &&
		!($terminalServers ?? []).some((t) => t.id && t.id === $selectedTerminalId) &&
		!($user?.role === 'admin' || ($user?.permissions?.features?.direct_tool_servers ?? true))
	) {
		selectedTerminalId.set(null);
	}

	const handleMediaQuery = async (e) => {
		if (e.matches) {
			largeScreen = true;
			if ($showCallOverlay) {
				showCallOverlay.set(false);
				await tick();
				showCallOverlay.set(true);
			}
		} else {
			largeScreen = false;
			if ($showCallOverlay) {
				showCallOverlay.set(false);
				await tick();
				showCallOverlay.set(true);
			}
		}
	};

	const onMouseDown = () => {
		dragged = true;
	};
	const onMouseUp = () => {
		dragged = false;
	};

	onMount(() => {
		const mediaQuery = window.matchMedia('(min-width: 1024px)');
		mediaQuery.addEventListener('change', handleMediaQuery);
		handleMediaQuery(mediaQuery);

		let isDestroyed = false;

		const init = async () => {
			await tick();

			if (isDestroyed) return;

			setTimeout(() => {
				mounted = true;
			}, 0);
		};
		init();

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('mouseup', onMouseUp);

		return () => {
			isDestroyed = true;
			mounted = false;
			if (!largeScreen) {
				showControls.set(false);
			}
			mediaQuery.removeEventListener('change', handleMediaQuery);
			document.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('mouseup', onMouseUp);
		};
	});

	const persistOpen = (id: string, open: boolean) => {
		const state = get(ocuWorkspaces)[id];
		if (!state) return;
		void queueWorkspacePrefs(id, () =>
			putWorkspacePrefs(localStorage.token, id, {
				view: state.view,
				open,
				selected_file_id: state.selectedFileId ?? null
			})
		).catch(() => {
			if (chatId === id) workspaceError = $i18n.t('Workspace preference could not be saved');
		});
	};

	const openWorkspace = async () => {
		if (!workspaceActionAvailable || firstSendPending || workspaceActionPending) return;
		const sourceId = chatId;
		const sourceHistory = history;
		const epoch = actionEpoch;
		workspaceActionPending = true;
		workspaceError = '';
		const savedId = await ensureSavedChat();
		if (actionEpoch === epoch) workspaceActionPending = false;
		if (!savedId) {
			if (chatId === sourceId && history === sourceHistory && !$temporaryChatEnabled)
				workspaceError = $i18n.t('Workspace chat could not be saved');
			return;
		}
		if (!workspaceActionAvailable || history !== sourceHistory || (chatId && chatId !== savedId))
			return;
		showArtifacts.set(false);
		showEmbeds.set(false);
		showCallOverlay.set(false);
		showControls.set(true);
		openWorkspacePanel(savedId);
		persistOpen(savedId, true);
	};

	const closeHandler = () => {
		if (showWorkspace && chatId) {
			closeWorkspacePanel(chatId);
			persistOpen(chatId, false);
		}
		if (!largeScreen) showControls.set(false);
		showArtifacts.set(false);
		showEmbeds.set(false);
		if ($showCallOverlay) showCallOverlay.set(false);
	};

	const closeWorkspace = () => {
		if (showWorkspace) closeHandler();
		showControls.set(false);
	};

	$: if (mounted && !chatId) closeHandler();

	// Helper: is a "special" full-screen panel active?
	$: specialPanel = $showCallOverlay || $showArtifacts || $showEmbeds || showWorkspace;
</script>

{#if workspaceActionAvailable && (!$showControls || $showArtifacts || $showEmbeds || $showCallOverlay)}
	<div
		class="fixed right-3 top-14 z-40 flex items-center gap-2 rounded-lg bg-white p-2 text-sm shadow-md dark:bg-gray-900"
	>
		<button
			type="button"
			on:click={openWorkspace}
			disabled={firstSendPending || workspaceActionPending}
			title={firstSendPending ? $i18n.t('Waiting for chat to save') : $i18n.t('Workspace Files')}
			aria-label={$i18n.t('Workspace Files')}>{$i18n.t('Workspace Files')}</button
		>
		{#if workspaceChanged}<span role="status">{$i18n.t('Workspace changed')}</span>{/if}
		{#if firstSendPending}<span role="status">{$i18n.t('Waiting for chat to save')}</span>{/if}
	</div>
{/if}
{#if workspaceError}<p
		class="fixed right-3 top-28 z-40 rounded-lg bg-white p-2 text-sm dark:bg-gray-900"
		role="alert"
	>
		{workspaceError}
	</p>{/if}

{#if !largeScreen}
	{#if $showControls}
		<Drawer
			show={$showControls}
			onClose={closeWorkspace}
			className="min-h-[100dvh] !bg-white dark:!bg-gray-850"
		>
			<div class="h-[100dvh] flex flex-col">
				{#if $showCallOverlay}
					<div
						class="h-full max-h-[100dvh] bg-white text-gray-700 dark:bg-black dark:text-gray-300 flex justify-center"
					>
						<CallOverlay
							bind:files
							{submitPrompt}
							{stopResponse}
							{modelId}
							{chatId}
							{eventTarget}
							on:close={() => showControls.set(false)}
						/>
					</div>
				{:else if $showEmbeds}
					<Embeds />
				{:else if $showArtifacts}
					<Artifacts {history} />
				{:else if showWorkspace && workspaceAvailable && chatId}
					{#key chatId}<WorkspaceArtifact
							{chatId}
							enabled={workspaceAvailable}
							onClose={closeWorkspace}
						/>{/key}
				{:else}
					<!-- Controls + Files tabs -->
					<div class="flex flex-col h-full min-h-0">
						<!-- Tab bar -->
						<div class="flex items-center justify-between px-2 pt-2 pb-2 shrink-0">
							<div class="flex gap-1 min-w-0 overflow-x-auto scrollbar-hidden">
								{#if showControlsTab}
									<button
										class="px-2.5 py-1 text-sm rounded-lg transition whitespace-nowrap {activeTab ===
										'controls'
											? 'bg-gray-100/40 dark:bg-gray-800/25 font-normal text-gray-700 dark:text-gray-200'
											: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/30 dark:hover:bg-gray-800/20 hover:text-gray-600 dark:hover:text-gray-300'}"
										on:click={() => (activeTab = 'controls')}
									>
										{$i18n.t('Controls')}
									</button>
								{/if}
								{#if showFilesTab}
									<button
										class="px-2.5 py-1 text-sm rounded-lg transition whitespace-nowrap {activeTab ===
										'files'
											? 'bg-gray-100/40 dark:bg-gray-800/25 font-normal text-gray-700 dark:text-gray-200'
											: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/30 dark:hover:bg-gray-800/20 hover:text-gray-600 dark:hover:text-gray-300'}"
										on:click={() => (activeTab = 'files')}
									>
										{$i18n.t('Files')}
									</button>
								{/if}
								{#if showOverviewTab}
									<button
										class="px-2.5 py-1 text-sm rounded-lg transition whitespace-nowrap {activeTab ===
										'overview'
											? 'bg-gray-100/40 dark:bg-gray-800/25 font-normal text-gray-700 dark:text-gray-200'
											: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/30 dark:hover:bg-gray-800/20 hover:text-gray-600 dark:hover:text-gray-300'}"
										on:click={() => (activeTab = 'overview')}
									>
										{$i18n.t('Overview')}
									</button>
								{/if}
							</div>
							{#if workspaceActionAvailable}
								<button
									type="button"
									on:click={openWorkspace}
									disabled={firstSendPending || workspaceActionPending}
									title={firstSendPending
										? $i18n.t('Waiting for chat to save')
										: $i18n.t('Workspace Files')}
									aria-label={$i18n.t('Workspace Files')}>{$i18n.t('Workspace Files')}</button
								>
								{#if workspaceChanged}<span role="status">{$i18n.t('Workspace changed')}</span>{/if}
								{#if firstSendPending}<span role="status"
										>{$i18n.t('Waiting for chat to save')}</span
									>{/if}
							{/if}
							<button
								class="p-1 rounded-lg text-gray-500 dark:text-gray-400"
								on:click={closeWorkspace}
								aria-label={$i18n.t('Close')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									class="size-4"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
								</svg>
							</button>
						</div>

						<div
							class="flex-1 min-h-0 {activeTab === 'overview'
								? 'h-full'
								: activeTab === 'controls'
									? 'overflow-y-auto px-3 pt-1'
									: ''}"
						>
							{#if activeTab === 'overview'}
								<Overview
									{history}
									{chatUser}
									onNodeClick={(e) => {
										const node = e.node;
										showMessage(node.data.message, true);
									}}
								/>
							{:else if activeTab === 'files' && terminalFilesAvailable && $selectedTerminalId}
								<FileNav {chatId} />
							{:else if activeTab === 'files' && codeInterpreterEnabled}
								<PyodideFileNav />
							{:else}
								<Controls embed={true} {models} bind:chatFiles bind:params />
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</Drawer>
	{/if}
{:else}
	<ResizableSidePanel
		open={$showControls}
		bind:width={controlsWidth}
		minWidth={350}
		minSiblingWidth={360}
		closeOnDragBelowMinWidth
		onClose={closeWorkspace}
		storageKey="chatControlsSize"
		className="h-full z-10 bg-white dark:bg-gray-900"
	>
		<div class="flex h-full max-h-full min-h-full">
			<div
				class="w-full {specialPanel && !$showCallOverlay
					? ' '
					: 'bg-white dark:bg-gray-900'} z-40 pointer-events-auto {activeTab === 'files'
					? ''
					: 'overflow-y-auto'} scrollbar-hidden"
				id="controls-container"
			>
				{#if $showCallOverlay}
					<div class="w-full h-full flex justify-center">
						<CallOverlay
							bind:files
							{submitPrompt}
							{stopResponse}
							{modelId}
							{chatId}
							{eventTarget}
							on:close={() => showControls.set(false)}
						/>
					</div>
				{:else if $showEmbeds}
					<Embeds overlay={dragged} />
				{:else if $showArtifacts}
					<Artifacts {history} overlay={dragged} />
				{:else if showWorkspace && workspaceAvailable && chatId}
					{#key chatId}<WorkspaceArtifact
							{chatId}
							enabled={workspaceAvailable}
							onClose={closeWorkspace}
						/>{/key}
				{:else}
					<!-- Controls + Files tabs -->
					<div class="flex flex-col h-full min-h-0">
						<!-- Tab bar -->
						<div class="flex items-center justify-between px-2 pt-2 pb-2 shrink-0">
							<div class="flex gap-1 min-w-0 overflow-x-auto scrollbar-hidden">
								{#if showControlsTab}
									<button
										class="px-2.5 py-1 text-sm rounded-lg transition whitespace-nowrap {activeTab ===
										'controls'
											? 'bg-gray-100/40 dark:bg-gray-800/25 font-normal text-gray-700 dark:text-gray-200'
											: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/30 dark:hover:bg-gray-800/20 hover:text-gray-600 dark:hover:text-gray-300'}"
										on:click={() => (activeTab = 'controls')}
									>
										{$i18n.t('Controls')}
									</button>
								{/if}
								{#if showFilesTab}
									<button
										class="px-2.5 py-1 text-sm rounded-lg transition whitespace-nowrap {activeTab ===
										'files'
											? 'bg-gray-100/40 dark:bg-gray-800/25 font-normal text-gray-700 dark:text-gray-200'
											: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/30 dark:hover:bg-gray-800/20 hover:text-gray-600 dark:hover:text-gray-300'}"
										on:click={() => (activeTab = 'files')}
									>
										{$i18n.t('Files')}
									</button>
								{/if}
								{#if showOverviewTab}
									<button
										class="px-2.5 py-1 text-sm rounded-lg transition whitespace-nowrap {activeTab ===
										'overview'
											? 'bg-gray-100/40 dark:bg-gray-800/25 font-normal text-gray-700 dark:text-gray-200'
											: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100/30 dark:hover:bg-gray-800/20 hover:text-gray-600 dark:hover:text-gray-300'}"
										on:click={() => (activeTab = 'overview')}
									>
										{$i18n.t('Overview')}
									</button>
								{/if}
							</div>
							{#if workspaceActionAvailable}
								<button
									type="button"
									on:click={openWorkspace}
									disabled={firstSendPending || workspaceActionPending}
									title={firstSendPending
										? $i18n.t('Waiting for chat to save')
										: $i18n.t('Workspace Files')}
									aria-label={$i18n.t('Workspace Files')}>{$i18n.t('Workspace Files')}</button
								>
								{#if workspaceChanged}<span role="status">{$i18n.t('Workspace changed')}</span>{/if}
								{#if firstSendPending}<span role="status"
										>{$i18n.t('Waiting for chat to save')}</span
									>{/if}
							{/if}
							<button
								class="p-1 rounded-lg text-gray-500 dark:text-gray-400"
								on:click={closeWorkspace}
								aria-label={$i18n.t('Close')}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									class="size-4"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
								</svg>
							</button>
						</div>

						<div
							class="flex-1 min-h-0 {activeTab === 'overview'
								? 'h-full'
								: activeTab === 'controls'
									? 'overflow-y-auto px-3 pt-1'
									: ''}"
						>
							{#if activeTab === 'overview'}
								<Overview
									{history}
									{chatUser}
									onNodeClick={(e) => {
										const node = e.node;
										if (node?.data?.message?.favorite) {
											history.messages[node.data.message.id].favorite = true;
										} else {
											history.messages[node.data.message.id].favorite = null;
										}
										showMessage(node.data.message, true);
									}}
								/>
							{:else if activeTab === 'files' && terminalFilesAvailable && $selectedTerminalId}
								<FileNav overlay={dragged} {chatId} />
							{:else if activeTab === 'files' && codeInterpreterEnabled}
								<PyodideFileNav overlay={dragged} />
							{:else}
								<Controls embed={true} {models} bind:chatFiles bind:params />
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</ResizableSidePanel>
{/if}
