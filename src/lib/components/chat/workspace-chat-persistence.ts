import { tick } from 'svelte';
import { get, writable } from 'svelte/store';
import { createNewChat } from '$lib/apis/chats';
import { workspaceFilesEnabled } from '$lib/apis/ocu';
import {
	chatId,
	config,
	selectedFolder,
	settings,
	socket,
	temporaryChatEnabled
} from '$lib/stores';
import { refreshChatList, refreshFolderChatLists } from '$lib/stores/chatList';
import { createTemporaryChatId, isSavedChatId } from '$lib/utils/chatId';
import { createMessagesList } from '$lib/utils';

function initialChatPayload(options: {
	id: string | null;
	title: string;
	models: string[];
	system: string | undefined;
	params: object;
	history: { currentId: string | null };
}): object {
	const { id, title, models, system, params, history } = options;
	return {
		id,
		title,
		models,
		system,
		params,
		history,
		messages: createMessagesList(history, history.currentId),
		tags: [],
		timestamp: Date.now()
	};
}

export function persistWebUIChat(options: {
	snapshot: { currentId: string | null };
	sourceId: string | null;
	embedded: boolean;
	title: string;
	models: string[];
	params: object;
	variables: object | null;
	isCurrent: (id: string | null) => boolean;
	onCreated: (created: Awaited<ReturnType<typeof createNewChat>>) => void;
}) {
	const o = options;
	const selectedFolderId = (get(selectedFolder) as { id?: string } | null)?.id ?? null;
	const temporary = !!get(temporaryChatEnabled);
	const sessionId = get(socket)?.id;
	const token = localStorage.token;
	const system = get(settings).system ?? undefined;
	return persistInitialChat({
		temporary,
		embedded: o.embedded,
		create: () =>
			createNewChat(
				token,
				initialChatPayload({
					id: o.sourceId,
					title: o.title,
					models: o.models,
					system,
					params: o.params,
					history: o.snapshot
				}),
				selectedFolderId,
				o.variables
			),
		createTemporary: async () => {
			const id = createTemporaryChatId(sessionId);
			await chatId.set(id);
			return id;
		},
		isCurrent: o.isCurrent,
		adopt: async (created) => {
			o.onCreated(created);
			await chatId.set(created.id);
		},
		updateUrl: (id) => window.history.replaceState(window.history.state, '', `/c/${id}`),
		tick,
		refreshList: async () => {
			await refreshChatList(token);
		},
		refreshFolder: async (created) => {
			if (selectedFolderId) await refreshFolderChatLists(selectedFolderId, created);
		},
		hasFolder: !!selectedFolderId,
		clearFolder: () => selectedFolder.set(null)
	});
}

