<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import type { WorkspaceFile } from '$lib/apis/ocu';

	export let file: WorkspaceFile;
	const i18n: Writable<i18nType> = getContext('i18n');
</script>

{#if file.too_large}<span data-too-large class="shrink-0 text-xs text-amber-600 dark:text-amber-400"
		>{$i18n.t('Too large')}</span
	>{:else if file.unsupported_name}<span
		data-unsupported-name
		class="shrink-0 text-xs text-amber-600 dark:text-amber-400">{$i18n.t('Unsupported name')}</span
	>{/if}
