// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { config } from '$lib/stores';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import { chat } from '../../../../test/ocu-workspace-fixtures';
import { OFFICE_EDITOR_ALLOW, OFFICE_EDITOR_SANDBOX } from './office-editor-frame';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	isOfficeCommand,
	maximizeControl,
	namedButton,
	officeCommandCalls,
	officeConfig,
	officeDocx,
	overlayLayout,
	postOfficeState,
	previewFrame,
	restoreControl,
	reopenControl,
	readyEditorFrame,
	saveControl,
	selectedFileSurface
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();

function downloadLink() {
	return document.querySelector('[data-selected-bar] a[download]') as HTMLAnchorElement | null;
}

async function openEditor() {
	await harness.open();
	await harness.ready('report.docx');
	return harness.selectAndEdit('report.docx');
}

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

describe('Office editor status bar', () => {
	it('shows no invented status before the first valid state and disables Save', async () => {
		const frame = await openEditor();
		expect(frame).not.toBeNull();
		expect(document.body.textContent).not.toContain('Opening');
		expect(document.body.textContent).not.toContain('Unsaved');
		expect(document.body.textContent).not.toContain('Saving');
		expect(document.body.textContent).not.toContain('Saved');
		expect(saveControl()?.disabled).toBe(true);
		expect(get(ocuOffice)[chat].state).toBeUndefined();
	});

	it('shows distinct localised text for each reported state and enables Save only while editing', async () => {
		const frame = await openEditor();
		const { openMessage } = harness.handshake(frame);
		const seen: string[] = [];
		const steps: Array<{ extra: Record<string, unknown>; text: string; enabled: boolean }> = [
			{ extra: { state: 'opening' }, text: 'Opening', enabled: false },
			{ extra: { state: 'editing', dirty: true }, text: 'Unsaved', enabled: true },
			{ extra: { state: 'saving' }, text: 'Saving', enabled: false },
			{ extra: { state: 'editing', dirty: false }, text: 'Saved', enabled: true },
			{
				extra: { state: 'conflict', reason: 'workspace_changed' },
				text: 'Conflict',
				enabled: false
			},
			{ extra: { state: 'error', reason: 'save_failed' }, text: 'Failed', enabled: false },
			{ extra: { state: 'orphaned', reason: 'editor_lost' }, text: 'Expired', enabled: false },
			{
				extra: { state: 'refused', session_id: null, reason: 'unsupported_type' },
				text: 'This file type cannot be edited',
				enabled: false
			}
		];
		for (const step of steps) {
			postOfficeState(frame, openMessage.generation, step.extra);
			await tick();
			expect(document.body.textContent).toContain(step.text);
			if (step.text === 'This file type cannot be edited') {
				expect(saveControl()).toBeUndefined();
			} else {
				expect(saveControl()?.disabled).toBe(!step.enabled);
			}
			seen.push(step.text);
		}
		expect(new Set(seen).size).toBe(seen.length);
	});

	it('posts one origin-targeted save and waits for reported saving then saved', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = await harness.acceptEditing(frame);
		postOfficeState(frame, openMessage.generation, { dirty: true });
		await tick();
		expect(document.body.textContent).toContain('Unsaved');
		saveControl()!.click();
		await tick();
		expect(officeCommandCalls(sent)).toHaveLength(1);
		expect(officeCommandCalls(sent)[0][0]).toEqual({
			type: 'ocu:office-command',
			chat_id: chat,
			generation: openMessage.generation,
			command: 'save'
		});
		expect(officeCommandCalls(sent)[0][1]).toBe(window.location.origin);
		expect(officeCommandCalls(sent)[0][1]).not.toBe('*');
		expect(document.body.textContent).toContain('Unsaved');
		expect(document.body.textContent).not.toContain('Saving');
		postOfficeState(frame, openMessage.generation, { state: 'saving', dirty: true });
		await tick();
		expect(document.body.textContent).toContain('Saving');
		expect(document.body.textContent).not.toContain('Saved');
		postOfficeState(frame, openMessage.generation, { state: 'editing', dirty: false });
		await tick();
		expect(document.body.textContent).toContain('Saved');
		expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
			['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
		]);
	});

	it('never shows Saved when a save ends in error or conflict', async () => {
		for (const outcome of [
			{ state: 'error', reason: 'save_failed', text: 'Failed' },
			{ state: 'conflict', reason: 'workspace_changed', text: 'Conflict' }
		]) {
			await harness.cleanup();
			harness.install();
			const frame = await openEditor();
			const { sent, openMessage } = await harness.acceptEditing(frame);
			postOfficeState(frame, openMessage.generation, { dirty: true });
			await tick();
			saveControl()!.click();
			postOfficeState(frame, openMessage.generation, { state: 'saving', dirty: true });
			await tick();
			postOfficeState(frame, openMessage.generation, {
				state: outcome.state,
				reason: outcome.reason
			});
			await tick();
			expect(document.body.textContent).toContain(outcome.text);
			expect(document.body.textContent).not.toContain('Saved');
			expect(officeCommandCalls(sent)).toHaveLength(1);
		}
	});

	it('ends saved and never unsaved on a second no-change save', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = await harness.acceptEditing(frame);
		await tick();
		expect(document.body.textContent).toContain('Saved');
		saveControl()!.click();
		await tick();
		expect(officeCommandCalls(sent)).toHaveLength(1);
		expect(document.body.textContent).not.toContain('Unsaved');
		postOfficeState(frame, openMessage.generation, { state: 'saving', dirty: false });
		await tick();
		expect(document.body.textContent).toContain('Saving');
		expect(document.body.textContent).not.toContain('Unsaved');
		postOfficeState(frame, openMessage.generation, { state: 'editing', dirty: false });
		await tick();
		expect(document.body.textContent).toContain('Saved');
		expect(document.body.textContent).not.toContain('Unsaved');
	});

	it('shows a failed save with a non-null editing reason for both dirty values', async () => {
		const frame = await openEditor();
		const { openMessage } = await harness.acceptEditing(frame);
		for (const dirty of [true, false]) {
			postOfficeState(frame, openMessage.generation, {
				state: 'editing',
				dirty,
				reason: 'save_timeout'
			});
			await tick();
			expect(document.body.textContent).toContain('Failed: save_timeout');
			expect(document.body.textContent).not.toContain('Saved');
			expect(saveControl()?.disabled).toBe(false);
		}
	});

	it.each([
		['unsupported_type', 'This file type cannot be edited'],
		['file_too_large', 'This file is too large to edit'],
		['corrupt_document', 'This document is corrupt and cannot be edited'],
		['unknown_file', 'This file is no longer available to edit'],
		['storage_low', 'Not enough storage to open this file for editing']
	] as const)(
		'retires the editor on %s, keeps preview and download, and never posts close',
		async (reason, message) => {
			const frame = await openEditor();
			const { sent, openMessage } = harness.handshake(frame);
			maximizeControl()!.click();
			await tick();
			postOfficeState(frame, openMessage.generation, {
				state: 'refused',
				session_id: null,
				reason
			});
			await tick();
			expect(editorFrame('report.docx')).toBeNull();
			expect(overlayLayout()).toBe(false);
			expect(previewFrame('report.docx')).not.toBeNull();
			expect(downloadLink()?.getAttribute('download')).toBe('report.docx');
			expect(document.body.textContent).toContain(message);
			expect(officeCommandCalls(sent)).toHaveLength(0);
			expect(
				sent.mock.calls.some((call) => isOfficeCommand(call[0]) && call[0].command === 'close')
			).toBe(false);
			expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
				['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
			]);
		}
	);

	it('keeps a refusal message on the selected file after frame removal and does not bleed it', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = harness.handshake(frame);
		postOfficeState(frame, openMessage.generation, {
			state: 'refused',
			session_id: null,
			reason: 'unsupported_type'
		});
		await tick();
		expect(document.body.textContent).toContain('This file type cannot be edited');
		expect(editorFrame('report.docx')).toBeNull();
		namedButton('page.html').click();
		await tick();
		expect(document.body.textContent).not.toContain('This file type cannot be edited');
		namedButton('report.docx').click();
		await tick();
		expect(document.body.textContent).toContain('This file type cannot be edited');
		expect(editorFrame('report.docx')).toBeNull();
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(officeCommandCalls(sent)).toHaveLength(0);
		expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
			['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
		]);
		editAction()!.click();
		await readyEditorFrame('report.docx');
		expect(editorFrame('report.docx')).not.toBeNull();
		expect(document.body.textContent).not.toContain('This file type cannot be edited');
		expect(get(ocuOffice)[chat].state).toBeUndefined();
	});

	it('falls back to a localized literal for unknown and prototype-like refusal reasons', async () => {
		for (const reason of ['constructor', '__proto__', 'mystery_reason']) {
			await harness.cleanup();
			harness.install();
			const frame = await openEditor();
			const { openMessage } = harness.handshake(frame);
			postOfficeState(frame, openMessage.generation, {
				state: 'refused',
				session_id: null,
				reason
			});
			await tick();
			expect(document.body.textContent).toContain(`Editing was refused: ${reason}`);
			expect(editorFrame('report.docx')).toBeNull();
			expect(previewFrame('report.docx')).not.toBeNull();
		}
	});

	it('reopens an expired editor with a fresh frame and higher generation after reclassification', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = await harness.acceptEditing(frame);
		postOfficeState(frame, openMessage.generation, { state: 'orphaned', reason: 'editor_lost' });
		await tick();
		expect(document.body.textContent).toContain('Expired');
		expect(editorFrame('report.docx')).toBe(frame);
		expect(saveControl()?.disabled).toBe(true);
		await harness.refreshReclassifiedListing(
			harness.reclassifiedFile('report.docx.bak', 'other', 'application/octet-stream')
		);
		expect(editorFrame('report.docx.bak')).toBe(frame);
		reopenControl()!.click();
		await readyEditorFrame('report.docx.bak');
		const next = editorFrame('report.docx.bak');
		expect(next).not.toBeNull();
		expect(next).not.toBe(frame);
		const handshake = harness.handshake(next!);
		expect(handshake.openMessage.file_id).toBe(officeDocx.file_id);
		expect(handshake.openMessage.generation).toBeGreaterThan(openMessage.generation);
		postOfficeState(frame, openMessage.generation, { dirty: true });
		await tick();
		expect(get(ocuOffice)[chat].generation).toBe(handshake.openMessage.generation);
		expect(get(ocuOffice)[chat].state).toBeUndefined();
		expect(officeCommandCalls(sent)).toHaveLength(0);
	});

	it('toggles the workspace-changed notice without changing Save and hides it on false, closed, and refused', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = await harness.acceptEditing(frame);
		postOfficeState(frame, openMessage.generation, { dirty: true, workspace_changed: true });
		await tick();
		expect(document.body.textContent).toContain('Workspace file changed');
		expect(saveControl()?.disabled).toBe(false);
		postOfficeState(frame, openMessage.generation, { dirty: true, workspace_changed: false });
		await tick();
		expect(document.body.textContent).not.toContain('Workspace file changed');
		postOfficeState(frame, openMessage.generation, { dirty: true, workspace_changed: true });
		await tick();
		expect(document.body.textContent).toContain('Workspace file changed');
		postOfficeState(frame, openMessage.generation, { state: 'closed', workspace_changed: true });
		await tick();
		expect(editorFrame('report.docx')).toBeNull();
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(document.body.textContent).not.toContain('Workspace file changed');
		expect(officeCommandCalls(sent)).toHaveLength(0);
		const again = await harness.selectAndEdit('report.docx');
		const next = harness.handshake(again);
		postOfficeState(again, next.openMessage.generation, {
			state: 'refused',
			session_id: null,
			reason: 'unsupported_type',
			workspace_changed: true
		});
		await tick();
		expect(document.body.textContent).not.toContain('Workspace file changed');
		expect(document.body.textContent).toContain('This file type cannot be edited');
	});

	it('returns to the read-only preview after a reported closed state', async () => {
		const frame = await openEditor();
		const { openMessage } = await harness.acceptEditing(frame);
		maximizeControl()!.click();
		await tick();
		postOfficeState(frame, openMessage.generation, { state: 'closed' });
		await tick();
		expect(editorFrame('report.docx')).toBeNull();
		expect(overlayLayout()).toBe(false);
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(downloadLink()?.getAttribute('download')).toBe('report.docx');
		await tick();
		const preview = previewFrame('report.docx')!;
		const post = harness.previewHandshake(preview);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][0]).toMatchObject({
			type: 'ocu:preview-select',
			file_id: 'report.docx'
		});
	});

	it('leaves the visible bar unchanged when a message fails parent validation', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = await harness.acceptEditing(frame);
		await tick();
		expect(document.body.textContent).toContain('Saved');
		const snapshot = get(ocuOffice);
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
					state: 'editing',
					dirty: true,
					workspace_changed: true,
					reason: null,
					extra: true
				}
			})
		);
		await tick();
		expect(get(ocuOffice)).toBe(snapshot);
		expect(document.body.textContent).toContain('Saved');
		expect(document.body.textContent).not.toContain('Unsaved');
		expect(officeCommandCalls(sent)).toHaveLength(0);
	});

	it.each([
		['office-flag', false],
		['workspace-flag', false],
		['office-flag', true],
		['workspace-flag', true],
		['selection', true],
		['view', true],
		['selection-removed', true],
		['unmount', true]
	] as const)(
		'hides the status bar on genuine %s revocation (maximized: %s)',
		async (cause, maximized) => {
			const frame = await openEditor();
			const oldWindow = frame.contentWindow;
			const { sent, openMessage } = await harness.acceptEditing(frame);
			postOfficeState(frame, openMessage.generation, { dirty: true, workspace_changed: true });
			await tick();
			expect(document.body.textContent).toContain('Unsaved');
			if (maximized) {
				maximizeControl()!.click();
				await tick();
				expect(overlayLayout()).toBe(true);
			}
			if (cause === 'office-flag') config.set(officeConfig(false));
			else if (cause === 'workspace-flag') config.set(officeConfig(true, false));
			else if (cause === 'selection') namedButton('page.html').click();
			else if (cause === 'selection-removed')
				ocuWorkspaces.update((states) => ({
					...states,
					[chat]: { ...states[chat], selectedFileId: undefined }
				}));
			else if (cause === 'unmount') {
				await unmount(harness.component!);
				harness.component = undefined;
			} else
				ocuWorkspaces.update((states) => ({
					...states,
					[chat]: { ...states[chat], view: 'browser' }
				}));
			await tick();
			expect(editorFrame('report.docx')).toBeNull();
			expect(saveControl()).toBeUndefined();
			expect(overlayLayout()).toBe(false);
			expect(selectedFileSurface()?.hasAttribute('popover') ?? false).toBe(false);
			expect(document.body.textContent).not.toContain('Unsaved');
			expect(document.body.textContent).not.toContain('Workspace file changed');
			const retired = get(ocuOffice);
			expect(retired[chat].generation).toBeGreaterThan(openMessage.generation);
			postOfficeState(frame, openMessage.generation, { dirty: true }, oldWindow);
			expect(get(ocuOffice)).toBe(retired);
			expect(officeCommandCalls(sent)).toHaveLength(0);
			if (cause === 'office-flag' || cause === 'workspace-flag') {
				expect(previewFrame('report.docx')).not.toBeNull();
				expect(downloadLink()?.getAttribute('download')).toBe('report.docx');
				config.set(officeConfig(true));
				await tick();
				expect(editorFrame('report.docx')).toBeNull();
				expect(saveControl()).toBeUndefined();
				expect(overlayLayout()).toBe(false);
				expect(previewFrame('report.docx')).not.toBeNull();
				expect(get(ocuOffice)).toBe(retired);
			}
		}
	);

	it('keeps the same editor frame across maximize, overlay Save, and restore', async () => {
		const requestFullscreen = vi.fn();
		const exitFullscreen = vi.fn();
		const targets = [
			[HTMLElement.prototype, 'requestFullscreen'],
			[document, 'exitFullscreen']
		] as const;
		const descriptors = targets.map(([target, key]) =>
			Object.getOwnPropertyDescriptor(target, key)
		);
		try {
			Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
				configurable: true,
				value: requestFullscreen
			});
			Object.defineProperty(document, 'exitFullscreen', {
				configurable: true,
				value: exitFullscreen
			});
			const frame = await openEditor();
			const { sent, openMessage } = await harness.acceptEditing(frame);
			expect(frame.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=office`);
			expect(frame.getAttribute('sandbox')).toBe(OFFICE_EDITOR_SANDBOX);
			expect(frame.getAttribute('allow')).toBe(OFFICE_EDITOR_ALLOW);
			maximizeControl()!.click();
			await tick();
			expect(editorFrame('report.docx')).toBe(frame);
			expect(overlayLayout()).toBe(true);
			expect(selectedFileSurface()?.getAttribute('popover')).toBe('manual');
			expect(restoreControl()).toBeDefined();
			postOfficeState(frame, openMessage.generation, { dirty: true });
			await tick();
			saveControl()!.click();
			await tick();
			expect(officeCommandCalls(sent)[0][0]).toEqual({
				type: 'ocu:office-command',
				chat_id: chat,
				generation: openMessage.generation,
				command: 'save'
			});
			restoreControl()!.click();
			await tick();
			expect(editorFrame('report.docx')).toBe(frame);
			expect(overlayLayout()).toBe(false);
			expect(selectedFileSurface()?.hasAttribute('popover')).toBe(false);
			expect(maximizeControl()).toBeDefined();
			expect(
				sent.mock.calls.filter(([message]) => message?.type === 'ocu:office-open')
			).toHaveLength(1);
			expect(officeCommandCalls(sent)).toHaveLength(1);
			expect(requestFullscreen).not.toHaveBeenCalled();
			expect(exitFullscreen).not.toHaveBeenCalled();
			expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
				['GET', `/ocu/api/office/${chat}/documents/report.docx/versions`]
			]);
		} finally {
			targets.forEach(([target, key], index) => {
				const descriptor = descriptors[index];
				if (descriptor) Object.defineProperty(target, key, descriptor);
				else Reflect.deleteProperty(target, key);
			});
		}
	});

	it('clears maximized layout on ready timeout and Open again', async () => {
		vi.useFakeTimers();
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		editAction()!.click();
		await readyEditorFrame('report.docx');
		maximizeControl()!.click();
		await tick();
		await vi.advanceTimersByTimeAsync(10_000);
		await tick();
		expect(overlayLayout()).toBe(false);
		vi.useRealTimers();
		namedButton('Retry').click();
		await readyEditorFrame('report.docx');
		expect(overlayLayout()).toBe(false);
		const frame = editorFrame('report.docx')!;
		const { openMessage } = await harness.acceptEditing(frame);
		maximizeControl()!.click();
		await tick();
		postOfficeState(frame, openMessage.generation, { state: 'orphaned', reason: 'editor_lost' });
		await tick();
		namedButton('Open again').click();
		await readyEditorFrame('report.docx');
		expect(editorFrame('report.docx')).not.toBe(frame);
		expect(overlayLayout()).toBe(false);
		expect(maximizeControl()).toBeDefined();
	});
});
