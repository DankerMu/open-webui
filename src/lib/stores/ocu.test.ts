import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

import { artifactContents } from '$lib/stores';
import {
	applyDescribe,
	applyRevision,
	beginGeneration,
	markDirty,
	ocuWorkspaces
} from './ocu';

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

	it('does not write artifactContents', () => {
		const before = get(artifactContents);
		const gen = beginGeneration('A');
		applyDescribe('A', gen, { status: 'running', revision: 4 });
		markDirty('A');
		applyRevision('A', 5);
		expect(get(artifactContents)).toBe(before);
	});
});
