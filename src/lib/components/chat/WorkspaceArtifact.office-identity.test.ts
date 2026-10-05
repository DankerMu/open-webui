// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { ocuOffice } from '$lib/stores/ocu-office';
import { chat } from '../../../../test/ocu-workspace-fixtures';
import { OFFICE_EDITOR_ALLOW, OFFICE_EDITOR_SANDBOX } from './office-editor-frame';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	namedButton,
	officeDocx,
	previewFrame
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('Office admitted editor identity', () => {
	it.each([
		{
			label: 'unsupported backup type',
			path: 'report.docx.bak',
			type: 'other',
			mime: 'application/octet-stream'
		},
		{
			label: 'generated HTML',
			path: 'report.html',
			type: 'html',
			mime: 'text/html'
		},
		{
			label: 'generated XML',
			path: 'report.xml',
			type: 'other',
			mime: 'application/xml'
		}
	])(
		'keeps an admitted editor across a same-ID refresh to $label',
		async ({ path, type, mime }) => {
			await harness.open();
			await harness.ready('report.docx');
			const frame = await harness.selectAndEdit('report.docx');
			expect(frame.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=office`);
			expect(frame.getAttribute('sandbox')).toBe(OFFICE_EDITOR_SANDBOX);
			expect(frame.getAttribute('allow')).toBe(OFFICE_EDITOR_ALLOW);
			const { sent, openMessage } = await harness.acceptEditing(frame);
			await harness.refreshReclassifiedListing(harness.reclassifiedFile(path, type, mime));
			const surviving = editorFrame(path);
			expect(surviving).toBe(frame);
			expect(surviving!.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=office`);
			expect(surviving!.getAttribute('sandbox')).toBe(OFFICE_EDITOR_SANDBOX);
			expect(surviving!.getAttribute('allow')).toBe(OFFICE_EDITOR_ALLOW);
			expect(previewFrame(path)).toBeNull();
			expect(document.querySelector(`iframe[title="${path}"]`)).toBeNull();
			expect(editAction()).toBeUndefined();
			expect(get(ocuOffice)[chat]).toMatchObject({
				fileId: officeDocx.file_id,
				sessionId: 'sess-1',
				state: 'editing',
				generation: openMessage.generation
			});
			window.dispatchEvent(
				new MessageEvent('message', {
					origin: window.location.origin,
					source: frame.contentWindow,
					data: {
						type: 'ocu:office-state',
						chat_id: chat,
						file_id: officeDocx.file_id,
						generation: openMessage.generation,
						session_id: 'sess-1',
						state: 'saving',
						dirty: true,
						workspace_changed: false,
						reason: null
					}
				})
			);
			await tick();
			expect(get(ocuOffice)[chat]).toMatchObject({
				fileId: officeDocx.file_id,
				sessionId: 'sess-1',
				state: 'saving',
				dirty: true,
				generation: openMessage.generation
			});
			expect(sent).toHaveBeenCalledTimes(1);
			expect(harness.officeRequests()).toEqual([]);
			expect(harness.launchRequests()).toEqual([]);
			namedButton('page.html').click();
			await tick();
			expect(editorFrame(path)).toBeNull();
			namedButton(path).click();
			await tick();
			expect(editAction()).toBeUndefined();
			expect(editorFrame(path)).toBeNull();
		}
	);

	it('retries a timed-out activation after a same-ID non-Office reclassification', async () => {
		vi.useFakeTimers();
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		editAction()!.click();
		await tick();
		const retired = editorFrame('report.docx');
		expect(retired).not.toBeNull();
		const retiredWindow = retired!.contentWindow;
		const sent = vi.spyOn(retiredWindow!, 'postMessage');
		const generation = get(ocuOffice)[chat].generation;
		await harness.refreshReclassifiedListing(
			harness.reclassifiedFile('report.docx.bak', 'other', 'application/octet-stream')
		);
		expect(editorFrame('report.docx.bak')).toBe(retired);
		expect(editAction()).toBeUndefined();
		await vi.advanceTimersByTimeAsync(10_000);
		await tick();
		expect(editorFrame('report.docx.bak')).toBeNull();
		expect(previewFrame('report.docx.bak')).toBeNull();
		expect(document.querySelector('iframe[title="report.docx.bak"]')).toBeNull();
		expect(document.body.textContent).toContain('Office editor did not become ready');
		expect(editAction()).toBeUndefined();
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: retiredWindow,
				data: { type: 'ocu:office-ready', chat_id: chat }
			})
		);
		expect(sent).not.toHaveBeenCalled();
		expect(get(ocuOffice)[chat].generation).toBeGreaterThan(generation);
		vi.useRealTimers();
		namedButton('Retry').click();
		await tick();
		const retry = editorFrame('report.docx.bak');
		expect(retry).not.toBeNull();
		expect(retry).not.toBe(retired);
		expect(retry!.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=office`);
		expect(retry!.getAttribute('sandbox')).toBe(OFFICE_EDITOR_SANDBOX);
		expect(retry!.getAttribute('allow')).toBe(OFFICE_EDITOR_ALLOW);
		const { openMessage } = harness.handshake(retry!);
		expect(openMessage.file_id).toBe(officeDocx.file_id);
		expect(openMessage.generation).toBeGreaterThan(generation);
		expect(get(ocuOffice)[chat].fileId).toBe(officeDocx.file_id);
		expect(harness.officeRequests()).toEqual([]);
		expect(harness.launchRequests()).toEqual([]);
		namedButton('page.html').click();
		await tick();
		expect(editorFrame('report.docx.bak')).toBeNull();
		namedButton('report.docx.bak').click();
		await tick();
		expect(editAction()).toBeUndefined();
		expect(editorFrame('report.docx.bak')).toBeNull();
		expect(document.body.textContent).not.toContain('Office editor did not become ready');
	});

	it('does not let Retry admit a never-selected non-Office file', async () => {
		vi.useFakeTimers();
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		editAction()!.click();
		await tick();
		await vi.advanceTimersByTimeAsync(10_000);
		await tick();
		expect(document.body.textContent).toContain('Office editor did not become ready');
		vi.useRealTimers();
		namedButton('page.html').click();
		await tick();
		expect(editAction()).toBeUndefined();
		expect(document.body.textContent).not.toContain('Office editor did not become ready');
		expect(
			[...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Retry')
		).toBeUndefined();
		expect(editorFrame('page.html')).toBeNull();
		expect(harness.officeRequests()).toEqual([]);
		expect(harness.launchRequests()).toEqual([]);
	});
});
