// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { config } from '$lib/stores';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { chat, json } from '../../../../test/ocu-workspace-fixtures';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	htmlFile,
	namedButton,
	officeConfig,
	officeDocx,
	previewFrame
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();
const bar = () => document.querySelector('[data-selected-bar]')!;
const download = () => bar().querySelector('a[download]')!;

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('Selected workspace file presentation', () => {
	it('shows the nested file name, folder, kind and size with its real download target', async () => {
		harness.setListing([
			{
				...officeDocx,
				path: 'documents/report.docx',
				url: '/ocu/files/owner-chat/documents/report.docx',
				size: 2048
			}
		]);
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('report.docx');
		expect(bar().querySelector('[data-selected-name]')?.textContent).toBe('report.docx');
		expect(bar().textContent).toContain('documents');
		expect(bar().querySelector('[data-file-kind]')?.getAttribute('data-file-kind')).toBe(
			'document'
		);
		expect(bar().querySelector('[data-file-size]')?.textContent).toBe('2.0 KB');
		expect(download().getAttribute('href')).toBe(
			'/ocu/files/owner-chat/documents/report.docx?download=1'
		);
		expect(download().getAttribute('download')).toBe('report.docx');
	});

	it('opens fetched version history from the action bar without opening an editor', async () => {
		const workspaceScenario = harness.scenario;
		harness.scenario = (url, init) =>
			url === '/ocu/api/office/owner-chat/documents/report.docx/versions'
				? json({
						file_id: 'report.docx',
						published_version: 7,
						open_session: null,
						versions: [
							{
								number: 7,
								parent: null,
								source: 'workspace',
								sha256: 'a'.repeat(64),
								size: 2048,
								created_at: '2026-10-01T09:15:00Z',
								published: true
							}
						]
					})
				: workspaceScenario(url, init);
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		namedButton('Version history').click();
		await vi.waitFor(() => {
			const history = document.querySelector('[role="region"][aria-label="Version history"]');
			expect(
				[...history!.querySelectorAll('tbody td')].slice(0, 4).map((cell) => cell.textContent)
			).toEqual(['7', '2026-10-01T09:15:00Z', 'workspace', 'true']);
		});
		expect(editorFrame('report.docx')).toBeNull();
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(
			harness.officeRequests().map(({ url, init }) => ({ url, method: init?.method }))
		).toEqual([
			{ url: '/ocu/api/office/owner-chat/documents/report.docx/versions', method: 'GET' }
		]);
		namedButton('Close version history').click();
		await tick();
		expect(document.querySelector('[role="region"][aria-label="Version history"]')).toBeNull();
	});

	it('enters the actual editor from Edit while retaining download and hiding the duplicate bar history action', async () => {
		await harness.open();
		await harness.ready('report.docx');
		const frame = await harness.selectAndEdit('report.docx');
		const { openMessage } = await harness.acceptEditing(frame);
		expect(openMessage).toMatchObject({
			type: 'ocu:office-open',
			chat_id: 'owner-chat',
			file_id: 'report.docx'
		});
		expect(previewFrame('report.docx')).toBeNull();
		expect(editorFrame('report.docx')).toBe(frame);
		expect(
			[...bar().querySelectorAll('button')].map((button) => button.textContent?.trim())
		).not.toContain('Version history');
		expect(download().getAttribute('href')).toBe('/ocu/files/owner-chat/report.docx?download=1');
		expect(download().getAttribute('download')).toBe('report.docx');
	});

	it.each(['html', 'office-disabled'] as const)(
		'keeps %s read-only with download but no edit or history action',
		async (kind) => {
			if (kind === 'office-disabled') config.set(officeConfig(false));
			await harness.open();
			const file = kind === 'html' ? htmlFile : officeDocx;
			await harness.ready(file.name);
			namedButton(file.name).click();
			await tick();
			expect(editAction()).toBeUndefined();
			expect(
				[...bar().querySelectorAll('button')].map((button) => button.textContent?.trim())
			).not.toContain('Version history');
			expect(download().getAttribute('href')).toBe(`/ocu/files/owner-chat/${file.name}?download=1`);
			expect(download().getAttribute('download')).toBe(file.name);
			expect(editorFrame(file.name)).toBeNull();
			if (kind === 'office-disabled') expect(previewFrame(file.name)).not.toBeNull();
			expect(harness.officeRequests()).toEqual([]);
		}
	);

	it('restores the bar history action when the editor ready deadline retires the editor', async () => {
		await harness.open();
		await harness.ready('report.docx');
		vi.useFakeTimers();
		await harness.selectAndEdit('report.docx');
		await vi.advanceTimersByTimeAsync(10_000);
		await tick();
		expect(document.body.textContent).toContain('Office editor did not become ready');
		expect(
			[...bar().querySelectorAll('button')].map((button) => button.textContent?.trim())
		).toContain('Version history');
		expect(download().getAttribute('href')).toBe('/ocu/files/owner-chat/report.docx?download=1');
		expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
			['GET', '/ocu/api/office/owner-chat/documents/report.docx/versions']
		]);
	});
});
