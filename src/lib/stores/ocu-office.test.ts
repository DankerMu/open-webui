import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';

import {
	applyOfficeState,
	beginOfficeGeneration,
	isCurrentOfficeGeneration,
	ocuOffice,
	retireOfficeGeneration
} from './ocu-office';

describe('ocu office store', () => {
	beforeEach(() => {
		ocuOffice.set({});
	});

	it('applies a current generation and leaves a retired generation unchanged', () => {
		const current = beginOfficeGeneration('A');
		applyOfficeState('A', current, {
			fileId: 'file-a',
			sessionId: 'sess-a',
			state: 'editing',
			dirty: true,
			workspaceChanged: true
		});
		expect(get(ocuOffice).A).toMatchObject({
			generation: current,
			fileId: 'file-a',
			sessionId: 'sess-a',
			state: 'editing',
			dirty: true,
			workspaceChanged: true
		});
		expect(isCurrentOfficeGeneration('A', current)).toBe(true);

		const retired = current;
		const next = retireOfficeGeneration('A');
		expect(isCurrentOfficeGeneration('A', retired)).toBe(false);
		expect(isCurrentOfficeGeneration('A', next)).toBe(true);
		const afterRetire = get(ocuOffice).A;
		applyOfficeState('A', retired, { state: 'closed', dirty: false, reason: 'stale' });
		expect(get(ocuOffice).A).toBe(afterRetire);
		expect(get(ocuOffice).A.state).toBe('editing');
		expect(get(ocuOffice).A.dirty).toBe(true);

		applyOfficeState('A', next, { state: 'saving', dirty: true });
		expect(get(ocuOffice).A.state).toBe('saving');
	});

	it('ignores an update for a chat that has no generation', () => {
		const empty = get(ocuOffice);
		applyOfficeState('missing', 1, { state: 'editing', dirty: true });
		expect(get(ocuOffice)).toBe(empty);
		expect(get(ocuOffice).missing).toBeUndefined();
	});

	it('keeps chat B identical, including reference identity, across every operation on A', () => {
		const genA = beginOfficeGeneration('A');
		const genB = beginOfficeGeneration('B');
		applyOfficeState('B', genB, {
			fileId: 'file-b',
			sessionId: 'sess-b',
			state: 'editing',
			reason: null,
			dirty: false,
			workspaceChanged: false,
			savedAs: { file_id: 'saved-b', path: 'kept.docx' }
		});
		const bBefore = get(ocuOffice).B;

		applyOfficeState('A', genA, {
			fileId: 'file-a',
			sessionId: 'sess-a',
			state: 'conflict',
			reason: 'baseline_mismatch',
			dirty: true,
			workspaceChanged: true,
			savedAs: null
		});
		expect(get(ocuOffice).B).toBe(bBefore);

		const nextA = beginOfficeGeneration('A');
		applyOfficeState('A', nextA, { state: 'closed', dirty: false });
		expect(get(ocuOffice).B).toBe(bBefore);

		retireOfficeGeneration('A');
		expect(get(ocuOffice).B).toBe(bBefore);
		expect(get(ocuOffice).B).toEqual({
			generation: genB,
			fileId: 'file-b',
			sessionId: 'sess-b',
			state: 'editing',
			reason: null,
			dirty: false,
			workspaceChanged: false,
			savedAs: { file_id: 'saved-b', path: 'kept.docx' }
		});
	});

	it('applies a late result for A only after B became current', () => {
		const genA = beginOfficeGeneration('A');
		applyOfficeState('A', genA, { state: 'closing', dirty: true, sessionId: 'sess-a' });
		const genB = beginOfficeGeneration('B');
		applyOfficeState('B', genB, { state: 'editing', dirty: false, fileId: 'file-b' });
		const bCurrent = get(ocuOffice).B;

		applyOfficeState('A', genA, {
			state: 'closed',
			dirty: false,
			savedAs: { file_id: 'new-a', path: 'report (2).docx' },
			reason: null
		});

		expect(get(ocuOffice).B).toBe(bCurrent);
		expect(get(ocuOffice).B.state).toBe('editing');
		expect(get(ocuOffice).B.fileId).toBe('file-b');
		expect(get(ocuOffice).A).toMatchObject({
			generation: genA,
			state: 'closed',
			dirty: false,
			sessionId: 'sess-a',
			savedAs: { file_id: 'new-a', path: 'report (2).docx' }
		});
	});

	it('retains a current refused editor state and ignores a retired refusal', () => {
		const genA = beginOfficeGeneration('A');
		applyOfficeState('A', genA, {
			fileId: 'file-a',
			sessionId: 'sess-a',
			state: 'opening',
			reason: null,
			dirty: true,
			workspaceChanged: false,
			savedAs: null
		});
		const genB = beginOfficeGeneration('B');
		applyOfficeState('B', genB, {
			fileId: 'file-b',
			sessionId: 'sess-b',
			state: 'editing',
			reason: null,
			dirty: false,
			workspaceChanged: false,
			savedAs: null
		});
		const bBefore = get(ocuOffice).B;

		applyOfficeState('A', genA, {
			state: 'refused',
			reason: 'unsupported_type',
			dirty: false,
			sessionId: undefined
		});
		expect(get(ocuOffice).A).toMatchObject({
			generation: genA,
			fileId: 'file-a',
			state: 'refused',
			reason: 'unsupported_type',
			dirty: false
		});
		expect(get(ocuOffice).A.sessionId).toBeUndefined();
		expect(get(ocuOffice).B).toBe(bBefore);

		const retired = genA;
		const nextA = retireOfficeGeneration('A');
		applyOfficeState('A', nextA, {
			state: 'opening',
			dirty: true,
			reason: null,
			sessionId: 'sess-next'
		});
		const afterCurrent = get(ocuOffice);
		applyOfficeState('A', retired, {
			state: 'refused',
			reason: 'unsupported_type',
			dirty: false,
			sessionId: undefined
		});
		expect(get(ocuOffice)).toBe(afterCurrent);
		expect(get(ocuOffice).A.state).toBe('opening');
		expect(get(ocuOffice).A.dirty).toBe(true);
		expect(get(ocuOffice).A.reason).toBeNull();
		expect(get(ocuOffice).B).toBe(bBefore);
	});
});
