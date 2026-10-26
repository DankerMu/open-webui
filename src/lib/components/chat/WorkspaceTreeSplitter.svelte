<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	// Tree column width in px for the open panel; the parent's CSS bounds still apply on shrink.
	export let width: number;
	const MIN_TREE = 100;
	const MIN_FILE_COLUMN = 200;
	const KEY_STEP = 16;
	const i18n: Writable<i18nType> = getContext('i18n');
	let node: HTMLElement;
	let drag: { pointer: number; startX: number; startWidth: number } | undefined;
	// Row bound for the tree width; re-measured on mount, focus and every use.
	let max = MIN_TREE;

	function measure() {
		max = Math.max(MIN_TREE, (node.parentElement?.clientWidth ?? 0) - MIN_FILE_COLUMN);
	}
	function clamp(value: number) {
		measure();
		return Math.min(Math.max(value, MIN_TREE), max);
	}
	function start(event: PointerEvent) {
		drag = { pointer: event.pointerId, startX: event.clientX, startWidth: clamp(width) };
		node.setPointerCapture?.(event.pointerId);
	}
	function move(event: PointerEvent) {
		if (drag?.pointer !== event.pointerId) return;
		width = clamp(drag.startWidth + event.clientX - drag.startX);
	}
	function end(event: PointerEvent) {
		if (drag?.pointer !== event.pointerId) return;
		drag = undefined;
		node.releasePointerCapture?.(event.pointerId);
	}
	function keydown(event: KeyboardEvent) {
		const step = event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0;
		if (!step) return;
		event.preventDefault();
		width = clamp(clamp(width) + step);
	}
	// Listeners are attached here: Svelte's a11y lint treats a focusable separator as static.
	function resizer(target: HTMLElement) {
		node = target;
		measure();
		const pointer = { pointerdown: start, pointermove: move, pointerup: end, pointercancel: end };
		const entries = Object.entries(pointer) as [keyof typeof pointer, typeof start][];
		for (const [type, listener] of entries) target.addEventListener(type, listener);
		target.addEventListener('keydown', keydown);
		target.addEventListener('focus', measure);
		return {
			destroy() {
				for (const [type, listener] of entries) target.removeEventListener(type, listener);
				target.removeEventListener('keydown', keydown);
				target.removeEventListener('focus', measure);
			}
		};
	}
</script>

<!-- A focusable separator is an ARIA widget (resizer); Svelte classifies the role as static. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	use:resizer
	class="group relative z-10 w-0 shrink-0 outline-none"
	role="separator"
	aria-label={$i18n.t('Resize file tree')}
	aria-orientation="vertical"
	aria-valuenow={Math.min(Math.max(width, MIN_TREE), max)}
	aria-valuemin={MIN_TREE}
	aria-valuemax={max}
	tabindex="0"
>
	<div class="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize touch-none">
		<div
			class="mx-auto h-full w-px bg-gray-100 transition-colors group-hover:bg-gray-300 group-focus-visible:w-0.5 group-focus-visible:bg-gray-400 dark:bg-gray-800 dark:group-hover:bg-gray-600"
		></div>
	</div>
</div>
