<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import type { WorkspaceFile } from '$lib/apis/ocu';
	import type Document from '$lib/components/icons/Document.svelte';

	export let file: WorkspaceFile;
	export let kind: string;
	export let icon: typeof Document;
	export let href: string;
	const i18n: Writable<i18nType> = getContext('i18n');
</script>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
	<span data-file-kind={kind} class="contents">
		<svelte:component this={icon} className="size-8 shrink-0 text-gray-400" />
	</span>
	<p class="text-sm text-gray-500 dark:text-gray-400" role="status">
		{file.too_large
			? $i18n.t('This file is larger than the 100 MiB preview limit.')
			: $i18n.t('Preview not supported for this file type. Download the file to open it.')}
	</p>
	<a
		class="h-8 rounded-md border border-gray-200 px-3 text-xs font-medium leading-8 text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
		{href}
		download={file.name}>{$i18n.t('Download')}</a
	>
</div>
