import type { WorkspaceFile } from '$lib/apis/ocu';
import { writable, type Writable } from 'svelte/store';

export type OcuWorkspaceState = {
	status?: string;
	reason?: string;
	capabilities: string[];
	views: string[];
	baseUrl?: string;
	revision: number;
	dirty: boolean;
	view: 'files' | 'browser' | 'terminal';
	open: boolean;
	userClosed: boolean;
	autoOpened: boolean;
	acknowledgedRevision: number;
	selectedFileId?: string;
	files: WorkspaceFile[];
	nextCursor: string | null;
	listingRevision?: number;
	generation: number;
};

// A chat's preference writes retain order across panel destruction and remount.
const prefsWrites = new Map<string, Promise<void>>();

export const queueWorkspacePrefs = (
	chatId: string,
	write: () => Promise<unknown>
): Promise<void> => {
	const previous = prefsWrites.get(chatId) ?? Promise.resolve();
	const pending = previous
		.catch(() => undefined)
		.then(write)
		.then(() => undefined);
	prefsWrites.set(chatId, pending);
	void pending
		.finally(() => {
			if (prefsWrites.get(chatId) === pending) prefsWrites.delete(chatId);
		})
		.catch(() => undefined);
	return pending;
};

export type OcuDescribeBody = {
	status?: string;
	reason?: string;
	capabilities?: string[];
	views?: string[];
	base_url?: string;
	revision?: number;
	view?: 'files' | 'browser' | 'terminal';
	selectedFileId?: string;
};
export const ocuWorkspaces: Writable<Record<string, OcuWorkspaceState>> = writable({});

const EMPTY_WORKSPACE: OcuWorkspaceState = {
	revision: 0,
	dirty: false,
	generation: 0,
	capabilities: [],
	views: [],
	view: 'files',
	open: false,
	userClosed: false,
	autoOpened: false,
	acknowledgedRevision: 0,
	files: [],
	nextCursor: null
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

export const retireGeneration = (chatId: string) => beginGeneration(chatId);

export const isCurrentGeneration = (chatId: string, generation: number): boolean => {
	let current = false;
	ocuWorkspaces.subscribe((workspaces) => {
		current = workspaces[chatId]?.generation === generation;
	})();
	return current;
};

export const selectWorkspaceFile = (chatId: string, fileId: string | undefined) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		return current
			? {
					...workspaces,
					[chatId]: {
						...current,
						selectedFileId: fileId,
						view: fileId ? 'files' : current.view,
						open: fileId ? true : current.open,
						userClosed: fileId ? false : current.userClosed,
						acknowledgedRevision: fileId ? current.revision : current.acknowledgedRevision
					}
				}
			: workspaces;
	});
};

export const openWorkspacePanel = (chatId: string) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId] ?? EMPTY_WORKSPACE;
		return {
			...workspaces,
			[chatId]: {
				...current,
				open: true,
				userClosed: false,
				autoOpened: true,
				acknowledgedRevision: current.revision
			}
		};
	});
};

export const closeWorkspacePanel = (chatId: string) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		return current
			? { ...workspaces, [chatId]: { ...current, open: false, userClosed: true } }
			: workspaces;
	});
};

export const selectWorkspaceView = (chatId: string, view: OcuWorkspaceState['view']) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		return current ? { ...workspaces, [chatId]: { ...current, view } } : workspaces;
	});
};

export const applyWorkspaceListing = (
	chatId: string,
	generation: number,
	files: WorkspaceFile[],
	revision: number,
	nextCursor: string | null
) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		if (!current || current.generation !== generation) return workspaces;
		const acceptedRevision = Math.max(current.revision, revision);
		const firstOutput = files.length > 0 && !current.autoOpened;
		const open = current.open || (firstOutput && !current.userClosed);
		return {
			...workspaces,
			[chatId]: {
				...current,
				files,
				listingRevision: revision,
				nextCursor,
				revision: acceptedRevision,
				dirty: false,
				open,
				autoOpened: current.autoOpened || firstOutput,
				acknowledgedRevision: open ? acceptedRevision : current.acknowledgedRevision
			}
		};
	});
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
		if (body.reason !== undefined) next.reason = body.reason;
		else next.reason = undefined;
		if (body.capabilities !== undefined) next.capabilities = body.capabilities;
		if (body.views !== undefined) next.views = body.views;
		if (body.base_url !== undefined) next.baseUrl = body.base_url;
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
		const acceptedRevision = Math.max(current.revision, revision);
		return {
			...workspaces,
			[chatId]: {
				...current,
				revision: acceptedRevision,
				acknowledgedRevision: current.open ? acceptedRevision : current.acknowledgedRevision
			}
		};
	});
};
