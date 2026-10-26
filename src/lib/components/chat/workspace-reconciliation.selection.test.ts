// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { ocuWorkspaces, setWorkspacePresentation } from '$lib/stores/ocu';
import { chat, file, listing } from '../../../../test/ocu-workspace-fixtures';
import { controller, fixture } from './workspace-reconciliation-test';

let stop: (() => void) | undefined;
const pageA = file('a.html');

beforeEach(() => ocuWorkspaces.set({}));
afterEach(() => {
	stop?.();
	stop = undefined;
	vi.useRealTimers();
	ocuWorkspaces.set({});
});

async function mounted() {
	vi.useFakeTimers();
	const transport = fixture();
	transport.api.list = async () => ({
		kind: 'listing',
		listing: listing([pageA], null, 1),
		etag: null
	});
	const owner = controller(transport.api);
	owner.observe(chat, true);
	stop = owner.mount();
	await vi.advanceTimersByTimeAsync(0);
	expect(get(ocuWorkspaces)[chat].phase).toBe('ready');
	return { transport, owner };
}

describe('clearing the workspace file selection', () => {
	it('clears the stored selection and notice, then writes selected_file_id null', async () => {
		const { transport, owner } = await mounted();
		await owner.selectFile(chat, pageA);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('a.html');
		const state = get(ocuWorkspaces)[chat];
		setWorkspacePresentation(chat, state.generation, { notice: 'Selected file was removed' });
		const before = transport.writes.length;
		await owner.clearSelection(chat);
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
		expect(get(ocuWorkspaces)[chat].notice).toBe('');
		expect(transport.writes.slice(before)).toEqual([
			{ chatId: chat, prefs: { view: 'files', open: true, selected_file_id: null } }
		]);
	});

	it('ignores a chat that is not the active workspace', async () => {
		const { transport, owner } = await mounted();
		await owner.selectFile(chat, pageA);
		const before = transport.writes.length;
		await owner.clearSelection('other-chat');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('a.html');
		expect(get(ocuWorkspaces)['other-chat']).toBeUndefined();
		expect(transport.writes).toHaveLength(before);
	});

	it('rejects when the preference write fails so the caller can report it', async () => {
		const { transport, owner } = await mounted();
		await owner.selectFile(chat, pageA);
		transport.api.prefs = async () => {
			throw new Error('prefs offline');
		};
		await expect(owner.clearSelection(chat)).rejects.toThrow('prefs offline');
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBeUndefined();
	});
});