export function createWorkspaceChatPersistence() {
	let epoch = 0;
	let pending: { epoch: number; promise: Promise<string | null> } | null = null;
	let firstSendEpoch: number | null = null;
	let precreatedId: string | null = null;
	const firstSendPending = writable(false);
	let previousTemporary: boolean | null | undefined;

	const current = (candidate: number) => candidate === epoch;
	const retire = () => {
		epoch++;
		firstSendEpoch = null;
		precreatedId = null;
		firstSendPending.set(false);
	};
	const observeTemporary = (temporary: boolean | null) => {
		if (previousTemporary !== undefined && previousTemporary !== temporary) retire();
		previousTemporary = temporary;
	};

	const guard = (
		getActiveId: () => string | null,
		getTemporary: () => boolean,
		canAdopt: () => boolean
	) => {
		const candidate = epoch;
		const sourceId = getActiveId();
		return (id: string | null) =>
			current(candidate) && getActiveId() === (id ?? sourceId) && !getTemporary() && canAdopt();
	};
	const pendingSave = () => (pending?.epoch === epoch ? pending.promise : null);
	const startSend = (chatId: string | null, temporary: boolean, embedded: boolean) => {
		const first = !chatId && !temporary && !embedded;
		if (first) {
			firstSendEpoch = epoch;
			firstSendPending.set(true);
		}
		return { epoch, first };
	};
	const beginSend = (
		getId: () => string | null,
		getTemporary: () => boolean,
		embedded: boolean,
		sourceHistory: object,
		getHistory: () => object
	) => {
		const candidate = epoch;
		const canAdopt = () => current(candidate) && getHistory() === sourceHistory && !getTemporary();
		const activate = () => ({
			...startSend(getId(), getTemporary(), embedded),
			canAdopt
		});
		const active = pendingSave();
		return active ? active.then(() => (canAdopt() ? activate() : null)) : activate();
	};
	const finishSend = (candidate: number, chatId: string | null) => {
		if (firstSendEpoch === candidate) {
			firstSendEpoch = null;
			firstSendPending.set(false);
		}
		if (chatId === precreatedId) precreatedId = null;
	};
	const isPrecreatedFirstMessage = (
		chatId: string | null,
		parentId: string | null,
		count: number
	) => chatId === precreatedId && parentId === null && count === 2;
	const generationTasks = (options: {
		chatId: string | null;
		parentId: string | null;
		count: number;
		embedded: boolean;
	}) => {
		const preference = get(settings);
		return {
			...(!get(temporaryChatEnabled) &&
			(!options.chatId ||
				isPrecreatedFirstMessage(options.chatId, options.parentId, options.count) ||
				(options.embedded && options.parentId === null && options.count === 2))
				? {
						title_generation: preference?.title?.auto ?? true,
						tags_generation: preference?.autoTags ?? true
					}
				: {}),
			follow_up_generation: preference?.autoFollowUps ?? true
		};
	};

	function ensureSavedChat(options: {
		chatId: string | null;
		enabled: boolean;
		temporary: boolean;
		embedded: boolean;
		isCurrent: () => boolean;
		wasEmpty: boolean;
		save: (canAdopt: () => boolean) => Promise<string | null>;
	}): Promise<string | null> {
		const { chatId, enabled, temporary, embedded, isCurrent, wasEmpty, save } = options;
		if (
			!enabled ||
			embedded ||
			temporary ||
			chatId === 'default' ||
			(chatId && !isSavedChatId(chatId)) ||
			firstSendEpoch === epoch
		)
			return Promise.resolve(null);
		const active = pendingSave();
		if (active) return active;
		if (isSavedChatId(chatId)) return Promise.resolve(chatId);
		const candidate = epoch;
		const canAdopt = () => current(candidate) && isCurrent();
		const promise = save(canAdopt)
			.then((id) => {
				if (id && wasEmpty && canAdopt()) precreatedId = id;
				return id;
			})
			.catch(() => null)
			.finally(() => {
				if (pending?.promise === promise) pending = null;
			});
		pending = { epoch: candidate, promise };
		return promise;
	}

	function ensureSavedWebUIChat(options: {
		embedded: boolean;
		history: { currentId: string | null };
		chatIdProp: string;
		active: () => { history: object; chatIdProp: string };
		save: (
			snapshot: { currentId: string | null },
			canAdopt: () => boolean
		) => Promise<string | null>;
	}) {
		const sourceHistory = options.history;
		const sourceProp = options.chatIdProp;
		return ensureSavedChat({
			chatId: get(chatId),
			enabled: workspaceFilesEnabled(get(config)),
			temporary: !!get(temporaryChatEnabled),
			embedded: options.embedded,
			wasEmpty: !sourceHistory.currentId,
			isCurrent: () => {
				const active = options.active();
				return (
					active.history === sourceHistory &&
					active.chatIdProp === sourceProp &&
					!get(temporaryChatEnabled)
				);
			},
			save: (canAdopt) => options.save(structuredClone(sourceHistory), canAdopt)
		});
	}

	return {
		guard,
		retire,
		observeTemporary,
		beginSend,
		finishSend,
		firstSendPending,
		generationTasks,
		ensureSavedChat,
		ensureSavedWebUIChat
	};
}

export async function persistInitialChat<T extends { id: string }>(options: {
	temporary: boolean;
	create: () => Promise<T | null>;
	createTemporary: () => Promise<string>;
	isCurrent: (id: string | null) => boolean;
	adopt: (created: T) => Promise<void>;
	updateUrl: (id: string) => void;
	tick: () => Promise<void>;
	refreshList: () => Promise<void>;
	refreshFolder: (created: T) => Promise<void>;
	clearFolder: () => void;
	hasFolder: boolean;
	embedded: boolean;
}): Promise<string | null> {
	if (options.temporary) {
		const id = await options.createTemporary();
		await options.tick();
		return id;
	}
	const created = await options.create();
	const id = created?.id;
	if (!created || !id || !options.isCurrent(null)) return null;
	await options.adopt(created);
	if (!options.isCurrent(id)) return null;
	if (!options.embedded) options.updateUrl(id);
	await options.tick();
	if (!options.isCurrent(id)) return null;
	if (!options.embedded) await options.refreshList();
	if (options.hasFolder) await options.refreshFolder(created);
	if (options.isCurrent(id)) options.clearFolder();
	await options.tick();
	return options.isCurrent(id) ? id : null;
}
