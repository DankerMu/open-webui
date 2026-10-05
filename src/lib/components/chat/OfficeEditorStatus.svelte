<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import type { OcuOfficeState } from '$lib/stores/ocu-office';

	export let session: OcuOfficeState | undefined;
	export let live = false;
	export let maximized = false;
	export let onSave: () => void;
	export let onReopen: () => void;
	export let onToggleMaximize: () => void;
	const i18n: Writable<i18nType> = getContext('i18n');

	function refusedMessage(reason: string | null) {
		switch (reason) {
			case 'unsupported_type':
				return $i18n.t('This file type cannot be edited');
			case 'file_too_large':
				return $i18n.t('This file is too large to edit');
			case 'corrupt_document':
				return $i18n.t('This document is corrupt and cannot be edited');
			case 'unknown_file':
				return $i18n.t('This file is no longer available to edit');
			case 'storage_low':
				return $i18n.t('Not enough storage to open this file for editing');
			default:
				return $i18n.t('Editing was refused: {{reason}}', { reason: reason ?? '' });
		}
	}

	$: snapshot = session;
	$: state = snapshot?.state;
	$: reason = snapshot?.reason;
	$: dirty = snapshot?.dirty === true;
	$: statusText = !state
		? ''
		: state === 'refused'
			? refusedMessage(reason ?? null)
			: !live
				? ''
				: state === 'opening'
					? $i18n.t('Opening')
					: state === 'saving' || state === 'closing'
						? $i18n.t('Saving')
						: state === 'conflict'
							? $i18n.t('Conflict')
							: state === 'error'
								? reason
									? $i18n.t('Failed: {{reason}}', { reason })
									: $i18n.t('Failed')
								: state === 'orphaned'
									? $i18n.t('Expired')
									: state === 'editing'
										? reason != null
											? $i18n.t('Failed: {{reason}}', { reason })
											: dirty
												? $i18n.t('Unsaved')
												: $i18n.t('Saved')
										: '';
	$: showBar = live || state === 'refused';
	$: showSave = live && state !== 'refused' && state !== 'closed';
	$: saveEnabled = state === 'editing';
	$: showReopen = live && state === 'orphaned';
	$: showNotice =
		live && session?.workspaceChanged === true && state !== 'refused' && state !== 'closed';
</script>

{#if showBar}
	<div
		class="flex min-h-8 shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-1 py-1 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300"
		data-office-status
	>
		{#if statusText}<p class="min-w-0 flex-1" role="status">{statusText}</p>{/if}
		{#if showNotice}<p role="status">{$i18n.t('Workspace file changed')}</p>{/if}
		{#if showSave}
			<button
				class="h-7 shrink-0 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				type="button"
				aria-label={$i18n.t('Save')}
				disabled={!saveEnabled}
				on:click={onSave}>{$i18n.t('Save')}</button
			>
		{/if}
		{#if live && state !== 'refused' && state !== 'closed'}
			<button
				class="h-7 shrink-0 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				type="button"
				aria-label={maximized ? $i18n.t('Restore') : $i18n.t('Maximize')}
				on:click={onToggleMaximize}>{maximized ? $i18n.t('Restore') : $i18n.t('Maximize')}</button
			>
		{/if}
		{#if showReopen}
			<button
				class="h-7 shrink-0 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
				type="button"
				aria-label={$i18n.t('Open again')}
				on:click={onReopen}>{$i18n.t('Open again')}</button
			>
		{/if}
	</div>
{/if}
