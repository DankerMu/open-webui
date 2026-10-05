// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { applyOfficeState, beginOfficeGeneration, ocuOffice } from '$lib/stores/ocu-office';
import { createOfficeEditorController } from './office-editor-frame';
import type { OfficeEditorController } from './office-editor-frame';

const CHAT = 'owner-chat';
const FILE = 'report.docx';
const SRC = '/ocu/preview/owner-chat?embed=office';
const ORIGIN = window.location.origin;
const ready = { type: 'ocu:office-ready', chat_id: CHAT };
const onTimeout = vi.fn();
let editor: OfficeEditorController;
let frame: HTMLIFrameElement;

function createFrame(path = SRC) {
	const node = document.createElement('iframe');
	node.src = new URL(path, ORIGIN).href;
	document.body.append(node);
	vi.spyOn(node.contentWindow!, 'postMessage');
	return node;
}

function start(fileId = FILE) {
	const generation = editor.start(CHAT, fileId, new URL(SRC, ORIGIN).href);
	frame = createFrame();
	editor.attach(frame);
	return generation;
}

function dispatch(
	data: unknown,
	source: MessageEventSource | null = frame.contentWindow,
	origin = ORIGIN
) {
	window.dispatchEvent(new MessageEvent('message', { data, source, origin }));
}

function state(generation: number, extra: Record<string, unknown> = {}) {
	return {
		type: 'ocu:office-state',
		chat_id: CHAT,
		file_id: FILE,
		generation,
		session_id: 'sess-1',
		state: 'editing',
		dirty: false,
		workspace_changed: false,
		reason: null,
		...extra
	};
}

