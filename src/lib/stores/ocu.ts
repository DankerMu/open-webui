import type { WorkspaceFile, WorkspacePrefs } from '$lib/apis/ocu';
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
	hydrated: boolean;
	serverPrefs: WorkspacePrefs;
	pendingPrefs: WorkspacePrefs;
	etag?: string;
	phase: 'loading' | 'ready' | 'empty' | 'error' | 'stopped' | 'disconnected' | 'unavailable';
	notice: string;
	busy: boolean;
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
	prefs?: WorkspacePrefs;
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
	hydrated: false,
	serverPrefs: {},
	pendingPrefs: {},
	phase: 'loading',
	notice: '',
	busy: false,
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
	nextCursor: string | null,
	etag?: string
) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		if (!current || current.generation !== generation || revision < current.revision)
			return workspaces;
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
				etag,
				revision: acceptedRevision,
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
		if (!current || generation !== current.generation) return workspaces;
		// The nested server prefs are hydrated once by hydrateWorkspacePrefs.
		const next: OcuWorkspaceState = {
			...current,
			...(body.status !== undefined ? { status: body.status } : {}),
			reason: body.reason,
			...(body.capabilities !== undefined ? { capabilities: body.capabilities } : {}),
			...(body.views !== undefined ? { views: body.views } : {}),
			...(body.base_url !== undefined ? { baseUrl: body.base_url } : {}),
			revision:
				typeof body.revision === 'number'
					? Math.max(current.revision, body.revision)
					: current.revision
		};
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

const restoredSelectedFileId = (
	intent: WorkspacePrefs,
	prefs: WorkspacePrefs,
	selectedFileId: string | undefined
): string | undefined => {
	if ('selected_file_id' in intent) return intent.selected_file_id ?? undefined;
	if ('selected_file_id' in prefs) return prefs.selected_file_id ?? undefined;
	return selectedFileId;
};

const restoredOpen = (intent: WorkspacePrefs, prefs: WorkspacePrefs, current: boolean) => {
	const requested = typeof intent.open === 'boolean' ? intent.open : undefined;
	const stored = typeof prefs.open === 'boolean' ? prefs.open : undefined;
	return { requested, stored, open: requested ?? stored ?? current };
};

export const hydrateWorkspacePrefs = (
	chatId: string,
	generation: number,
	prefs: WorkspacePrefs
) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		if (!current || current.generation !== generation || current.hydrated) return workspaces;
		const intent = current.pendingPrefs;
		const view = intent.view ?? prefs.view ?? current.view;
		const selectedFileId = restoredSelectedFileId(intent, prefs, current.selectedFileId);
		const { requested, stored, open } = restoredOpen(intent, prefs, current.open);
		return {
			...workspaces,
			[chatId]: {
				...current,
				hydrated: true,
				serverPrefs: { ...prefs },
				view,
				selectedFileId,
				open,
				userClosed: !open && (requested === false || stored === false || current.userClosed),
				autoOpened: current.autoOpened || open,
				acknowledgedRevision: open ? current.revision : current.acknowledgedRevision
			}
		};
	});
};

export const stageWorkspacePrefs = (chatId: string, patch: WorkspacePrefs) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId] ?? EMPTY_WORKSPACE;
		return {
			...workspaces,
			[chatId]: {
				...current,
				pendingPrefs: { ...current.pendingPrefs, ...patch }
			}
		};
	});
};

export const acceptWorkspacePrefs = (chatId: string, prefs: WorkspacePrefs) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		return current ? { ...workspaces, [chatId]: { ...current, serverPrefs: prefs } } : workspaces;
	});
};

export const consumeWorkspaceDirty = (chatId: string) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		return current ? { ...workspaces, [chatId]: { ...current, dirty: false } } : workspaces;
	});
};

export const setWorkspacePresentation = (
	chatId: string,
	generation: number,
	update: Partial<Pick<OcuWorkspaceState, 'phase' | 'notice' | 'busy'>>
) => {
	ocuWorkspaces.update((workspaces) => {
		const current = workspaces[chatId];
		return current && current.generation === generation
			? { ...workspaces, [chatId]: { ...current, ...update } }
			: workspaces;
	});
};
