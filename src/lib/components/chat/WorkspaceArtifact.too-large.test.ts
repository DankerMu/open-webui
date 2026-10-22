// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import { describeBody, url } from '../../../../test/ocu-workspace-fixtures';
import type { WorkspaceFile } from '$lib/apis/ocu';
import {
	OfficeArtifactHarness,
	editAction,
	htmlFile,
	namedButton,
	namedControl,
	officeDocx,
	previewFrame
} from './workspace-artifact-office-test';

// One byte over the OCU broker's 100 MiB per-file limit (outputs_broker.py max_file_size).
const OVERSIZED = 104857601;
const TOO_LARGE_STATUS = 'This file is larger than the 100 MiB preview limit.';
const bigHtml: WorkspaceFile = {
	...htmlFile,
	file_id: 'big-html',
	path: 'big.html',
	name: 'big.html',
	url: `${url}big.html`,
	size: OVERSIZED,
	too_large: true
};
const bigDocx: WorkspaceFile = {
	...officeDocx,
	file_id: 'big-docx',
	path: 'big.docx',
	name: 'big.docx',
	url: `${url}big.docx`,
	size: OVERSIZED,
	too_large: true
};
const normalDocx: WorkspaceFile = { ...officeDocx, too_large: false };

const harness = new OfficeArtifactHarness();

function row(name: string) {
	return namedButton(name);
}

function selectedRegion() {
	const region = document.querySelector('[aria-label="Selected workspace file"]');
	expect(region).not.toBeNull();
	return region as HTMLElement;
}

function previewSurface() {
	const surface = selectedRegion().querySelector('[data-selected-preview]');
	expect(surface).not.toBeNull();
	return surface as HTMLElement;
}

function downloads(name: string) {
	return [...selectedRegion().querySelectorAll('a')].filter(
		(link) => link.getAttribute('download') === name
	);
}

function expectGated(file: WorkspaceFile) {
	const surface = previewSurface();
	expect(surface.querySelector('[role="status"]')?.textContent?.trim()).toBe(TOO_LARGE_STATUS);
	expect(document.querySelectorAll('iframe')).toHaveLength(0);
	expect(previewFrame(file.name)).toBeNull();
	expect(document.body.textContent).not.toContain('Connecting Office preview');
	expect(editAction()).toBeUndefined();
	expect(namedControl('Version history')).toBeUndefined();
	const links = downloads(file.name);
	expect(links.map((link) => link.getAttribute('href'))).toEqual([
		`${url}${file.name}?download=1`,
		`${url}${file.name}?download=1`
	]);
	expect(links.map((link) => link.textContent?.trim())).toEqual([
		`Download ${file.name}`,
		'Download'
	]);
	expect(surface.contains(links[1])).toBe(true);
	expect(harness.officeRequests()).toEqual([]);
}

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('too-large workspace files', () => {
	it('lists too-large rows with a marker beside their size and leaves other rows unchanged', async () => {
		harness.setListing([normalDocx, htmlFile, bigHtml, bigDocx]);
		await harness.open();
		await harness.ready('big.docx');
		for (const name of ['big.html', 'big.docx']) {
			expect(row(name).querySelector('[data-too-large]')?.textContent?.trim(), name).toBe(
				'Too large'
			);
			expect(row(name).querySelector('[data-file-size]')?.textContent, name).toBe('100.0 MB');
		}
		for (const name of ['report.docx', 'page.html']) {
			expect(row(name).querySelector('[data-too-large]'), name).toBeNull();
			expect(row(name).textContent, name).not.toContain('Too large');
		}
	});

	it.each([
		['HTML', bigHtml],
		['DOCX', bigDocx]
	] as const)(
		'selecting a too-large %s offers only download, with no frame, Edit or history',
		async (_kind, big) => {
			harness.setListing([normalDocx, htmlFile, bigHtml, bigDocx]);
			await harness.open();
			await harness.ready(big.name);
			row(big.name).click();
			await tick();
			await harness.ready(TOO_LARGE_STATUS);
			expectGated(big);
			row(big.name).click();
			await tick();
			expectGated(big);
		}
	);

	it('keeps the normal Office and generated branches beside too-large files', async () => {
		harness.setListing([normalDocx, htmlFile, bigHtml, bigDocx]);
		await harness.open();
		await harness.ready('report.docx');
		row('report.docx').click();
		await tick();
		await harness.ready('Connecting Office preview');
		expect(editAction()).toBeDefined();
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(previewSurface().textContent).not.toContain(TOO_LARGE_STATUS);

		row('page.html').click();
		await tick();
		const generated = previewSurface().querySelector('iframe[title="page.html"]');
		expect(generated?.getAttribute('src')).toBe(`${url}page.html?revision=1`);
		expect(generated?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');

		row('big.docx').click();
		await tick();
		await harness.ready(TOO_LARGE_STATUS);
		expectGated(bigDocx);
		expect(harness.officeRequests()).toEqual([]);
	});

	it('gates a too-large Office file restored as the saved selection', async () => {
		const restored = { ...describeBody, prefs: { selected_file_id: bigDocx.file_id, open: true } };
		harness.setListing([normalDocx, bigDocx], restored);
		await harness.open();
		await harness.ready(TOO_LARGE_STATUS);
		expectGated(bigDocx);
	});
});
