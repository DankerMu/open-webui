<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { WorkspaceRequestError } from '$lib/apis/ocu';
	import {
		listOfficeVersions,
		restoreOfficeVersion,
		type OfficeOpenSession
	} from '$lib/apis/ocu/office';
	import { config } from '$lib/stores';
	import { ocuWorkspaces } from '$lib/stores/ocu';
	import OfficeConflictDialog from './OfficeConflictDialog.svelte';

	export let chatId: string;
	export let fileId: string | undefined;
	export let enabled: boolean;
	export let admitted: (chat: string, file: string) => boolean;
	export let onOpen: (file: string) => number | undefined;
	export let onRetire: () => void;
	const i18n: Writable<i18nType> = getContext('i18n');
	type Activation = { chat: string; file: string; rechecked: boolean; generation?: number };
	let target: Activation | undefined;
	let active = true;
	let stage: 'idle' | 'reading' | 'choice' | 'conflict' | 'opened' | 'error' = 'idle';
	let pending = false;
	let actions:
		| {
				restore: () => void;
				start: () => void;
				close: () => void;
				escape: (event: KeyboardEvent) => void;
		  }
		| undefined;
	let retry: (() => void) | undefined;
	let session: OfficeOpenSession | undefined;
	let conflictAdmission: () => boolean = () => false;
	let conflictResolved: (() => void) | undefined;
	let error = '';

	function matchesContext(
		captured: Activation,
		ownerChat: string,
		ownerFile: string | undefined,
		permission: typeof admitted,
		available: boolean
	) {
		return (
			available &&
			ownerChat === captured.chat &&
			ownerFile === captured.file &&
			permission(captured.chat, captured.file)
		);
	}
	function current(captured: Activation) {
		return (
			active && target === captured && matchesContext(captured, chatId, fileId, admitted, enabled)
		);
	}
	function dismiss() {
		target = undefined;
		stage = 'idle';
		pending = false;
		session = undefined;
		error = '';
	}
	function synchronizeContext(
		ownerChat: string,
		ownerFile: string | undefined,
		permission: typeof admitted,
		available: boolean
	) {
		if (active && target && !matchesContext(target, ownerChat, ownerFile, permission, available))
			dismiss();
	}
	function observeContext() {
		if (active) synchronizeContext(chatId, fileId, admitted, enabled);
	}
	const unsubscribeWorkspace = ocuWorkspaces.subscribe(observeContext);
	const unsubscribeConfig = config.subscribe(observeContext);
	$: synchronizeContext(chatId, fileId, admitted, enabled);
	function reason(failure: unknown) {
		return failure instanceof WorkspaceRequestError ? failure.reason : 'request_failed';
	}
	function open(captured: Activation) {
		if (!current(captured)) return;
		stage = 'opened';
		error = '';
		captured.generation = onOpen(captured.file);
	}
	async function read(captured: Activation) {
		if (!current(captured)) return;
		stage = 'reading';
		session = undefined;
		error = '';
		try {
			const result = await listOfficeVersions('/ocu', captured.chat, captured.file);
			if (!current(captured)) return;
			if (result.open_session?.state === 'conflict' && result.open_session.editor_ended) {
				session = result.open_session;
				conflictAdmission = () => current(captured);
				conflictResolved = () => {
					if (current(captured)) dismiss();
				};
				stage = 'conflict';
				return;
			}
			const latest = result.versions.reduce<(typeof result.versions)[number] | undefined>(
				(best, version) => (!best || version.number > best.number ? version : best),
				undefined
			);
			if (!result.open_session && latest && !latest.published) {
				const number = latest.number;
				const close = () => {
					if (current(captured)) dismiss();
				};
				actions = {
					restore: () => {
						void restore(captured, number);
					},
					start: () => {
						if (current(captured) && stage === 'choice' && !pending) open(captured);
					},
					close,
					escape: (event) => {
						if (event.key !== 'Escape') return;
						event.preventDefault();
						event.stopPropagation();
						close();
					}
				};
				stage = 'choice';
			} else open(captured);
		} catch (failure) {
			if (!current(captured)) return;
			error = $i18n.t('Versions could not be loaded: {{reason}}', { reason: reason(failure) });
			stage = 'error';
			retry = () => {
				if (current(captured)) start(true);
			};
		}
	}
	export function start(capturedEntry = false) {
		if (!active) return;
		observeContext();
		if (stage === 'reading' || stage === 'choice' || stage === 'conflict' || pending) return;
		const currentFile = fileId;
		if (!enabled || !currentFile || !admitted(chatId, currentFile) || (capturedEntry && !target))
			return;
		const selected = get(ocuWorkspaces)[chatId]?.files.find((file) => file.file_id === currentFile);
		if (!capturedEntry && !['docx', 'xlsx', 'pptx'].includes(selected?.type ?? '')) return;
		onRetire();
		target = { chat: chatId, file: currentFile, rechecked: false };
		void read(target);
	}
	export function refused(generation: number) {
		const captured = target;
		if (!captured || !current(captured) || stage !== 'opened' || captured.generation !== generation)
			return false;
		captured.generation = undefined;
		onRetire();
		if (captured.rechecked) {
			error = $i18n.t('Editing was refused: {{reason}}', { reason: 'unpublished_version' });
			stage = 'error';
			retry = () => {
				if (current(captured)) start(true);
			};
		} else {
			captured.rechecked = true;
			void read(captured);
		}
		return true;
	}
	async function restore(captured: Activation, number: number) {
		if (!current(captured) || stage !== 'choice' || pending) return;
		pending = true;
		error = '';
		try {
			await restoreOfficeVersion('/ocu', captured.chat, captured.file, number);
			if (current(captured)) open(captured);
		} catch (failure) {
			if (current(captured))
				error = $i18n.t('Restore was refused: {{reason}}', { reason: reason(failure) });
		} finally {
			if (current(captured)) pending = false;
		}
	}
	function capturedClick(node: HTMLButtonElement, callback: (() => void) | undefined) {
		if (!callback) return;
		node.addEventListener('click', callback);
		return {
			destroy() {
				node.removeEventListener('click', callback);
			}
		};
	}
	function capturedEscape(node: HTMLElement, callback: (event: KeyboardEvent) => void) {
		node.addEventListener('keydown', callback);
		return {
			destroy() {
				node.removeEventListener('keydown', callback);
			}
		};
	}
	onDestroy(() => {
		active = false;
		dismiss();
		unsubscribeWorkspace();
		unsubscribeConfig();
	});
