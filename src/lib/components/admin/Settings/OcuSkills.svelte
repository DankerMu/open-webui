<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { toast } from 'svelte-sonner';

	import {
		deleteSkill,
		getAdminSkills,
		updateSkillAccess,
		updateSkillDisplayName,
		uploadSkill,
		type OcuAdminSkill,
		type OcuSkillGrant
	} from '$lib/apis/ocu/skills';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import AccessControlModal from '$lib/components/workspace/common/AccessControlModal.svelte';
	import AdminSettingRow from './AdminSettingRow.svelte';
	import AdminSettingSection from './AdminSettingSection.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	const actionButtonClass =
		'text-xs text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white';
	const noticeClass = 'text-[0.6875rem] text-gray-500 dark:text-gray-400';
	const inputClass =
		'w-40 rounded-lg border border-gray-100/50 bg-gray-50/40 px-2 py-1.5 text-xs text-gray-700 outline-hidden transition-colors focus:border-blue-400 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-gray-300 dark:focus:border-blue-500';

	let skills: OcuAdminSkill[] = [];
	// Display-name field text per skill name; only a listing or a saved answer overwrites it.
	let drafts: Record<string, string> = {};
	let uploadInput: HTMLInputElement;
	let uploadError = '';

	let showAccess = false;
	let accessName = '';
	let accessGrants: OcuSkillGrant[] = [];

	let showDelete = false;
	let deleteName = '';

	const reason = (error: unknown) => (error instanceof Error ? error.message : `${error}`);

	const loadSkills = async () => {
		try {
			skills = await getAdminSkills(localStorage.token);
			drafts = Object.fromEntries(skills.map((skill) => [skill.name, skill.display_name ?? '']));
		} catch (error) {
			toast.error(reason(error));
		}
	};

	const upload = async () => {
		const file = uploadInput.files?.[0];
		if (!file) return;
		try {
			await uploadSkill(localStorage.token, file);
			uploadError = '';
			await loadSkills();
		} catch (error) {
			uploadError = reason(error);
		} finally {
			// Choosing the same file again must fire another change event.
			uploadInput.value = '';
		}
	};

	const openAccess = (skill: OcuAdminSkill) => {
		accessName = skill.name;
		accessGrants = skill.access_grants;
		showAccess = true;
	};

	// AccessControl has already written the edited set into the bound accessGrants.
	const saveAccess = async () => {
		const name = accessName;
		try {
			const updated = await updateSkillAccess(localStorage.token, name, accessGrants);
			skills = skills.map((skill) =>
				skill.name === name ? { ...skill, access_grants: updated.access_grants } : skill
			);
		} catch (error) {
			toast.error(reason(error));
			await loadSkills();
			if (accessName === name) {
				accessGrants = skills.find((skill) => skill.name === name)?.access_grants ?? [];
			}
		}
	};

	// Sent as typed: the server trims it and stores '' as no display name.
	const saveDisplayName = async (name: string) => {
		try {
			const updated = await updateSkillDisplayName(localStorage.token, name, drafts[name]);
			skills = skills.map((skill) => (skill.name === name ? updated : skill));
			drafts = { ...drafts, [name]: updated.display_name ?? '' };
		} catch (error) {
			toast.error(reason(error));
		}
	};

	const removeSkill = async () => {
		const name = deleteName;
		try {
			await deleteSkill(localStorage.token, name);
			skills = skills.filter((skill) => skill.name !== name);
		} catch (error) {
			toast.error(reason(error));
		}
	};

	onMount(loadSkills);
</script>

<AccessControlModal
	bind:show={showAccess}
	bind:accessGrants
	accessRoles={['read']}
	shareOpen={false}
	onChange={saveAccess}
/>

<ConfirmDialog
	bind:show={showDelete}
	title={$i18n.t('Delete skill')}
	message={$i18n.t('Delete the skill {{name}}? This cannot be undone.', { name: deleteName })}
	confirmLabel={$i18n.t('Delete')}
	on:confirm={removeSkill}
/>

<div class="flex flex-col h-full justify-between text-sm">
	<h2 class="text-sm font-medium text-gray-900 dark:text-white mb-4">
		{$i18n.t('Workspace Skills')}
	</h2>

	<div class="flex-1 min-h-0 overflow-y-auto scrollbar-hover pr-1.5">
		<div class="flex flex-col gap-1 mb-4">
			<p data-cy="ocu-skills-notice-revocation" class={noticeClass}>
				{$i18n.t(
					'Revoking access or deleting a skill reaches running sandboxes only after they are rebuilt.'
				)}
			</p>
			<p data-cy="ocu-skills-notice-replacement" class={noticeClass}>
				{$i18n.t(
					'A replaced ZIP reaches running sandboxes that already mount the skill within minutes (roughly 60–420 s); new sandboxes read the cache.'
				)}
			</p>
		</div>

		<input
			data-cy="ocu-skills-upload"
			bind:this={uploadInput}
			hidden
			type="file"
			accept=".zip,application/zip"
			on:change={upload}
		/>

		<AdminSettingSection title={$i18n.t('Upload')} first>
			<AdminSettingRow label={$i18n.t('Upload a skill ZIP')}>
				<button class={actionButtonClass} type="button" on:click={() => uploadInput.click()}>
					{$i18n.t('Upload')}
				</button>
			</AdminSettingRow>
			{#if uploadError}
				<p data-cy="ocu-skills-upload-error" class="text-xs text-red-500">{uploadError}</p>
			{/if}
		</AdminSettingSection>

		<AdminSettingSection title={$i18n.t('Skills')}>
			{#each skills as skill (skill.name)}
				<div data-cy="ocu-skills-row-{skill.name}">
					<AdminSettingRow label={skill.name} description={skill.description}>
						<div class="flex items-center gap-3">
							<input
								data-cy="ocu-skills-display-name-input-{skill.name}"
								class={inputClass}
								type="text"
								aria-label={$i18n.t('Display name')}
								placeholder={skill.name}
								bind:value={drafts[skill.name]}
							/>
							<button
								data-cy="ocu-skills-display-name-save-{skill.name}"
								class={actionButtonClass}
								type="button"
								on:click={() => saveDisplayName(skill.name)}
							>
								{$i18n.t('Save')}
							</button>
							<button
								data-cy="ocu-skills-access-{skill.name}"
								class={actionButtonClass}
								type="button"
								on:click={() => openAccess(skill)}
							>
								{$i18n.t('Access')}
							</button>
							<button
								data-cy="ocu-skills-delete-{skill.name}"
								class={actionButtonClass}
								type="button"
								on:click={() => {
									deleteName = skill.name;
									showDelete = true;
								}}
							>
								{$i18n.t('Delete')}
							</button>
						</div>
					</AdminSettingRow>
				</div>
			{:else}
				<p class="text-xs text-gray-400 dark:text-gray-600">{$i18n.t('No skills uploaded yet.')}</p>
			{/each}
		</AdminSettingSection>
	</div>
</div>
