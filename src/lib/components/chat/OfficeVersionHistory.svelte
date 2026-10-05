<script lang="ts">
	import { getContext, onDestroy, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { WorkspaceRequestError } from '$lib/apis/ocu';
	import {
		listOfficeVersions,
		restoreOfficeVersion,
		type OfficeVersions
	} from '$lib/apis/ocu/office';

	export let chatId: string;
	export let fileId: string;
	export let localEditor: boolean;
	export let onClose: () => void;
	const i18n: Writable<i18nType> = getContext('i18n');
	const target = { chatId, fileId };
	let active = true;
	let loading = true;
	let pending = false;
	let versions: OfficeVersions | undefined;
	let error = '';

	function reason(failure: unknown) {
		return failure instanceof WorkspaceRequestError ? failure.reason : 'request_failed';
	}

	async function load() {
		try {
			const result = await listOfficeVersions('/ocu', target.chatId, target.fileId);
			if (active) versions = result;
		} catch (failure) {
			if (active)
				error = $i18n.t('History could not be loaded: {{reason}}', { reason: reason(failure) });
		} finally {
			if (active) loading = false;
		}
	}

	async function restore(number: number) {
		if (!active || localEditor || pending) return;
		pending = true;
		error = '';
		let accepted = false;
		try {
			await restoreOfficeVersion('/ocu', target.chatId, target.fileId, number);
			if (!active) return;
			accepted = true;
			const result = await listOfficeVersions('/ocu', target.chatId, target.fileId);
			if (active) versions = result;
		} catch (failure) {
			if (!active) return;
			error = accepted
				? $i18n.t('Restore succeeded, but history could not be reloaded: {{reason}}', {
						reason: reason(failure)
					})
				: $i18n.t('Restore was refused: {{reason}}', { reason: reason(failure) });
		} finally {
			if (active) pending = false;
		}
	}

	function close() {
		active = false;
		onClose();
	}

	onMount(() => {
		void load();
	});
	onDestroy(() => {
		active = false;
	});
</script>

<div
	role="region"
	aria-label={$i18n.t('Version history')}
	class="max-h-[50%] min-h-0 shrink-0 overflow-auto rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-700"
>
	<div class="mb-2 flex items-center justify-between gap-2">
		<h3 class="font-medium">{$i18n.t('Version history')}</h3>
		<button
			type="button"
			class="rounded-md px-2 py-1 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:hover:bg-gray-800"
			aria-label={$i18n.t('Close version history')}
			on:click={close}>{$i18n.t('Close')}</button
		>
	</div>
	{#if loading}<p role="status">{$i18n.t('Loading version history')}</p>{/if}
	{#if pending}<p role="status">{$i18n.t('Restoring version')}</p>{/if}
	{#if error}<p role="alert" class="mb-2 text-red-600 dark:text-red-400">{error}</p>{/if}
	{#if localEditor}
		<p class="mb-2" role="status">
			{$i18n.t('Close the editor on this document before restoring a version.')}
		</p>
	{/if}
	{#if versions}
		{#if versions.versions.length === 0}
			<p>{$i18n.t('No versions available')}</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full whitespace-nowrap text-left">
					<thead>
						<tr>
							<th class="p-1">{$i18n.t('Version')}</th>
							<th class="p-1">{$i18n.t('Time')}</th>
							<th class="p-1">{$i18n.t('Source')}</th>
							<th class="p-1">{$i18n.t('Published')}</th>
							<th class="p-1"><span class="sr-only">{$i18n.t('Restore')}</span></th>
						</tr>
					</thead>
					<tbody>
						{#each versions.versions as version (version.number)}
							<tr>
								<td class="p-1">{version.number}</td>
								<td class="p-1"><time datetime={version.created_at}>{version.created_at}</time></td>
								<td class="p-1">{version.source}</td>
								<td class="p-1">{String(version.published)}</td>
								<td class="p-1">
									<button
										type="button"
										class="rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
										aria-label={$i18n.t('Restore version {{number}}', {
											number: String(version.number)
										})}
										disabled={localEditor || pending}
										on:click={() => restore(version.number)}>{$i18n.t('Restore')}</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>
