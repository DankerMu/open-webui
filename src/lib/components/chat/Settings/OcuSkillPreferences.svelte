<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { toast } from 'svelte-sonner';

	import { getUserSkills, toggleSkill, type OcuUserSkill } from '$lib/apis/ocu/skills';
	import Switch from '$lib/components/common/Switch.svelte';
	import UserSettingRow from './UserSettingRow.svelte';
	import UserSettingSection from './UserSettingSection.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	// The server's answers are the only state: nothing here is cached or written to user.settings.
	let skills: OcuUserSkill[] = [];
	let loaded = false;
	let pending: Record<string, boolean> = {};

	const reason = (error: unknown) => (error instanceof Error ? error.message : `${error}`);

	const setEnabled = (name: string, enabled: boolean) => {
		skills = skills.map((skill) => (skill.name === name ? { ...skill, enabled } : skill));
	};

	const loadSkills = async () => {
		try {
			skills = await getUserSkills(localStorage.token);
		} catch (error) {
			toast.error(reason(error));
		}
		loaded = true;
	};

	// bind:state has already flipped the row; the fieldset holds the switch until the server answers.
	// The fieldset blocks clicks only, so a keyboard toggle in flight is put back here, unsent.
	const toggle = async (name: string, enabled: boolean) => {
		if (pending[name]) {
			setEnabled(name, !enabled);
			return;
		}
		pending = { ...pending, [name]: true };
		try {
			setEnabled(name, (await toggleSkill(localStorage.token, name, enabled)).enabled);
		} catch (error) {
			setEnabled(name, !enabled);
			toast.error(reason(error));
		} finally {
			pending = { ...pending, [name]: false };
		}
	};

	onMount(loadSkills);
</script>

<div data-cy="ocu-skills-pref" class="flex flex-col h-full justify-between text-sm">
	<h2 class="text-sm font-medium text-gray-900 dark:text-white mb-4">
		{$i18n.t('Workspace Skills')}
	</h2>

	<div class="flex-1 min-h-0 overflow-y-auto scrollbar-hover pr-1.5">
		<UserSettingSection first>
			{#each skills as skill (skill.name)}
				<div data-cy="ocu-skills-pref-row-{skill.name}" class="flex flex-col gap-2.5">
					<UserSettingRow label={skill.name} description={skill.description}>
						<fieldset data-cy="ocu-skills-pref-switch-{skill.name}" disabled={pending[skill.name]}>
							<Switch
								bind:state={skill.enabled}
								ariaLabel={skill.name}
								on:change={(event) => toggle(skill.name, event.detail)}
							/>
						</fieldset>
					</UserSettingRow>
				</div>
			{:else}
				{#if loaded}
					<p data-cy="ocu-skills-pref-empty" class="text-xs text-gray-400 dark:text-gray-600">
						{$i18n.t('No workspace skills are available to you.')}
					</p>
				{/if}
			{/each}
		</UserSettingSection>
	</div>
</div>
