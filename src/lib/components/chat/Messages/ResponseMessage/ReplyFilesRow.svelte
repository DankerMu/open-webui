<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	import { settings } from '$lib/stores';
	import Image from '$lib/components/common/Image.svelte';
	import FileItem from '$lib/components/common/FileItem.svelte';
	import { notShownInOrder, type OutputItem } from '../structuredOutput';

	type ReplyFile = {
		type: string;
		url: string;
		id?: string;
		name?: string;
		content_type?: string;
		size?: number;
	};

	const i18n = getContext<Writable<i18nType>>('i18n');

	/** The message's files; the images its output shows after their call are left out (#937). */
	export let files: ReplyFile[] | undefined = [];
	export let output: OutputItem[] | undefined = [];

	$: shownFiles = (files ?? [])
		.filter(notShownInOrder(output))
		.filter((f) => ['image', 'file'].includes(f.type));
</script>

{#if shownFiles.length > 0}
	<div
		class="my-1 w-full flex overflow-x-auto gap-2 flex-wrap"
		dir={$settings?.chatDirection ?? 'auto'}
	>
		{#each shownFiles as file}
			<div>
				{#if file.type === 'image' || (file?.content_type ?? '').startsWith('image/')}
					<Image src={file.url} alt={file.name || $i18n.t('Generated Image')} />
				{:else}
					<FileItem
						item={file}
						url={file.url}
						name={file.name}
						type={file.type}
						size={file?.size}
						small={true}
					/>
				{/if}
			</div>
		{/each}
	</div>
{/if}
