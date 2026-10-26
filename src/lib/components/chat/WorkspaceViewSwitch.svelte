<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import type { OcuWorkspaceState } from '$lib/stores/ocu';
	import Folder from '$lib/components/icons/Folder.svelte';
	import GlobeAlt from '$lib/components/icons/GlobeAlt.svelte';
	import Terminal from '$lib/components/icons/Terminal.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	export let workspace: OcuWorkspaceState | undefined;
	export let onSelect: (view: OcuWorkspaceState['view']) => void;
	// Bound by the panel: notice dismissal moves focus here while a request is busy.
	export let filesButton: HTMLButtonElement | undefined = undefined;
	const i18n: Writable<i18nType> = getContext('i18n');
	// The header slot is a size container; below the measured width of the nav with all three labels
	// (Terminal active) inactive segments show only their icon. Threshold: decision record 2026-10-26.
	$: labelClass = (view: OcuWorkspaceState['view']) =>
		workspace?.view === view ? '' : 'hidden @min-[300px]:inline';
</script>

<nav
	class="inline-flex shrink-0 gap-1 self-start rounded-lg border border-gray-100 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-850"
	aria-label={$i18n.t('Workspace views')}
>
	<Tooltip content={$i18n.t('Files')}>
		<button
			class="flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 {workspace?.view ===
			'files'
				? 'bg-white font-medium shadow-sm dark:bg-gray-700'
				: 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
			type="button"
			bind:this={filesButton}
			on:click={() => onSelect('files')}
			aria-pressed={workspace?.view === 'files'}
			aria-label={$i18n.t('Files')}
			><Folder className="size-4" /><span class={labelClass('files')}>{$i18n.t('Files')}</span
			></button
		>
	</Tooltip>
	{#if workspace?.views.includes('browser')}
		<Tooltip content={$i18n.t('Browser')}>
			<button
				class="flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-40 {workspace.view ===
				'browser'
					? 'bg-white font-medium shadow-sm dark:bg-gray-700'
					: 'text-gray-500 enabled:hover:bg-gray-100 dark:text-gray-400 dark:enabled:hover:bg-gray-800'}"
				type="button"
				on:click={() => onSelect('browser')}
				disabled={workspace.status !== 'running' || workspace.baseUrl !== '/ocu'}
				aria-pressed={workspace.view === 'browser'}
				aria-label={$i18n.t('Browser')}
				><GlobeAlt className="size-4" /><span class={labelClass('browser')}
					>{$i18n.t('Browser')}</span
				></button
			>
		</Tooltip>
	{/if}
	{#if workspace?.views.includes('terminal')}
		<Tooltip content={$i18n.t('Terminal')}>
			<button
				class="flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-40 {workspace.view ===
				'terminal'
					? 'bg-white font-medium shadow-sm dark:bg-gray-700'
					: 'text-gray-500 enabled:hover:bg-gray-100 dark:text-gray-400 dark:enabled:hover:bg-gray-800'}"
				type="button"
				on:click={() => onSelect('terminal')}
				disabled={workspace.status !== 'running' || workspace.baseUrl !== '/ocu'}
				aria-pressed={workspace.view === 'terminal'}
				aria-label={$i18n.t('Terminal')}
				><Terminal className="size-4" /><span class={labelClass('terminal')}
					>{$i18n.t('Terminal')}</span
				></button
			>
		</Tooltip>
	{/if}
</nav>