describe('office editor frame controller', () => {
	beforeEach(() => {
		ocuOffice.set({});
		onTimeout.mockReset();
		editor = createOfficeEditorController({ origin: () => ORIGIN, onTimeout });
	});

	afterEach(() => {
		editor.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
		document.body.replaceChildren();
		ocuOffice.set({});
	});

	it('answers exactly one ready with the original file and an origin-targeted open', () => {
		const generation = start();
		expect(get(ocuOffice)[CHAT]).toMatchObject({
			generation,
			fileId: FILE,
			reason: null,
			dirty: false,
			workspaceChanged: false,
			savedAs: null
		});
		dispatch(ready);
		dispatch(ready);
		expect(frame.contentWindow!.postMessage).toHaveBeenCalledTimes(1);
		expect(frame.contentWindow!.postMessage).toHaveBeenCalledWith(
			{ type: 'ocu:office-open', chat_id: CHAT, file_id: FILE, generation },
			ORIGIN
		);
		expect(vi.mocked(frame.contentWindow!.postMessage).mock.calls[0][1]).not.toBe('*');
	});

	it('records the documented states and nullables without adopting a destination file id', () => {
		const generation = start();
		dispatch(ready);
		for (const name of [
			'opening',
			'editing',
			'saving',
			'closing',
			'closed',
			'conflict',
			'error',
			'orphaned',
			'refused'
		]) {
			dispatch(
				state(generation, {
					state: name,
					session_id: name === 'refused' ? null : 'sess-1',
					reason: ['refused', 'error', 'conflict'].includes(name) ? 'broker_reason' : null
				})
			);
			expect(get(ocuOffice)[CHAT].state).toBe(name);
			expect(get(ocuOffice)[CHAT].fileId).toBe(FILE);
		}
		expect(get(ocuOffice)[CHAT].sessionId).toBeUndefined();
		dispatch(state(generation, { state: 'opening', session_id: null }));
		expect(get(ocuOffice)[CHAT]).toMatchObject({ state: 'opening', sessionId: undefined });
		dispatch(state(generation, { reason: 'save_timeout', dirty: true, workspace_changed: true }));
		expect(get(ocuOffice)[CHAT]).toMatchObject({
			state: 'editing',
			sessionId: 'sess-1',
			reason: 'save_timeout',
			dirty: true,
			workspaceChanged: true
		});
		const accepted = get(ocuOffice);
		dispatch(state(generation, { file_id: 'saved-as.docx' }));
		expect(get(ocuOffice)).toBe(accepted);
	});

	it('rejects premature, forged and malformed messages atomically', () => {
		const generation = start();
		const sibling = createFrame('/ocu/files/owner-chat/page.html');
		const before = get(ocuOffice);
		dispatch(state(generation));
		dispatch(ready, sibling.contentWindow);
		dispatch(ready, window);
		dispatch(ready, frame.contentWindow, 'https://evil.example');
		dispatch({ ...ready, chat_id: 'other' });
		dispatch({ ...ready, extra: true });
		dispatch({ type: 'ocu:office-ready' });
		expect(frame.contentWindow!.postMessage).not.toHaveBeenCalled();
		expect(get(ocuOffice)).toBe(before);
		dispatch(ready);
		for (const invalid of [
			{ chat_id: 'other' },
			{ file_id: 'other.docx' },
			{ generation: generation - 1 },
			{ generation: true },
			{ generation: 1.5 },
			{ dirty: 'yes' },
			{ workspace_changed: 1 },
			{ session_id: 12 },
			{ session_id: '' },
			{ reason: 0 },
			{ extra: true }
		])
			dispatch(state(generation, invalid));
		for (const name of ['unknown', 'constructor', 'toString', '__proto__'])
			dispatch(state(generation, { state: name }));
		for (const name of ['refused', 'error', 'conflict']) {
			dispatch(state(generation, { state: name, reason: null }));
			dispatch(state(generation, { state: name, reason: '' }));
		}
		for (const key of Object.keys(state(generation))) {
			const data: Record<string, unknown> = state(generation);
			delete data[key];
			dispatch(data);
		}
		for (const data of [null, [], 'editing', true]) dispatch(data);
		dispatch(state(generation), sibling.contentWindow);
		dispatch(state(generation), frame.contentWindow, 'https://evil.example');
		expect(get(ocuOffice)).toBe(before);
		expect(frame.contentWindow!.postMessage).toHaveBeenCalledTimes(1);
	});

	it('resets retained fields on activation and retires before the ready timeout callback', () => {
		vi.useFakeTimers();
		const first = start();
		applyOfficeState(CHAT, first, {
			sessionId: 'old-session',
			state: 'editing',
			reason: 'stale',
			dirty: true,
			workspaceChanged: true,
			savedAs: { file_id: 'other', path: 'other.docx' }
		});
		const preserved = beginOfficeGeneration(CHAT);
		expect(get(ocuOffice)[CHAT]).toMatchObject({
			generation: preserved,
			sessionId: 'old-session',
			dirty: true
		});
		const second = start();
		expect(second).toBeGreaterThan(preserved);
		expect(get(ocuOffice)[CHAT]).toMatchObject({
			fileId: FILE,
			sessionId: undefined,
			state: undefined,
			reason: null,
			dirty: false,
			workspaceChanged: false,
			savedAs: null
		});
		onTimeout.mockImplementation(() => {
			expect(get(ocuOffice)[CHAT].generation).toBeGreaterThan(second);
			dispatch(ready);
		});
		vi.advanceTimersByTime(10_000);
		expect(onTimeout).toHaveBeenCalledTimes(1);
		expect(frame.contentWindow!.postMessage).not.toHaveBeenCalled();
	});

	it('does not let a detached earlier frame retire its replacement', () => {
		const first = start();
		const previous = frame;
		const second = start('sheet.xlsx');
		editor.detach(previous);
		dispatch(ready, previous.contentWindow);
		expect(previous.contentWindow!.postMessage).not.toHaveBeenCalled();
		dispatch(ready);
		expect(frame.contentWindow!.postMessage).toHaveBeenCalledWith(
			{
				type: 'ocu:office-open',
				chat_id: CHAT,
				file_id: 'sheet.xlsx',
				generation: second
			},
			ORIGIN
		);
		expect(second).toBeGreaterThan(first);
	});

	it('rejects the current frame when its actual URL differs from the expected URL', () => {
		editor.start(CHAT, FILE, new URL(SRC, ORIGIN).href);
		frame = createFrame('/ocu/preview/other?embed=office');
		editor.attach(frame);
		const before = get(ocuOffice);
		dispatch(ready);
		expect(frame.contentWindow!.postMessage).not.toHaveBeenCalled();
		expect(get(ocuOffice)).toBe(before);
	});

	it('keeps chat B untouched and cannot revive externally retired authority', () => {
		vi.useFakeTimers();
		const other = beginOfficeGeneration('B');
		applyOfficeState('B', other, {
			fileId: 'file-b',
			sessionId: 'session-b',
			state: 'editing',
			dirty: true
		});
		const beforeB = get(ocuOffice).B;
		const generation = start();
		const retired = beginOfficeGeneration(CHAT);
		dispatch(ready);
		expect(frame.contentWindow!.postMessage).not.toHaveBeenCalled();
		vi.advanceTimersByTime(10_000);
		expect(onTimeout).not.toHaveBeenCalled();
		editor.dispose();
		editor.dispose();
		expect(get(ocuOffice)[CHAT].generation).toBe(retired);
		expect(retired).toBeGreaterThan(generation);
		expect(get(ocuOffice).B).toBe(beforeB);
	});
});
