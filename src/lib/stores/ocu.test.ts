import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

import {
	applyDescribe,
	applyRevision,
	applyWorkspaceListing,
	beginGeneration,
	closeWorkspacePanel,
	markDirty,
	ocuWorkspaces,
	openWorkspacePanel,
	retireGeneration,
	queueWorkspacePrefs,
	selectWorkspaceView
} from './ocu';

const file = (chatId: string, revision: number) => ({
	file_id: `file-${revision}`,
	name: `file-${revision}.txt`,
	path: `file-${revision}.txt`,
	url: `/ocu/files/${chatId}/file-${revision}.txt`,
	type: 'text',
	mime: 'text/plain',
	size: 1,
	revision
});

describe('ocu workspace store', () => {
	beforeEach(() => {
		ocuWorkspaces.set({});
	});

	it('drops a late describe so it does not paint the other chat', () => {
		const genA = beginGeneration('A');
		const genB = beginGeneration('B');
		applyDescribe('B', genB, { status: 'running', view: 'files' });
		const bBefore = get(ocuWorkspaces)['B'];

		applyDescribe('A', genA, {
			status: 'stopped',
			view: 'terminal',
			selectedFileId: 'file-from-a'
		});
		expect(get(ocuWorkspaces)['B']).toEqual(bBefore);
		expect(get(ocuWorkspaces)['B']?.status).toBe('running');
		expect(get(ocuWorkspaces)['B']?.view).toBe('files');
		expect(get(ocuWorkspaces)['B']?.selectedFileId).toBeUndefined();

		const genA2 = beginGeneration('A');
		applyDescribe('A', genA2, { status: 'running' });
		applyDescribe('A', genA, { status: 'stopped', view: 'terminal' });
		expect(get(ocuWorkspaces)['A']?.status).toBe('running');
		expect(get(ocuWorkspaces)['B']).toEqual(bBefore);
	});

	it('marks dirty per chat', () => {
		beginGeneration('A');
		beginGeneration('B');
		markDirty('A');
		expect(get(ocuWorkspaces)['A']?.dirty).toBe(true);
		expect(get(ocuWorkspaces)['B']?.dirty).toBe(false);
		markDirty('B');
		expect(get(ocuWorkspaces)['A']?.dirty).toBe(true);
		expect(get(ocuWorkspaces)['B']?.dirty).toBe(true);
	});

	it('keeps the higher revision when 7 arrives after 9', () => {
		applyRevision('A', 9);
		applyRevision('A', 7);
		expect(get(ocuWorkspaces)['A']?.revision).toBe(9);
	});

	it('auto-opens once per chat, retains a user close across accepted revisions, and acknowledges on explicit open', () => {
		const a = beginGeneration('A');
		beginGeneration('B');
		applyWorkspaceListing('A', a, [file('A', 1)], 1, null);
		expect(get(ocuWorkspaces).A).toMatchObject({
			open: true,
			autoOpened: true,
			userClosed: false,
			acknowledgedRevision: 1
		});
		closeWorkspacePanel('A');
		applyWorkspaceListing('A', a, [file('A', 2)], 2, null);
		expect(get(ocuWorkspaces).A).toMatchObject({
			open: false,
			userClosed: true,
			revision: 2,
			acknowledgedRevision: 1,
			dirty: false
		});
		expect(get(ocuWorkspaces).B).toMatchObject({ open: false, view: 'files' });
		openWorkspacePanel('A');
		selectWorkspaceView('A', 'browser');
		expect(get(ocuWorkspaces).A).toMatchObject({
			open: true,
			userClosed: false,
			acknowledgedRevision: 2,
			view: 'browser'
		});
		expect(get(ocuWorkspaces).B.view).toBe('files');
	});

	it('rejects an obsolete listing before and after a newer generation is accepted', () => {
		const oldA = beginGeneration('A');
		const b = beginGeneration('B');
		const currentA = retireGeneration('A');
		applyWorkspaceListing('B', b, [file('B', 4)], 4, null);

		applyWorkspaceListing('A', oldA, [file('A', 99)], 99, 'obsolete');
		expect(get(ocuWorkspaces).A).toMatchObject({
			files: [],
			revision: 0,
			open: false,
			autoOpened: false,
			acknowledgedRevision: 0
		});

		applyWorkspaceListing('A', currentA, [file('A', 1)], 1, null);
		expect(get(ocuWorkspaces).A).toMatchObject({
			files: [file('A', 1)],
			open: true,
			autoOpened: true,
			acknowledgedRevision: 1
		});
		closeWorkspacePanel('A');
		applyWorkspaceListing('A', currentA, [file('A', 2)], 2, null);
		applyWorkspaceListing('A', oldA, [file('A', 99)], 99, 'obsolete');

		expect(get(ocuWorkspaces).A).toMatchObject({
			files: [file('A', 2)],
			revision: 2,
			listingRevision: 2,
			open: false,
			userClosed: true,
			autoOpened: true,
			acknowledgedRevision: 1
		});
		expect(get(ocuWorkspaces).B).toMatchObject({
			files: [file('B', 4)],
			revision: 4,
			open: true,
			userClosed: false,
			autoOpened: true,
			acknowledgedRevision: 4
		});
	});

	it('orders a remounted chat preference clear after an older failed write', async () => {
		const stored: Array<string | null> = [];
		let finishOld: () => void = () => {};
		let markStarted: () => void = () => {};
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const oldWrite = queueWorkspacePrefs('same-chat', () => {
			markStarted();
			return new Promise<void>((resolve) => {
				finishOld = resolve;
			}).then(() => {
				stored.push('old-selection');
				throw new Error('old write failed');
			});
		});
		await started;
		const newMountClear = queueWorkspacePrefs('same-chat', async () => {
			stored.push(null);
		});
		expect(stored).toEqual([]);
		finishOld();
		await expect(oldWrite).rejects.toThrow('old write failed');
		await newMountClear;
		expect(stored).toEqual(['old-selection', null]);
	});
});
