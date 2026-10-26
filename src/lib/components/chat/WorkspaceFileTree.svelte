<script context="module" lang="ts">
	import GlobeAlt from '$lib/components/icons/GlobeAlt.svelte';
	import Photo from '$lib/components/icons/Photo.svelte';
	import Document from '$lib/components/icons/Document.svelte';
	import DocumentChartBar from '$lib/components/icons/DocumentChartBar.svelte';
	import ChartBar from '$lib/components/icons/ChartBar.svelte';
	import Code from '$lib/components/icons/Code.svelte';
	import DocumentPage from '$lib/components/icons/DocumentPage.svelte';

	export const FILE_KIND_ICONS = {
		web: GlobeAlt,
		image: Photo,
		document: Document,
		sheet: DocumentChartBar,
		slides: ChartBar,
		code: Code,
		other: DocumentPage
	} as const;
</script>

<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import type { WorkspaceFile } from '$lib/apis/ocu';
	import { formatFileSize } from '$lib/utils';
	import {
		hiddenByCollapse,
		workspaceFileKind,
		type WorkspaceFileRow
	} from './workspace-file-rows';
	import WorkspaceFileMarker from './WorkspaceFileMarker.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Folder from '$lib/components/icons/Folder.svelte';
	import FolderOpen from '$lib/components/icons/FolderOpen.svelte';
	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import ChevronRight from '$lib/components/icons/ChevronRight.svelte';

	export let rows: WorkspaceFileRow[];
	export let selectedFileId: string | undefined;
	export let listClass: string;
	export let onSelect: (file: WorkspaceFile) => void;
	// Collapsed folder paths; the parent binds this so it lives as long as the open panel.
	export let collapsed: Set<string> = new Set();
	const i18n: Writable<i18nType> = getContext('i18n');

	const ROW =
		'flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-400 dark:hover:bg-white/5';
	const MUTED = 'shrink-0 text-gray-500 dark:text-gray-400';
	const indent = (depth: number) => `${8 + depth * 12}px`;
	// One guide per ancestor level, centred under that ancestor's 14 px chevron slot.
	const guides = (depth: number) => Array.from({ length: depth }, (_, level) => 15 + level * 12);

	function toggle(path: string) {
		const next = new Set(collapsed);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		collapsed = next;
	}
</script>

<ul aria-label={$i18n.t('Workspace file list')} class="min-h-0 overflow-y-auto {listClass}">
	{#each rows as row (row.kind === 'folder' ? `folder:${row.path}` : `file:${row.file.file_id}`)}
		<li class="relative" hidden={hiddenByCollapse(row, collapsed)}>
			{#each guides(row.depth) as left}<span
					data-indent-guide
					aria-hidden="true"
					class="pointer-events-none absolute inset-y-0 border-l border-gray-200 dark:border-gray-800"
					style:left={`${left}px`}
				></span>{/each}
			{#if row.kind === 'folder'}
				{@const open = !collapsed.has(row.path)}
				<button
					type="button"
					class="{ROW} text-gray-700 dark:text-gray-200"
					style:padding-left={indent(row.depth)}
					title={row.path}
					aria-label={$i18n.t('Folder {{path}}', { path: row.path })}
					aria-expanded={open}
					on:click={() => toggle(row.path)}
				>
					{#if open}
						<ChevronDown className="size-3.5 {MUTED}" />
						<FolderOpen className="size-4 {MUTED}" />
					{:else}
						<ChevronRight className="size-3.5 {MUTED}" />
						<Folder className="size-4 {MUTED}" />
					{/if}
					<span class="min-w-0 flex-1 truncate">{row.name}</span>
				</button>
			{:else}
				{@const fileKind = workspaceFileKind(row.file)}
				{@const KindIcon = FILE_KIND_ICONS[fileKind]}
				{@const fullPath = row.file.path || row.name}
				{@const isSelected = selectedFileId === row.file.file_id}
				<Tooltip content={fullPath} className="block w-full" as="div">
					<button
						type="button"
						class="{ROW} {isSelected
							? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100'
							: 'text-gray-700 dark:text-gray-200'}"
						style:padding-left={indent(row.depth)}
						title={fullPath}
						on:click={() => onSelect(row.file)}
						aria-label={row.file.name || row.file.path}
						aria-pressed={isSelected}
					>
						<span data-chevron-slot class="size-3.5 shrink-0" aria-hidden="true"></span>
						<span data-file-kind={fileKind} class="contents">
							<svelte:component this={KindIcon} className="size-4 {MUTED}" />
						</span>
						<span class="min-w-0 flex-1 truncate">{row.name}</span>
						<WorkspaceFileMarker file={row.file} />
						{#if row.file.too_large}<span
								data-file-size
								class="shrink-0 text-xs text-gray-400"
								aria-hidden="true">{formatFileSize(row.file.size)}</span
							>{/if}
					</button>
				</Tooltip>
			{/if}
		</li>
	{/each}
</ul>
