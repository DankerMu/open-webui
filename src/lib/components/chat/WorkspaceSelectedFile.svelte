<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import type { WorkspaceFile } from '$lib/apis/ocu';
	import { formatFileSize } from '$lib/utils';
	import type Document from '$lib/components/icons/Document.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Download from '$lib/components/icons/Download.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	export let selected: WorkspaceFile;
	export let selectedName: string;
	export let selectedDirectory: string;
	export let selectedKind: string;
	export let SelectedKindIcon: typeof Document;
	export let downloadUrl: string;
	export let officeEdit: boolean | undefined;
	export let editorActive: boolean;
	export let editorError: string;
	export let onHistory: () => void;
	export let onEdit: () => void;
	const i18n: Writable<i18nType> = getContext('i18n');
</script>

<div
	data-selected-bar
	class="flex h-8 shrink-0 items-center gap-1.5 overflow-visible border-b border-gray-100 pr-1 dark:border-gray-800"
>
	<span data-file-kind={selectedKind} class="contents">
		<svelte:component this={SelectedKindIcon} className="size-4 shrink-0" />
	</span>
	<Tooltip content={selectedName} className="min-w-0 flex-1" as="div">
		<span
			data-selected-name
			class="block min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100"
			>{selectedName}</span
		>
	</Tooltip>
	{#if selectedDirectory}
		<span class="min-w-0 max-w-[30%] truncate text-xs text-gray-400">{selectedDirectory}</span>
	{/if}
	<span data-file-size class="shrink-0 text-xs text-gray-400" aria-hidden="true"
		>{formatFileSize(selected.size)}</span
	>
	<div class="ml-auto flex shrink-0 items-center gap-1">
		{#if officeEdit && (!editorActive || editorError)}
			<button
				type="button"
				class="h-7 rounded-md border border-gray-200 px-2 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
				on:click={onHistory}>{$i18n.t('Version history')}</button
			>
		{/if}
		{#if officeEdit}
			<Tooltip content={$i18n.t('Edit')} className="flex">
				<button
					class="flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-800"
					type="button"
					on:click={onEdit}
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
