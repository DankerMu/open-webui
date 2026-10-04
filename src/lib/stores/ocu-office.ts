import type { OfficeSavedAs, OfficeSessionState } from '$lib/apis/ocu/office';
import { writable, type Writable } from 'svelte/store';

export type OcuOfficeState = {
	generation: number;
	fileId?: string;
	sessionId?: string;
	state?: OfficeSessionState | 'refused';
	reason: string | null;
	dirty: boolean;
	workspaceChanged: boolean;
	savedAs: OfficeSavedAs | null;
};

export const ocuOffice: Writable<Record<string, OcuOfficeState>> = writable({});

const EMPTY_OFFICE: OcuOfficeState = {
	generation: 0,
	reason: null,
	dirty: false,
	workspaceChanged: false,
	savedAs: null
};

export const beginOfficeGeneration = (chatId: string): number => {
	let generation = 0;
	ocuOffice.update((sessions) => {
		const current = { ...(sessions[chatId] ?? EMPTY_OFFICE) };
		generation = current.generation + 1;
		return { ...sessions, [chatId]: { ...current, generation } };
	});
	return generation;
};

export const retireOfficeGeneration = (chatId: string) => beginOfficeGeneration(chatId);

export const isCurrentOfficeGeneration = (chatId: string, generation: number): boolean => {
	let current = false;
	ocuOffice.subscribe((sessions) => {
		current = sessions[chatId]?.generation === generation;
	})();
	return current;
};

export const applyOfficeState = (
	chatId: string,
	generation: number,
	update: Partial<Omit<OcuOfficeState, 'generation'>>
) => {
	ocuOffice.update((sessions) => {
		const current = sessions[chatId];
		if (!current || current.generation !== generation) return sessions;
		return { ...sessions, [chatId]: { ...current, ...update } };
	});
};