</script>

{#key target}
	{#if stage === 'reading'}
		<p role="status">{$i18n.t('Checking unpublished content')}</p>
	{:else if stage === 'error'}
		<div>
			<p role="alert">{error}</p>
			<button
				type="button"
				class="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
				use:capturedClick={retry}>{$i18n.t('Retry')}</button
			>
		</div>
	{:else if stage === 'conflict' && session && target && conflictResolved}
		<OfficeConflictDialog
			{chatId}
			fileId={target.file}
			authority={{
				kind: 'preflight',
				session,
				admitted: conflictAdmission,
				onResolved: conflictResolved
			}}
		/>
	{:else if stage === 'choice' && actions}
		<div
			role="dialog"
			tabindex="-1"
			aria-label={$i18n.t('Unpublished content')}
			class="shrink-0 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
			use:capturedEscape={actions.escape}
		>
			<h3 class="mb-2 font-medium">{$i18n.t('Unpublished content')}</h3>
			{#if error}<p role="alert" class="mb-2 text-red-600 dark:text-red-400">{error}</p>{/if}
			{#if pending}<p role="status">{$i18n.t('Restoring version')}</p>{/if}
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					disabled={pending}
					class="rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
					use:capturedClick={actions.restore}
				>
					{$i18n.t('Restore the unpublished content')}
				</button>
				<button
					type="button"
					disabled={pending}
					class="rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
					use:capturedClick={actions.start}
				>
					{$i18n.t('Start from the current file')}
				</button>
				<button
					type="button"
					class="rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
					use:capturedClick={actions.close}>{$i18n.t('Close')}</button
				>
			</div>
		</div>
	{/if}
{/key}
