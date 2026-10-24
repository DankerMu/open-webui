// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import { describeBody } from '../../../../test/ocu-workspace-fixtures';
import type { WorkspaceFile } from '$lib/apis/ocu';
import {
	OfficeArtifactHarness,
	editAction,
	htmlFile,
	namedButton,
	namedControl,
	officeDocx,
	selectedFileSurface
} from './workspace-artifact-office-test';

const EXPLANATION =
	'This file name cannot be opened here. Rename it in the terminal to open or download it.';
// OCU display forms (D4): b'\xb1\xa8.docx' under a non-UTF-8 directory, and a backslash name.
const surrogateDocx: WorkspaceFile = {
	...officeDocx,
	file_id: '0b8e1f3c-surrogate',
	path: 'sub\\xb1/\\xb1\\xa8.docx',
	name: '\\xb1\\xa8.docx',
	url: null,
	too_large: false,
	unsupported_name: true
};
const backslashHtml: WorkspaceFile = {
	...htmlFile,
	file_id: '7c2d9a41-backslash',
	path: 'a\\b.html',
	name: 'a\\b.html',
	url: null,
	too_large: false,
	unsupported_name: true
};
const files = [officeDocx, htmlFile, surrogateDocx, backslashHtml];

const harness = new OfficeArtifactHarness();

function expectNonActionable() {
	const region = selectedFileSurface();
	expect(region).not.toBeNull();
	const surface = region!.querySelector('[data-selected-preview]');
	expect(surface?.querySelector('[role="status"]')?.textContent?.trim()).toBe(EXPLANATION);
	expect(region!.querySelectorAll('a')).toHaveLength(0);
	expect(document.querySelectorAll('iframe')).toHaveLength(0);
	expect(document.body.textContent).not.toContain('Connecting Office preview');
	expect(editAction()).toBeUndefined();
	expect(namedControl('Version history')).toBeUndefined();
	expect(harness.officeRequests()).toEqual([]);
}

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('unsupported-name workspace files', () => {
	it('lists unsupported rows by display name with a marker and leaves other rows unchanged', async () => {
		harness.setListing(files);
		await harness.open();
		await harness.ready('a\\b.html');
		expect(
			namedButton('\\xb1\\xa8.docx').querySelector('[data-unsupported-name]')?.textContent
		).toBe('Unsupported name');
		expect(namedButton('a\\b.html').querySelector('[data-unsupported-name]')?.textContent).toBe(
			'Unsupported name'
		);
		expect(document.body.textContent).toContain('sub\\xb1');
		for (const name of ['report.docx', 'page.html']) {
			expect(namedButton(name).querySelector('[data-unsupported-name]'), name).toBeNull();
			expect(namedButton(name).textContent, name).not.toContain('Unsupported name');
		}
	});

	it.each([
		['DOCX', surrogateDocx],
		['HTML', backslashHtml]
	] as const)(
		'selecting an unsupported %s explains why, with no frame, Edit, history or download',
		async (_kind, entry) => {
			harness.setListing(files);
			await harness.open();
			await harness.ready(entry.name);
			namedButton(entry.name).click();
			await tick();
			await harness.ready(EXPLANATION);
			expect(namedButton(entry.name).getAttribute('aria-pressed')).toBe('true');
			expect(selectedFileSurface()?.querySelector('[data-selected-name]')?.textContent).toBe(
				entry.name
			);
			expectNonActionable();
		}
	);

	it('keeps the normal Office branch and its download beside unsupported files', async () => {
		harness.setListing(files);
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		await harness.ready('Connecting Office preview');
		expect(editAction()).toBeDefined();
		const download = selectedFileSurface()?.querySelector('a[download="report.docx"]');
		expect(download?.getAttribute('href')).toBe('/ocu/files/owner-chat/report.docx?download=1');
	});

	it('gates an unsupported Office file restored as the saved selection', async () => {
		const restored = {
			...describeBody,
			prefs: { selected_file_id: surrogateDocx.file_id, open: true }
		};
		harness.setListing(files, restored);
		await harness.open();
		await harness.ready(EXPLANATION);
		expectNonActionable();
	});
});
