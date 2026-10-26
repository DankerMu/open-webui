<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { ocuWorkspaceEntry } from '$lib/stores/ocu';
	import Tooltip from '../common/Tooltip.svelte';
	import Folder from '../icons/Folder.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');
</script>

{#if $ocuWorkspaceEntry}
	<Tooltip
		content={$ocuWorkspaceEntry.waiting
			? $i18n.t('Waiting for chat to save')
			: $i18n.t('Workspace Files')}
	>
		<button
			type="button"
			class="relative flex size-6 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50/40 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800/40 dark:hover:text-gray-200"
			aria-label={$i18n.t('Workspace Files')}
			aria-pressed={$ocuWorkspaceEntry.shown}
			disabled={$ocuWorkspaceEntry.disabled}
			on:click={$ocuWorkspaceEntry.toggle}
		>
			<Folder className="size-5" strokeWidth="1" />
			{#if $ocuWorkspaceEntry.changed}
				<span
					class="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-blue-500"
					aria-hidden="true"
					data-workspace-changed-dot
				></span>
				<span class="sr-only" role="status">{$i18n.t('Workspace changed')}</span>
			{/if}
			{#if $ocuWorkspaceEntry.waiting}
				<span class="sr-only" role="status">{$i18n.t('Waiting for chat to save')}</span>
			{/if}
		</button>
	</Tooltip>
{/if}
