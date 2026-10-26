// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { chat, file } from '../../../../test/ocu-workspace-fixtures';
import {
	editAction,
	editorFrame,
	expectOfficeCloseHeld,
	htmlFile,
	maximizeControl,
	namedButton,
	officeCommandCalls,
	officeDocx,
	overlayLayout,
	postOfficeState,
	readyEditorFrame,
	selectedFileSurface
} from './workspace-artifact-office-test';
import { officeLeaveSnapshot } from './office-leave-guard';
import { createOfficeGuardTestHarness, deliver, status } from './office-leave-guard-test';

const { harness, holdStatus } = createOfficeGuardTestHarness();
const otherFile = file('other.html');

const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const tabNames = () => tabs().map((node) => node.textContent?.trim());
const tab = (name: string) => tabs().find((node) => node.textContent?.trim() === name)!;
const closeTab = (name: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('button')].find(
		(node) =>
			node.getAttribute('aria-label') === 'Close tab' &&
			node.getAttribute('aria-describedby') === tab(name).id
	)!;
const selectedId = () => get(ocuWorkspaces)[chat].selectedFileId;

// Tabs page.html, report.docx (dirty editor, active), other.html.
async function openEditorBetweenTabs() {
	harness.setListing([officeDocx, htmlFile, otherFile]);
	await harness.open();
	await harness.ready('report.docx');
	for (const name of ['page.html', 'report.docx', 'other.html']) {
		namedButton(name).click();
		await vi.waitFor(() => expect(selectedId()).toBe(name));
	}
	tab('report.docx').click();
	await vi.waitFor(() => expect(selectedId()).toBe('report.docx'));
	await tick();
	editAction()!.click();
	const frame = await readyEditorFrame('report.docx');
	const originalWindow = frame.contentWindow;
	const handshake = await harness.acceptEditing(frame);
	postOfficeState(frame, handshake.openMessage.generation, { dirty: true });
	await tick();
	expect(tabNames()).toEqual(['page.html', 'report.docx', 'other.html']);
	return { frame, originalWindow, ...handshake };
}

describe('Office editor tabs', () => {
	it('switches away from the editor tab only after a departure that ends in a failed save', async () => {
		const notified = vi.spyOn(toast, 'message');
		const { frame, originalWindow, sent, openMessage } = await openEditorBetweenTabs();
		const held = holdStatus();
		tab('page.html').click();
		await tick();
		expectOfficeCloseHeld(frame, originalWindow, sent, openMessage.generation);
		expect(selectedId()).toBe('report.docx');
		await deliver(held, status('error', { reason: 'disk_full_literal' }));
		await vi.waitFor(() => expect(selectedId()).toBe('page.html'));
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('failed');
		expect(notified).toHaveBeenCalledWith(
			'Office save failed for report.docx: disk_full_literal',
			expect.anything()
		);
		expect(editorFrame('report.docx')).toBeNull();
		expect(tabNames()).toEqual(['page.html', 'report.docx', 'other.html']);
		await vi.waitFor(() =>
			expect(tabs().find((node) => node.getAttribute('aria-selected') === 'true')).toBe(
				tab('page.html')
			)
		);
	});

	it('closes the editor tab after a departure that ends in a failed save and activates its right neighbour', async () => {
		const { frame, originalWindow, sent, openMessage } = await openEditorBetweenTabs();
		const held = holdStatus();
		closeTab('report.docx').click();
		await tick();
		expectOfficeCloseHeld(frame, originalWindow, sent, openMessage.generation);
		expect(tabNames()).toEqual(['page.html', 'report.docx', 'other.html']);
		await deliver(held, status('error', { reason: 'disk_full_literal' }));
		await vi.waitFor(() => expect(selectedId()).toBe('other.html'));
		expect(tabNames()).toEqual(['page.html', 'other.html']);
		expect(get(officeLeaveSnapshot).reports[chat].outcome).toBe('failed');
		expect(editorFrame('report.docx')).toBeNull();
	});

	it('drops a pending close when activating another tab supersedes it', async () => {
		const { sent } = await openEditorBetweenTabs();
		const held = holdStatus();
		closeTab('report.docx').click();
		await tick();
		tab('page.html').click();
		await tick();
		await deliver(held, status('closing'));
		await vi.waitFor(() => expect(selectedId()).toBe('page.html'));
		await tick();
		expect(tabNames()).toEqual(['page.html', 'report.docx', 'other.html']);
		expect(officeCommandCalls(sent)).toHaveLength(1);
	});

	it('keeps the tab and selection when Close editor cancels a pending close', async () => {
		const { sent } = await openEditorBetweenTabs();
		const held = holdStatus();
		closeTab('report.docx').click();
		await tick();
		namedButton('Close editor').click();
		await tick();
		await deliver(held, status('closing'));
		await vi.waitFor(() => expect(editorFrame('report.docx')).toBeNull());
		await tick();
		expect(selectedId()).toBe('report.docx');
		expect(tabNames()).toEqual(['page.html', 'report.docx', 'other.html']);
		expect(officeCommandCalls(sent)).toHaveLength(1);
	});

	it('closes an inactive tab without touching the open editor', async () => {
		const { frame, sent } = await openEditorBetweenTabs();
		closeTab('other.html').click();
		await tick();
		expect(tabNames()).toEqual(['page.html', 'report.docx']);
		expect(editorFrame('report.docx')).toBe(frame);
		expect(officeCommandCalls(sent)).toEqual([]);
		expect(selectedId()).toBe('report.docx');
	});

	it('maximizes only the selected region, not the tab bar', async () => {
		await openEditorBetweenTabs();
		maximizeControl()!.click();
		await tick();
		expect(overlayLayout()).toBe(true);
		const surface = selectedFileSurface()!;
		expect(surface.contains(document.querySelector('[role="tablist"]'))).toBe(false);
		expect(surface.contains(editorFrame('report.docx'))).toBe(true);
	});
});
