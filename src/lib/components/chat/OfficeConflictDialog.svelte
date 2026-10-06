<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { WorkspaceRequestError } from '$lib/apis/ocu';
	import {
		resolveOfficeConflict,
		type OfficeOpenSession,
		type OfficeResolveAction
	} from '$lib/apis/ocu/office';
	import { ocuOffice, type OcuOfficeState } from '$lib/stores/ocu-office';

	export let chatId: string;
	export let fileId: string;
	export let authority:
		| {
				kind: 'editor';
				generation: number;
				sessionId: string;
				admitted: (chat: string, file: string, generation: number) => boolean;
		  }
		| {
				kind: 'preflight';
				session: OfficeOpenSession;
				admitted: () => boolean;
				onResolved: () => void;
		  };
	const i18n: Writable<i18nType> = getContext('i18n');
	const binding = { chat: chatId, file: fileId, authority };
	let active = true;
	let sessionId = '';
	let epoch = 0;
	let requestId = 0;
	let conflict = false;
	let pathMissing = false;
	let open = false;
	let confirmation = false;
	let pending = false;
	let terminal = false;
	let error = '';

	function synchronize(state: OcuOfficeState | undefined) {
		if (!active) return;
		const nextSession =
			binding.authority.kind === 'preflight'
				? binding.authority.session.session_id
				: state?.fileId === binding.file &&
					  state.generation === binding.authority.generation &&
					  state.sessionId === binding.authority.sessionId
					? (state.sessionId ?? '')
					: '';
		if (nextSession !== sessionId) {
			sessionId = nextSession;
			epoch++;
			requestId++;
			conflict = false;
			open = false;
			confirmation = false;
			pending = false;
			terminal = false;
			error = '';
		}
		const status = binding.authority.kind === 'preflight' ? binding.authority.session : state;
		const nextConflict = !!sessionId && status?.state === 'conflict';
		if (nextConflict !== conflict) {
			epoch++;
			confirmation = false;
			error = '';
			open = nextConflict && !terminal;
			conflict = nextConflict;
		}
		pathMissing = status?.reason === 'path_missing';
		if (pathMissing) confirmation = false;
	}
	const unsubscribe = ocuOffice.subscribe((states) => synchronize(states[binding.chat]));

	function admitted() {
		return binding.authority.kind === 'preflight'
			? binding.authority.admitted()
			: binding.authority.admitted(binding.chat, binding.file, binding.authority.generation);
	}

	function current() {
		if (!active || !admitted()) return false;
		synchronize(get(ocuOffice)[binding.chat]);
		return conflict && !!sessionId && !terminal;
	}
	function dismiss() {
		if (!current()) return;
		open = false;
		confirmation = false;
	}
	function reopen() {
		if (current()) open = true;
	}
	function confirmOverwrite() {
		if (current() && open && !pathMissing && !pending) confirmation = true;
	}
	async function resolve(action: OfficeResolveAction) {
		if (!current() || !open || pending) return;
		if (action === 'overwrite' && (pathMissing || !confirmation)) return;
		const request = { chatId: binding.chat, sessionId, epoch, id: ++requestId };
		pending = true;
		error = '';
		const ownsPending = () => active && request.id === requestId && request.sessionId === sessionId;
		const ownsIdentity = () => {
			if (!ownsPending() || !admitted()) return false;
			synchronize(get(ocuOffice)[request.chatId]);
			return ownsPending();
		};
		const ownsRequest = () => ownsIdentity() && conflict && !terminal && request.epoch === epoch;
		try {
			await resolveOfficeConflict('/ocu', request.chatId, request.sessionId, action);
			if (ownsRequest()) {
				open = false;
				confirmation = false;
				if (binding.authority.kind === 'preflight') binding.authority.onResolved();
			}
		} catch (failure) {
			if (!ownsIdentity()) return;
			const reason = failure instanceof WorkspaceRequestError ? failure.reason : 'request_failed';
			if (reason === 'workspace_missing') {
				terminal = true;
				open = false;
				confirmation = false;
			} else {
				if (!ownsRequest()) return;
				error = $i18n.t('Resolve was refused: {{reason}}', { reason });
				open = true;
			}
		} finally {
			if (ownsPending()) pending = false;
		}
	}
	function focusDefault(node: HTMLButtonElement) {
		node.focus();
	}
	onDestroy(() => {
		active = false;
		epoch++;
		requestId++;
		unsubscribe();
	});
</script>

{#if terminal}
	<p role="alert" class="shrink-0 text-sm text-red-600 dark:text-red-400">
		{$i18n.t('The workspace files are gone. Your content is kept in the version store.')}
	</p>
{:else if conflict && open}
	<div
		role="dialog"
		tabindex="-1"
		aria-label={$i18n.t('Resolve conflict')}
		class="max-h-[60%] shrink-0 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
		on:keydown={(event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				dismiss();
			}
		}}
	>
		<form on:submit|preventDefault={() => resolve('save_as')}>
			<div class="mb-2 flex items-center justify-between gap-2">
				<h3 class="font-medium">{$i18n.t('Resolve conflict')}</h3>
				<button
					type="button"
					aria-label={$i18n.t('Close conflict dialog')}
					on:click={dismiss}
					class="rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
					>{$i18n.t('Close')}</button
				>
			</div>
			<p class="mb-2">
				{$i18n.t(
					'Your content is kept. Save it as a new file or confirm replacing the workspace file.'
				)}
			</p>
			{#if error}<p role="alert" class="mb-2 text-red-600 dark:text-red-400">{error}</p>{/if}
			{#if pending}<p role="status" class="mb-2">{$i18n.t('Resolving conflict')}</p>{/if}
			<div class="flex flex-wrap gap-2">
				<button
					type="submit"
					disabled={pending}
					use:focusDefault
					class="rounded-md bg-gray-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
					>{$i18n.t('Save as new file')}</button
				>
				{#if !pathMissing}
					<button
						type="button"
						disabled={pending}
						on:click={confirmOverwrite}
						class="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
						>{$i18n.t('Overwrite workspace file')}</button
					>
				{/if}
			</div>
			{#if confirmation && !pathMissing}
				<p class="my-2">{$i18n.t('Replace the workspace file with your stored content?')}</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						disabled={pending}
						on:click={() => resolve('overwrite')}
						class="rounded-md border border-red-400 px-3 py-2 text-red-600"
						>{$i18n.t('Confirm overwrite')}</button
					>
					<button
						type="button"
						disabled={pending}
						on:click={() => (confirmation = false)}
						class="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
						>{$i18n.t('Cancel overwrite')}</button
					>
				</div>
			{/if}
		</form>
	</div>
{:else if conflict}
	<button
		type="button"
		on:click={reopen}
		class="shrink-0 self-start rounded-md border border-gray-200 px-3 py-1 text-sm dark:border-gray-700"
	>
		{$i18n.t('Resolve conflict')}
	</button>
{/if}
