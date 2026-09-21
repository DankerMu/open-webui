import { writable, type Writable } from 'svelte/store';

export type OcuWorkspaceState = {
	status?: string;
	revision: number;
	dirty: boolean;
	view?: string;
	selectedFileId?: string;
	generation: number;
};

export type OcuDescribeBody = {
	status?: string;
	revision?: number;
	view?: string;
	selectedFileId?: string;
};

export const ocuWorkspaces: Writable<Record<string, OcuWorkspaceState>> = writable({});

const EMPTY_WORKSPACE: OcuWorkspaceState = {
	revision: 0,
	dirty: false,
	generation: 0
};

export const beginGeneration = (chatId: string): number => {
	let generation = 0;
	ocuWorkspaces.update((workspaces) => {
		const current = { ...(workspaces[chatId] ?? EMPTY_WORKSPACE) };
		generation = current.generation + 1;
		return { ...workspaces, [chatId]: { ...current, generation } };
	});
	return generation;
};

export const applyDescribe = (chatId: string, generation: number, body: OcuDescribeBody) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		if (!current || generation !== current.generation) {
			return workspaces;
		}
		const next: OcuWorkspaceState = { ...current };
		if (body.status !== undefined) {
			next.status = body.status;
		}
		if (body.view !== undefined) {
			next.view = body.view;
		}
		if (body.selectedFileId !== undefined) {
			next.selectedFileId = body.selectedFileId;
		}
		if (typeof body.revision === 'number') {
			next.revision = Math.max(current.revision, body.revision);
		}
		return { ...workspaces, [chatId]: next };
	});
};

export const markDirty = (chatId: string) => {
	ocuWorkspaces.update((workspaces) => {
		const current = { ...(workspaces[chatId] ?? EMPTY_WORKSPACE) };
		return { ...workspaces, [chatId]: { ...current, dirty: true } };
	});
};

export const applyRevision = (chatId: string, revision: number) => {
	ocuWorkspaces.update((workspaces) => {
		const current = { ...(workspaces[chatId] ?? EMPTY_WORKSPACE) };
		return {
			...workspaces,
			[chatId]: { ...current, revision: Math.max(current.revision, revision) }
		};
	});
};
