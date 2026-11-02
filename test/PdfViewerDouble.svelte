<script context="module" lang="ts">
	// Every mounted instance, in mount order; a remount appends and retires the previous one.
	export const pdfViewers: Array<{ url: string | null; singlePage: boolean; destroyed: boolean }> =
		[];
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';

	// Stands in for PDFViewer under jsdom, which cannot evaluate pdf.js; real rendering is e2e-only.
	export let url: string | null = null;
	export let singlePage = false;
	export let className = '';
	const instance = { url, singlePage, destroyed: false };
	pdfViewers.push(instance);
	onDestroy(() => (instance.destroyed = true));
</script>

<div data-pdf-viewer class={className} data-url={url} data-single-page={singlePage}></div>
