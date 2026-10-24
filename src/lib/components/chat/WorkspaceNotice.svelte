<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import Info from '$lib/components/icons/Info.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';
	export let notice: string;
	export let onDismiss: () => void;
	const i18n: Writable<i18nType> = getContext('i18n');
</script>

<p
	class="flex shrink-0 items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
	role="alert"
>
	<Info className="size-4 shrink-0" /><span class="min-w-0 flex-1">{notice}</span><button
		class="-my-0.5 flex size-5 shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-400 dark:hover:bg-gray-700"
		type="button"
		on:click={onDismiss}
		aria-label={$i18n.t('Dismiss notice')}><XMark className="size-3.5" /></button
	>
</p>
