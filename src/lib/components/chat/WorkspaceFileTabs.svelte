<script context="module" lang="ts">
	let instances = 0;
</script>

<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import type { WorkspaceFile } from '$lib/apis/ocu';
	import { workspaceFileKind } from './workspace-file-rows';
	import { FILE_KIND_ICONS } from './WorkspaceFileTree.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Sidebar from '$lib/components/icons/Sidebar.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';

	export let tabs: { file: WorkspaceFile; name: string }[];
	export let activeId: string | undefined;
	export let treeHidden: boolean;
	export let treeId: string;
	export let onActivate: (file: WorkspaceFile) => void;
	export let onClose: (fileId: string) => void;
	export let onToggleTree: () => void;
	const i18n: Writable<i18nType> = getContext('i18n');
	const prefix = `workspace-tab-${++instances}`;
	let hovered = '';

	$: focusable = tabs.some((tab) => tab.file.file_id === activeId)
		? activeId
		: tabs[0]?.file.file_id;

	function activate(file: WorkspaceFile) {
		if (file.file_id !== activeId) onActivate(file);
	}
	function keydown(event: KeyboardEvent, index: number) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			activate(tabs[index].file);
			return;
		}
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const next = (index + step + tabs.length) % tabs.length;
		document.getElementById(`${prefix}-${next}`)?.focus();
	}
</script>

<div class="flex h-8 shrink-0 items-stretch border-b border-gray-100 dark:border-gray-800">
	<Tooltip
		content={treeHidden ? $i18n.t('Show file tree') : $i18n.t('Hide file tree')}
		className="flex"
	>
		<button
			type="button"
			class="flex w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-800"
			aria-label={treeHidden ? $i18n.t('Show file tree') : $i18n.t('Hide file tree')}
			aria-expanded={!treeHidden}
			aria-controls={treeId}
			on:click={onToggleTree}><Sidebar className="size-4" /></button
		>
	</Tooltip>
	<!-- The tablist holds only tabs (display: contents); `order` interleaves each close slot after its tab. -->
	<div class="flex min-w-0 flex-1 items-stretch overflow-x-auto">
		<div class="contents" role="tablist" aria-label={$i18n.t('Open files')}>
			{#each tabs as tab, index (tab.file.file_id)}
				{@const active = tab.file.file_id === activeId}
				{@const kind = workspaceFileKind(tab.file)}
				<div
					id={`${prefix}-${index}`}
					role="tab"
					aria-selected={active}
					tabindex={tab.file.file_id === focusable ? 0 : -1}
					title={tab.file.path || tab.name}
					style:order={index * 2}
					class="flex max-w-40 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 pl-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400 {active
						? 'border-gray-900 bg-white text-gray-900 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100'
						: 'border-transparent text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5'}"
					on:click={() => activate(tab.file)}
					on:keydown={(event) => keydown(event, index)}
					on:pointerenter={() => (hovered = tab.file.file_id)}
					on:pointerleave={() => (hovered = '')}
				>
					<span data-file-kind={kind} class="contents">
						<svelte:component this={FILE_KIND_ICONS[kind]} className="size-3.5 shrink-0" />
					</span>
					<span class="min-w-0 truncate">{tab.name}</span>
				</div>
			{/each}
		</div>
		{#each tabs as tab, index (tab.file.file_id)}
			{@const active = tab.file.file_id === activeId}
			<div
				data-file-id={tab.file.file_id}
				style:order={index * 2 + 1}
				class="group flex shrink-0 items-center border-b-2 pr-1 pl-0.5 {active
					? 'border-gray-900 bg-white dark:border-gray-100 dark:bg-gray-900'
					: 'border-transparent'}"
			>
				<button
					type="button"
					class="flex size-5 items-center justify-center rounded text-gray-500 hover:bg-gray-200 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-700 {active ||
					hovered === tab.file.file_id
						? 'opacity-100'
						: 'opacity-0 group-hover:opacity-100'}"
					aria-label={$i18n.t('Close tab')}
					aria-describedby={`${prefix}-${index}`}
					on:click={() => onClose(tab.file.file_id)}><XMark className="size-3" /></button
				>
			</div>
		{/each}
	</div>
</div>
