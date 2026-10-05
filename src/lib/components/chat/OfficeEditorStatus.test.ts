// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import type { OcuOfficeState } from '$lib/stores/ocu-office';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import OfficeEditorStatus from './OfficeEditorStatus.svelte';
import { reopenControl, saveControl } from './workspace-artifact-office-test';

const session = (extra: Partial<OcuOfficeState> = {}): OcuOfficeState => ({
	generation: 1,
	fileId: 'report.docx',
	sessionId: 'sess-1',
	state: 'editing',
	reason: null,
	dirty: false,
	workspaceChanged: false,
	savedAs: null,
	...extra
});

async function render(props: {
	session: OcuOfficeState | undefined;
	live: boolean;
	onSave?: () => void;
	onReopen?: () => void;
}) {
	const component = mount(OfficeEditorStatus, {
		target: document.body,
		props: { onSave: () => {}, onReopen: () => {}, ...props },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await tick();
	return component;
}

describe('Office editor status projection', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('shows no invented status text before the first accepted state', async () => {
		const component = await render({
			session: session({ state: undefined, sessionId: undefined }),
			live: true
		});
		expect(document.body.textContent).not.toContain('Opening');
		expect(document.body.textContent).not.toContain('Unsaved');
		expect(document.body.textContent).not.toContain('Saving');
		expect(document.body.textContent).not.toContain('Saved');
		expect(saveControl()?.disabled).toBe(true);
		await unmount(component);
	});

	it('maps each accepted state to distinct text and enables Save only while editing', async () => {
		const component = await render({ session: session({ state: 'opening' }), live: true });
		const texts: string[] = [];
		const report = (expected: string, enabled: boolean) => {
			expect(document.body.textContent).toContain(expected);
			expect(saveControl()?.disabled).toBe(!enabled);
			texts.push(expected);
		};
		report('Opening', false);
		await unmount(component);
		const next = async (extra: Partial<OcuOfficeState>, expected: string, enabled: boolean) => {
			const mounted = await render({ session: session(extra), live: true });
			report(expected, enabled);
			await unmount(mounted);
		};
		await next({ state: 'editing', dirty: true }, 'Unsaved', true);
		await next({ state: 'saving', dirty: true }, 'Saving', false);
		await next({ state: 'editing', dirty: false }, 'Saved', true);
		await next({ state: 'conflict', reason: 'workspace_changed' }, 'Conflict', false);
		await next({ state: 'error', reason: 'save_failed' }, 'Failed', false);
		await next({ state: 'orphaned', reason: 'editor_lost' }, 'Expired', false);
		expect(new Set(texts).size).toBe(texts.length);
	});

	it('lets a non-null editing reason win over both dirty values and keeps Save enabled', async () => {
		for (const dirty of [true, false]) {
			const component = await render({
				session: session({ state: 'editing', dirty, reason: 'save_timeout' }),
				live: true
			});
			expect(document.body.textContent).toContain('Failed: save_timeout');
			expect(document.body.textContent).not.toContain('Saved');
			expect(document.body.textContent).not.toContain('Unsaved');
			expect(saveControl()?.disabled).toBe(false);
			await unmount(component);
		}
	});

	it('shows Saving for closing even when dirty is false', async () => {
		const component = await render({
			session: session({ state: 'closing', dirty: false }),
			live: true
		});
		expect(document.body.textContent).toContain('Saving');
		expect(saveControl()?.disabled).toBe(true);
		await unmount(component);
	});

	it('shows an explicit refused message and no Save while live, then only the message after retirement', async () => {
		const live = await render({
			session: session({
				state: 'refused',
				sessionId: undefined,
				reason: 'unsupported_type',
				dirty: false
			}),
			live: true
		});
		expect(document.body.textContent).toContain('This file type cannot be edited');
		expect(saveControl()).toBeUndefined();
		expect(reopenControl()).toBeUndefined();
		await unmount(live);
		const retired = await render({
			session: session({
				state: 'refused',
				sessionId: undefined,
				reason: 'unsupported_type'
			}),
			live: false
		});
		expect(document.body.textContent).toContain('This file type cannot be edited');
		expect(saveControl()).toBeUndefined();
		expect(reopenControl()).toBeUndefined();
		expect(document.body.textContent).not.toContain('Workspace file changed');
		await unmount(retired);
	});

	it.each([
		['unsupported_type', 'This file type cannot be edited'],
		['file_too_large', 'This file is too large to edit'],
		['corrupt_document', 'This document is corrupt and cannot be edited'],
		['unknown_file', 'This file is no longer available to edit'],
		['storage_low', 'Not enough storage to open this file for editing']
	] as const)('shows an explicit message for %s', async (reason, message) => {
		const component = await render({
			session: session({ state: 'refused', sessionId: undefined, reason }),
			live: false
		});
		expect(document.body.textContent).toContain(message);
		await unmount(component);
	});

	it.each(['unsafe_path', 'unpublished_version', 'constructor', '__proto__'] as const)(
		'falls back to a localized literal for %s without prototype lookup',
		async (reason) => {
			const component = await render({
				session: session({ state: 'refused', sessionId: undefined, reason }),
				live: false
			});
			expect(document.body.textContent).toContain(`Editing was refused: ${reason}`);
			expect(document.body.textContent).not.toContain('[object Object]');
			await unmount(component);
		}
	);

	it('offers Open again while expired and live', async () => {
		const onReopen = vi.fn();
		const component = await render({
			session: session({ state: 'orphaned', reason: 'editor_lost' }),
			live: true,
			onReopen
		});
		expect(document.body.textContent).toContain('Expired');
		expect(reopenControl()).toBeDefined();
		reopenControl()!.click();
		expect(onReopen).toHaveBeenCalledTimes(1);
		expect(saveControl()?.disabled).toBe(true);
		await unmount(component);
	});

	it('shows the workspace-changed notice only while live and true, without changing Save', async () => {
		const onSave = vi.fn();
		const shown = await render({
			session: session({ state: 'editing', dirty: true, workspaceChanged: true }),
			live: true,
			onSave
		});
		expect(document.body.textContent).toContain('Workspace file changed');
		expect(saveControl()?.disabled).toBe(false);
		saveControl()!.click();
		expect(onSave).toHaveBeenCalledTimes(1);
		await unmount(shown);
		const hidden = await render({
			session: session({ state: 'editing', dirty: true, workspaceChanged: false }),
			live: true
		});
		expect(document.body.textContent).not.toContain('Workspace file changed');
		expect(saveControl()?.disabled).toBe(false);
		await unmount(hidden);
	});

	it('hides the notice after refused retirement even when workspace_changed remains true', async () => {
		const component = await render({
			session: session({
				state: 'refused',
				reason: 'unsupported_type',
				workspaceChanged: true,
				sessionId: undefined
			}),
			live: false
		});
		expect(document.body.textContent).not.toContain('Workspace file changed');
		await unmount(component);
	});
});
