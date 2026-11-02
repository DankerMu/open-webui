// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { file, url } from '../../../../test/ocu-workspace-fixtures';
import { OfficeArtifactHarness, namedButton } from './workspace-artifact-office-test';

// The real PDFViewer: pdf.js evaluates once jsdom has a DOMMatrix, and the failure under test
// is the HTTP response, which PDFViewer checks before pdf.js parses any byte.
const harness = new OfficeArtifactHarness();
const brief = { ...file('brief.pdf', 'brief.pdf'), type: 'pdf', mime: 'application/pdf' };

beforeEach(() => {
	harness.install();
	vi.stubGlobal('DOMMatrix', class {});
	harness.setListing([brief]);
	const listing = harness.scenario;
	harness.scenario = (input, init) =>
		input.startsWith(url) ? new Response('gone', { status: 404 }) : listing(input, init);
});
afterEach(() => harness.cleanup());

describe('PDF load failure', () => {
	it('leaves a visible failure and the working download', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		await harness.open();
		await harness.ready('brief.pdf');
		namedButton('brief.pdf').click();
		await tick();
		const surface = document.querySelector('[data-selected-preview]') as HTMLElement;
		await vi.waitFor(() => expect(surface.textContent).toContain('Failed to load PDF.'), {
			timeout: 5000
		});
		expect(harness.calls.map((call) => call.url)).toContain(`${url}brief.pdf?revision=1`);
		expect(logged).toHaveBeenCalledWith('PDF render error:', new Error('HTTP 404'));
		expect(surface.querySelector('canvas')).toBeNull();
		const download = document.querySelector('[data-selected-bar] a[download="brief.pdf"]');
		expect(download?.getAttribute('href')).toBe(`${url}brief.pdf?download=1`);
	});
});
