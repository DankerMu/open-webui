<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { chatEffortParams, type ChatEffortBinding } from '$lib/stores/chat-effort';
	import {
		currentChoice,
		effortVocabulary,
		reconciledParams,
		withChoice,
		type EffortChoice,
		type EffortTransition
	} from '$lib/utils/reasoning-effort';
	import Dropdown from '../common/Dropdown.svelte';
	import DropdownMenu from '../common/DropdownMenu.svelte';
	import LightBulb from '../icons/LightBulb.svelte';
	import Check from '../icons/Check.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	let show = false;
	let previous: EffortTransition | undefined;

	// Reconciles from ChatControls' single publication only, so params and models always belong to
	// the same chat; every helper returns the same reference once applied, which ends the round.
	const reconcile = (binding: ChatEffortBinding | null) => {
		if (!binding) {
			previous = undefined;
			return;
		}
		const vocabulary = effortVocabulary(binding.modelIds);
		const next = reconciledParams(binding.params, vocabulary, previous);
		if (vocabulary !== undefined) previous = { vocabulary, params: next };
		if (next !== binding.params) binding.setParams(next);
	};
	$: reconcile($chatEffortParams);

	$: vocabulary = $chatEffortParams ? effortVocabulary($chatEffortParams.modelIds) : undefined;
	$: choice = $chatEffortParams ? currentChoice($chatEffortParams.params) : undefined;

	const labels: Record<EffortChoice, () => string> = {
		off: () => $i18n.t('Off'),
		low: () => $i18n.t('Low'),
		medium: () => $i18n.t('Medium'),
		high: () => $i18n.t('High'),
		xhigh: () => $i18n.t('XHigh'),
		max: () => $i18n.t('Max')
	};
	$: label = choice && vocabulary?.levels.includes(choice) ? labels[choice]() : $i18n.t('Default');

	const pick = (level: EffortChoice) => {
		if ($chatEffortParams) $chatEffortParams.setParams(withChoice($chatEffortParams.params, level));
		show = false;
	};
</script>

{#if vocabulary}
	<Dropdown bind:show side="top" align="end">
		<button
			type="button"
			class="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[0.8125rem] font-normal text-gray-600 transition-colors duration-100 hover:bg-gray-50/40 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800/40 dark:hover:text-gray-200"
			aria-label={$i18n.t('Thinking strength: {{label}}', { label })}
		>
			<LightBulb className="size-4" />
			<span class="hidden sm:inline">{label}</span>
		</button>
		<div slot="content">
			<DropdownMenu className="min-w-32">
				{#each vocabulary.levels as level (level)}
					<button
						type="button"
						role="menuitemradio"
						aria-checked={choice === level}
						class="justify-between"
						on:click={() => pick(level)}
					>
						<span>{labels[level]()}</span>
						{#if choice === level}<Check className="size-3.5" />{/if}
					</button>
				{/each}
			</DropdownMenu>
		</div>
	</Dropdown>
{/if}
