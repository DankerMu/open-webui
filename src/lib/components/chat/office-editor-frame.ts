import {
	applyOfficeState,
	beginOfficeGeneration,
	isCurrentOfficeGeneration,
	retireOfficeGeneration,
	ocuOffice
} from '$lib/stores/ocu-office';
import type { OfficeSessionState } from '$lib/apis/ocu/office';
import { get } from 'svelte/store';

export const OFFICE_EDITOR_SANDBOX = 'allow-scripts allow-same-origin';
export const OFFICE_EDITOR_ALLOW = '';
const OFFICE_EDITOR_READY_DEADLINE = 10_000;

const READY_TYPE = 'ocu:office-ready';
const OPEN_TYPE = 'ocu:office-open';
const STATE_TYPE = 'ocu:office-state';
const COMMAND_TYPE = 'ocu:office-command';
const READY_KEYS = 'chat_id,type';
const STATE_KEYS =
	'chat_id,dirty,file_id,generation,reason,session_id,state,type,workspace_changed';
const STATES: Record<string, true> = {
	opening: true,
	editing: true,
	saving: true,
	closing: true,
	closed: true,
	conflict: true,
	error: true,
	orphaned: true,
	refused: true
};

type EditorState = OfficeSessionState | 'refused';
type StateMessage = {
	type: 'ocu:office-state';
	chat_id: string;
	file_id: string;
	generation: number;
	session_id: string | null;
	state: EditorState;
	dirty: boolean;
	workspace_changed: boolean;
	reason: string | null;
};

function messageObject(data: unknown): data is Record<string, unknown> {
	return data !== null && typeof data === 'object' && !Array.isArray(data);
}

function validSessionFields(data: Record<string, unknown>) {
	const session = data.session_id;
	const reason = data.reason;
	if (!(session === null || (typeof session === 'string' && session.length > 0))) return false;
	if (!(reason === null || typeof reason === 'string')) return false;
	if (data.state === 'refused' || data.state === 'error' || data.state === 'conflict')
		return typeof reason === 'string' && reason.length > 0;
	return true;
}

function stateMessage(data: Record<string, unknown>): data is StateMessage {
	return (
		exactKeys(data, STATE_KEYS) &&
		data.type === STATE_TYPE &&
		typeof data.chat_id === 'string' &&
		typeof data.file_id === 'string' &&
		typeof data.generation === 'number' &&
		Number.isSafeInteger(data.generation) &&
		typeof data.state === 'string' &&
		Object.hasOwn(STATES, data.state) &&
		typeof data.dirty === 'boolean' &&
		typeof data.workspace_changed === 'boolean' &&
		validSessionFields(data)
	);
}

const exactKeys = (data: object, expected: string) =>
	Object.keys(data).sort().join(',') === expected;

export const officeEditorSrc = (baseUrl: string, chatId: string): string => {
	if (baseUrl !== '/ocu') throw new Error('invalid editor base');
	return `${baseUrl}/preview/${encodeURIComponent(chatId)}?embed=office`;
};

export type OfficeEditorController = {
	start: (chatId: string, fileId: string, expectedSrc: string) => number;
	attach: (frame: HTMLIFrameElement) => void;
	detach: (frame: HTMLIFrameElement) => void;
	save: () => void;
	dispose: () => void;
};

export const createOfficeEditorController = (options: {
	origin: () => string;
	onTimeout: () => void;
}): OfficeEditorController => {
	let token = 0;
	let chatId = '';
	let fileId = '';
	let generation = 0;
	let expectedSrc = '';
	let frame: HTMLIFrameElement | undefined;
	let opened = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let listener: ((event: MessageEvent) => void) | undefined;

	const clearTimer = () => {
		clearTimeout(timer);
		timer = undefined;
	};

	const unlisten = () => {
		if (!listener) return;
		window.removeEventListener('message', listener);
		listener = undefined;
	};

	const disposeCurrent = () => {
		clearTimer();
		unlisten();
		frame = undefined;
		opened = false;
		if (chatId && generation && isCurrentOfficeGeneration(chatId, generation)) {
			retireOfficeGeneration(chatId);
		}
		generation = 0;
	};

	const trustedFrame = (event: MessageEvent) => {
		const bound = frame;
		if (!bound?.contentWindow || !generation) return;
		if (event.source !== bound.contentWindow || event.origin !== options.origin()) return;
		if (bound.src !== expectedSrc || !isCurrentOfficeGeneration(chatId, generation)) return;
		return bound;
	};

	const applyState = (data: StateMessage) => {
		const current = get(ocuOffice)[chatId];
		const sessionId = data.session_id === null ? undefined : data.session_id;
		if (
			current.sessionId === sessionId &&
			current.state === data.state &&
			current.dirty === data.dirty &&
			current.workspaceChanged === data.workspace_changed &&
			current.reason === data.reason
		)
			return;
		applyOfficeState(chatId, generation, {
			fileId,
			sessionId,
			state: data.state,
			dirty: data.dirty,
			workspaceChanged: data.workspace_changed,
			reason: data.reason
		});
	};

	const receive = (event: MessageEvent, activation: number) => {
		if (activation !== token) return;
		const bound = trustedFrame(event);
		if (!bound?.contentWindow) return;
		const data: unknown = event.data;
		if (!messageObject(data) || data.chat_id !== chatId) return;
		if (data.type === READY_TYPE) {
			if (!exactKeys(data, READY_KEYS) || opened || !timer) return;
			clearTimer();
			opened = true;
			bound.contentWindow.postMessage(
				{ type: OPEN_TYPE, chat_id: chatId, file_id: fileId, generation },
				options.origin()
			);
			return;
		}
		if (!opened || !stateMessage(data)) return;
		if (data.file_id !== fileId || data.generation !== generation) return;
		applyState(data);
	};

	return {
		start(nextChatId, nextFileId, nextExpectedSrc) {
			disposeCurrent();
			token += 1;
			const activation = token;
			chatId = nextChatId;
			fileId = nextFileId;
			expectedSrc = nextExpectedSrc;
			opened = false;
			frame = undefined;
			generation = beginOfficeGeneration(nextChatId);
			applyOfficeState(nextChatId, generation, {
				fileId: nextFileId,
				sessionId: undefined,
				state: undefined,
				reason: null,
				dirty: false,
				workspaceChanged: false,
				savedAs: null
			});
			listener = (event) => receive(event, activation);
			window.addEventListener('message', listener);
			return generation;
		},
		attach(nextFrame) {
			if (!generation || !listener || frame) return;
			frame = nextFrame;
			const activation = token;
			timer = setTimeout(() => {
				if (activation !== token || !timer) return;
				if (!isCurrentOfficeGeneration(chatId, generation)) {
					disposeCurrent();
					return;
				}
				disposeCurrent();
				options.onTimeout();
			}, OFFICE_EDITOR_READY_DEADLINE);
		},
		detach(nextFrame) {
			if (frame === nextFrame) disposeCurrent();
		},
		save() {
			const bound = frame;
			if (!bound?.contentWindow || !opened || !generation) return;
			if (bound.src !== expectedSrc || !isCurrentOfficeGeneration(chatId, generation)) return;
			if (get(ocuOffice)[chatId]?.state !== 'editing') return;
			bound.contentWindow.postMessage(
				{ type: COMMAND_TYPE, chat_id: chatId, generation, command: 'save' },
				options.origin()
			);
		},
		dispose() {
			disposeCurrent();
		}
	};
};

export const officeEditorFrame = (node: HTMLIFrameElement, controller: OfficeEditorController) => {
	controller.attach(node);
	return {
		destroy() {
			controller.detach(node);
		}
	};
};
