// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { config } from '$lib/stores';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import { chat } from '../../../../test/ocu-workspace-fixtures';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	namedButton,
	officeConfig,
	officeDocx,
	previewFrame,
	reopenControl,
	saveControl
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();

function downloadLink() {
	return document.querySelector('[data-selected-bar] a[download]') as HTMLAnchorElement | null;
}

function officeCommand(data: unknown): data is {
	type: 'ocu:office-command';
	chat_id: string;
	generation: number;
	command: string;
} {
	return !!data && typeof data === 'object' && 'type' in data && data.type === 'ocu:office-command';
}

function commandCalls(sent: { mock: { calls: unknown[][] } }) {
	return sent.mock.calls.filter((call) => officeCommand(call[0]));
}

function postState(
	frame: HTMLIFrameElement,
	generation: number,
	extra: Record<string, unknown> = {}
) {
	window.dispatchEvent(
		new MessageEvent('message', {
			origin: window.location.origin,
			source: frame.contentWindow,
			data: {
				type: 'ocu:office-state',
				chat_id: chat,
				file_id: officeDocx.file_id,
				generation,
				session_id: 'sess-1',
				state: 'editing',
				dirty: false,
				workspace_changed: false,
				reason: null,
				...extra
			}
		})
	);
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
			postState(frame, openMessage.generation, step.extra);
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
		postState(frame, openMessage.generation, { dirty: true });
		await tick();
		expect(document.body.textContent).toContain('Unsaved');
		saveControl()!.click();
		await tick();
		expect(commandCalls(sent)).toHaveLength(1);
		expect(commandCalls(sent)[0][0]).toEqual({
			type: 'ocu:office-command',
			chat_id: chat,
			generation: openMessage.generation,
			command: 'save'
		});
		expect(commandCalls(sent)[0][1]).toBe(window.location.origin);
		expect(commandCalls(sent)[0][1]).not.toBe('*');
		expect(document.body.textContent).toContain('Unsaved');
		expect(document.body.textContent).not.toContain('Saving');
		postState(frame, openMessage.generation, { state: 'saving', dirty: true });
		await tick();
		expect(document.body.textContent).toContain('Saving');
		expect(document.body.textContent).not.toContain('Saved');
		postState(frame, openMessage.generation, { state: 'editing', dirty: false });
		await tick();
		expect(document.body.textContent).toContain('Saved');
		expect(harness.officeRequests()).toEqual([]);
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
			postState(frame, openMessage.generation, { dirty: true });
			await tick();
			saveControl()!.click();
			postState(frame, openMessage.generation, { state: 'saving', dirty: true });
			await tick();
			postState(frame, openMessage.generation, { state: outcome.state, reason: outcome.reason });
			await tick();
			expect(document.body.textContent).toContain(outcome.text);
			expect(document.body.textContent).not.toContain('Saved');
			expect(commandCalls(sent)).toHaveLength(1);
		}
	});

	it('ends saved and never unsaved on a second no-change save', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = await harness.acceptEditing(frame);
		await tick();
		expect(document.body.textContent).toContain('Saved');
		saveControl()!.click();
		await tick();
		expect(commandCalls(sent)).toHaveLength(1);
		expect(document.body.textContent).not.toContain('Unsaved');
		postState(frame, openMessage.generation, { state: 'saving', dirty: false });
		await tick();
		expect(document.body.textContent).toContain('Saving');
		expect(document.body.textContent).not.toContain('Unsaved');
		postState(frame, openMessage.generation, { state: 'editing', dirty: false });
		await tick();
		expect(document.body.textContent).toContain('Saved');
		expect(document.body.textContent).not.toContain('Unsaved');
	});

	it('shows a failed save with a non-null editing reason for both dirty values', async () => {
		const frame = await openEditor();
		const { openMessage } = await harness.acceptEditing(frame);
		for (const dirty of [true, false]) {
			postState(frame, openMessage.generation, {
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
			postState(frame, openMessage.generation, {
				state: 'refused',
				session_id: null,
				reason
			});
			await tick();
			expect(editorFrame('report.docx')).toBeNull();
			expect(previewFrame('report.docx')).not.toBeNull();
			expect(downloadLink()?.getAttribute('download')).toBe('report.docx');
			expect(document.body.textContent).toContain(message);
			expect(commandCalls(sent)).toHaveLength(0);
			expect(
				sent.mock.calls.some((call) => officeCommand(call[0]) && call[0].command === 'close')
			).toBe(false);
			expect(harness.officeRequests()).toEqual([]);
		}
	);

	it('keeps a refusal message on the selected file after frame removal and does not bleed it', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = harness.handshake(frame);
		postState(frame, openMessage.generation, {
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
		expect(commandCalls(sent)).toHaveLength(0);
		expect(harness.officeRequests()).toEqual([]);
		editAction()!.click();
		await tick();
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
			postState(frame, openMessage.generation, {
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
		postState(frame, openMessage.generation, { state: 'orphaned', reason: 'editor_lost' });
		await tick();
		expect(document.body.textContent).toContain('Expired');
		expect(editorFrame('report.docx')).toBe(frame);
		expect(saveControl()?.disabled).toBe(true);
		await harness.refreshReclassifiedListing(
			harness.reclassifiedFile('report.docx.bak', 'other', 'application/octet-stream')
		);
		expect(editorFrame('report.docx.bak')).toBe(frame);
		reopenControl()!.click();
		await tick();
		const next = editorFrame('report.docx.bak');
		expect(next).not.toBeNull();
		expect(next).not.toBe(frame);
		const handshake = harness.handshake(next!);
		expect(handshake.openMessage.file_id).toBe(officeDocx.file_id);
		expect(handshake.openMessage.generation).toBeGreaterThan(openMessage.generation);
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
					workspace_changed: false,
					reason: null
				}
			})
		);
		await tick();
		expect(get(ocuOffice)[chat].generation).toBe(handshake.openMessage.generation);
		expect(get(ocuOffice)[chat].state).toBeUndefined();
		expect(commandCalls(sent)).toHaveLength(0);
	});

	it('toggles the workspace-changed notice without changing Save and hides it on false, closed, and refused', async () => {
		const frame = await openEditor();
		const { sent, openMessage } = await harness.acceptEditing(frame);
		postState(frame, openMessage.generation, { dirty: true, workspace_changed: true });
		await tick();
		expect(document.body.textContent).toContain('Workspace file changed');
		expect(saveControl()?.disabled).toBe(false);
		postState(frame, openMessage.generation, { dirty: true, workspace_changed: false });
		await tick();
		expect(document.body.textContent).not.toContain('Workspace file changed');
		postState(frame, openMessage.generation, { dirty: true, workspace_changed: true });
		await tick();
		expect(document.body.textContent).toContain('Workspace file changed');
		postState(frame, openMessage.generation, { state: 'closed', workspace_changed: true });
		await tick();
		expect(editorFrame('report.docx')).toBeNull();
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(document.body.textContent).not.toContain('Workspace file changed');
		expect(commandCalls(sent)).toHaveLength(0);
		const again = await harness.selectAndEdit('report.docx');
		const next = harness.handshake(again);
		postState(again, next.openMessage.generation, {
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
		postState(frame, openMessage.generation, { state: 'closed' });
		await tick();
		expect(editorFrame('report.docx')).toBeNull();
		expect(previewFrame('report.docx')).not.toBeNull();
		expect(downloadLink()?.getAttribute('download')).toBe('report.docx');
		await tick();
		const preview = previewFrame('report.docx')!;
		const post = vi.spyOn(preview.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				source: preview.contentWindow,
				origin: window.location.origin,
				data: { type: 'ocu:preview-ready', chat_id: chat }
			})
		);
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
		expect(commandCalls(sent)).toHaveLength(0);
	});

	it.each(['office-flag', 'workspace-flag', 'selection', 'view'])(
		'hides the status bar on genuine %s revocation',
		async (cause) => {
			const frame = await openEditor();
			const { openMessage } = await harness.acceptEditing(frame);
			postState(frame, openMessage.generation, { dirty: true, workspace_changed: true });
			await tick();
			expect(document.body.textContent).toContain('Unsaved');
			if (cause === 'office-flag') config.set(officeConfig(false));
			else if (cause === 'workspace-flag') config.set(officeConfig(true, false));
			else if (cause === 'selection') namedButton('page.html').click();
			else
				ocuWorkspaces.update((states) => ({
					...states,
					[chat]: { ...states[chat], view: 'browser' }
				}));
			await tick();
			expect(editorFrame('report.docx')).toBeNull();
			expect(saveControl()).toBeUndefined();
			expect(document.body.textContent).not.toContain('Unsaved');
			expect(document.body.textContent).not.toContain('Workspace file changed');
		}
	);
});
