<script context="module" lang="ts">
	import { decode } from 'html-entities';

	const IMAGE_TOOLS = new Set(['generate_image', 'edit_image']);

	type ToolCallAttributes = { name?: string; arguments?: string; done?: string; status?: string };

	/**
	 * A running generate_image/edit_image call and its aspect_ratio argument; null for any other
	 * tool or once the call is done, failed, incomplete, denied or waiting for approval. The one
	 * rule ToolCallDisplay and the collapsed ConsecutiveDetailsGroup both show the card by.
	 */
	export function runningImageCall(
		attributes: ToolCallAttributes | undefined,
		resolvable: boolean
	): { aspectRatio: unknown } | null {
		if (!attributes || !IMAGE_TOOLS.has(attributes.name ?? '')) return null;
		const { done, status } = attributes;
		if (done === 'true' || ['failed', 'incomplete', 'rejected'].includes(status ?? '')) return null;
		if (status === 'pending' && resolvable) return null;
		return { aspectRatio: aspectRatioArgument(attributes.arguments) };
	}

	/** The arguments arrive entity-encoded, sometimes JSON-in-JSON, and partial while streaming. */
	function aspectRatioArgument(encoded: string | undefined): unknown {
		let value: unknown = decode(encoded ?? '');
		while (typeof value === 'string') {
			try {
				value = JSON.parse(value);
			} catch {
				// Partial JSON while the model still streams the call: no ratio yet, so a square.
				return undefined;
			}
		}
		return typeof value === 'object' && value !== null
			? (value as Record<string, unknown>).aspect_ratio
			: undefined;
	}
</script>

<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	const i18n = getContext<Writable<i18nType>>('i18n');

	/** The call's `aspect_ratio` argument as the model sent it; anything but `W:H` is a square. */
	export let aspectRatio: unknown = undefined;

	// The card fits a 24rem box (at most the message width): landscape cards are 24rem wide,
	// portrait ones 24rem tall, so a 9:16 card does not tower over the chat.
	const BOX_REM = 24;
	const RATIO_RE = /^(\d+):(\d+)$/;

	function ratioOf(value: unknown): [number, number] {
		const match = typeof value === 'string' ? RATIO_RE.exec(value.trim()) : null;
		const width = Number(match?.[1]);
		const height = Number(match?.[2]);
		return width > 0 && height > 0 ? [width, height] : [1, 1];
	}

	$: [width, height] = ratioOf(aspectRatio);
	$: widthRem = BOX_REM * Math.min(1, width / height);

	let elapsed = 0;
	onMount(() => {
		// Counts from mount: no start time is stored client-side, so a reload restarts at 0.
		const timer = setInterval(() => (elapsed += 1), 1000);
		return () => clearInterval(timer);
	});
</script>

<div
	class="image-generation-placeholder relative my-2 overflow-hidden rounded-lg bg-gray-50/60 dark:bg-white/[0.02]"
	style="aspect-ratio: {width} / {height}; width: {widthRem}rem; max-width: 100%;"
	aria-busy="true"
	data-cy="image-generation-placeholder"
>
	<div class="dots absolute inset-0" aria-hidden="true" data-cy="image-generation-dots">
		<div class="wave absolute inset-0"></div>
	</div>
	<div
		class="absolute inset-x-0 top-0 flex items-baseline justify-between gap-2 px-3 py-2 text-xs text-gray-400 dark:text-gray-500"
	>
		<span role="status">{$i18n.t('Creating image')}</span>
		<span class="tabular-nums" data-cy="image-generation-seconds"
			>{$i18n.t('{{COUNT}}s', { COUNT: String(elapsed) })}</span
		>
	</div>
</div>

<style>
	.image-generation-placeholder {
		--dot-idle: rgb(156 163 175 / 0.35);
		/* Tailwind orange-400 */
		--dot-wave: #fb923c;
	}

	:global(.dark) .image-generation-placeholder {
		--dot-idle: rgb(107 114 128 / 0.35);
		/* Tailwind orange-300 */
		--dot-wave: #fdba74;
	}

	.dots,
	.wave {
		background-size: 0.75rem 0.75rem;
		background-position: center;
	}

	.dots {
		background-image: radial-gradient(circle, var(--dot-idle) 0.075rem, transparent 0.1rem);
	}

	/* Larger orange dots on the same grid, shown only under a diagonal band that sweeps across. */
	.wave {
		background-image: radial-gradient(circle, var(--dot-wave) 0.15rem, transparent 0.175rem);
		mask-image: linear-gradient(
			120deg,
			transparent 25%,
			rgb(0 0 0 / 0.4) 38%,
			black 50%,
			rgb(0 0 0 / 0.4) 62%,
			transparent 75%
		);
		mask-size: 250% 250%;
		mask-repeat: no-repeat;
		animation: image-generation-wave 2.5s ease-in-out infinite;
	}

	@keyframes image-generation-wave {
		from {
			mask-position: 100% 100%;
		}
		to {
			mask-position: 0% 0%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wave {
			animation: none;
			mask-position: 50% 50%;
		}
	}
</style>
