<script lang="ts">
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	import { settings, user } from '$lib/stores';
	import { selectSkin, skins } from '$lib/skins';
	import Dropdown from '../common/Dropdown.svelte';
	import DropdownMenu from '../common/DropdownMenu.svelte';
	import Tooltip from '../common/Tooltip.svelte';
	import Palette from '../icons/Palette.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');
	const tiles = [null, ...skins.map((skin) => skin.id)];

	// Literal calls so `npm run i18n:parse` extracts them; skins.ts carries ids only.
	$: names = {
		'olive-ops': $i18n.t('Olive Ops'),
		'snow-plateau': $i18n.t('Snow Plateau'),
		'golden-peaks': $i18n.t('Golden Peaks'),
		'cloud-watch': $i18n.t('Cloud Watch'),
		'river-hydrology': $i18n.t('River Hydrology'),
		'terrain-grid': $i18n.t('Terrain Grid'),
		'glacier-lake': $i18n.t('Glacier Lake'),
		starfield: $i18n.t('Starfield'),
		'minimal-terrain': $i18n.t('Minimal Terrain')
	} as Record<string, string>;
	// An unknown stored id is a removed skin, shown as None.
	$: current = tiles.includes($settings?.skin ?? null) ? ($settings?.skin ?? null) : null;

	// The popover stays open so the user can compare skins.
	const choose = async (id: string | null) => {
		if (!(await selectSkin(id))) {
			toast.error($i18n.t('Failed to update settings'));
		}
	};
</script>

<!-- Saving needs settings.interface for non-admins; same rule as SettingsModal's Interface tab. -->
{#if $user?.role === 'admin' || ($user?.permissions?.settings?.interface ?? true)}
	<Dropdown align="end" sideOffset={8}>
		<Tooltip content={$i18n.t('Skin')}>
			<button
				type="button"
				class="flex size-6 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50/40 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/40 dark:hover:text-gray-200"
				aria-label={$i18n.t('Skin')}
			>
				<Palette className="size-5" strokeWidth="1" />
			</button>
		</Tooltip>
		<div slot="content">
			<DropdownMenu className="w-[25rem] max-w-[calc(100vw-2rem)]">
				<div class="grid grid-cols-3 gap-1.5 p-1.5">
					{#each tiles as id (id)}
						<button
							type="button"
							class="flex flex-col gap-1 rounded-lg p-1 text-left text-xs transition hover:bg-gray-50 dark:hover:bg-gray-800 {current ===
							id
								? 'ring-2 ring-blue-500'
								: ''}"
							aria-pressed={current === id}
							on:click={() => choose(id)}
						>
							{#if id}
								<img
									src="/skins/{id}-thumb.webp"
									alt=""
									class="aspect-video w-full rounded-md object-cover"
								/>
							{:else}
								<span
									class="aspect-video w-full rounded-md border border-dashed border-gray-300 dark:border-gray-600"
								></span>
							{/if}
							<span class="truncate px-0.5">{id ? names[id] : $i18n.t('None')}</span>
						</button>
					{/each}
				</div>
			</DropdownMenu>
		</div>
	</Dropdown>
{/if}
