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

type CompletionHistory = {
	messages: Record<
		string,
		{
			role?: string;
			parentId?: string | null;
			done?: boolean;
			error?: unknown;
		}
	>;
};

const hasSuccessfulAssistant = (history: CompletionHistory) =>
	Object.values(history.messages).some(
		(message) => message?.role === 'assistant' && message.done === true && !message.error
	);

const isEmbeddedFirstMessage = (history: CompletionHistory, responseMessageId: string) =>
	(history.messages[history.messages[responseMessageId]?.parentId ?? '']?.parentId ?? null) ===
		null && createMessagesList(history, responseMessageId).length === 2;

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
	const ownInitialSave = (create: () => Promise<string | null>): Promise<string | null> => {
		const active = pendingSave();
		if (active) return active;
		const candidate = epoch;
		const promise = Promise.resolve()
			.then(create)
			.catch(() => null)
			.finally(() => {
				if (pending?.promise === promise) pending = null;
			});
		pending = { epoch: candidate, promise };
		return promise;
	};
	const persistSiblingMessages = async (options: {
		activeHistory: () => object;
		create: () => Promise<string | null>;
		update: (id: string) => Promise<void>;
	}) => {
		const candidate = epoch;
		const sourceHistory = options.activeHistory();
		const sourceId = get(chatId);
		const active = pendingSave();
		if (!active)
			return ownInitialSave(() =>
				candidate === epoch && options.activeHistory() === sourceHistory
					? options.create()
					: Promise.resolve(null)
			);
		const id = await active;
		if (
			candidate !== epoch ||
			options.activeHistory() !== sourceHistory ||
			get(temporaryChatEnabled)
		)
			return null;
		if (!id) return get(chatId) === sourceId ? ownInitialSave(options.create) : null;
		if (get(chatId) === id) await options.update(id);
		return id;
	};
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
	const finishSend = (candidate: number) => {
		if (firstSendEpoch === candidate) {
			firstSendEpoch = null;
			firstSendPending.set(false);
		}
	};
	const generationTasks = (
		chatId: string | null,
		history: CompletionHistory,
		responseMessageId: string,
		embedded: boolean
	) => {
		const preference = get(settings);
		const precreated = !!chatId && chatId === precreatedId;
		const successfulAssistant = precreated && hasSuccessfulAssistant(history);
		if (successfulAssistant) precreatedId = null;
		const embeddedFirst = embedded && isEmbeddedFirstMessage(history, responseMessageId);
		return {
			...(!get(temporaryChatEnabled) &&
			(!chatId || (precreated && !successfulAssistant) || embeddedFirst)
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
		history: { currentId: string | null; messages: Record<string, unknown> };
		chatIdProp: string;
		active: () => { history: object; chatIdProp: string };
		save: (
			snapshot: { currentId: string | null; messages: Record<string, unknown> },
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
		persistSiblingMessages,
		finishSend,
		firstSendPending,
		generationTasks,
		ensureSavedChat,
		ensureSavedWebUIChat
	};
}

export function bindWorkspaceChatPersistence(
	owner: ReturnType<typeof createWorkspaceChatPersistence>,
	deps: {
		history: () => { currentId: string | null; messages: Record<string, unknown> };
		chatIdProp: () => string;
		embedded: () => boolean;
		title: () => string;
		models: () => string[];
		params: () => object;
		variables: () => object | null;
		onCreated: (created: Awaited<ReturnType<typeof createNewChat>>) => void;
		saveExisting: (
			id: string,
			history: { currentId: string | null; messages: Record<string, unknown> }
		) => Promise<void>;
	}
) {
	const initChatHandler = (
		snapshot: { currentId: string | null; messages: Record<string, unknown> },
		canAdopt: () => boolean = () => true
	) =>
		persistWebUIChat({
			snapshot,
			sourceId: get(chatId),
			embedded: deps.embedded(),
			title: deps.title(),
			models: deps.models(),
			params: deps.params(),
			variables: deps.variables(),
			isCurrent: owner.guard(
				() => get(chatId),
				() => !!get(temporaryChatEnabled),
				canAdopt
			),
			onCreated: deps.onCreated
		});
	const persistGeneratedMessages = (hasExistingMessages: boolean) => {
		const history = deps.history();
		if (hasExistingMessages) return deps.saveExisting(get(chatId), history);
		return owner.persistSiblingMessages({
			activeHistory: deps.history,
			create: () => initChatHandler(history),
			update: (id) => deps.saveExisting(id, history)
		});
	};
	const ensureSavedChat = () =>
		owner.ensureSavedWebUIChat({
			embedded: deps.embedded(),
			history: deps.history(),
			chatIdProp: deps.chatIdProp(),
			active: () => ({ history: deps.history(), chatIdProp: deps.chatIdProp() }),
			save: initChatHandler
		});
	return { persistGeneratedMessages, ensureSavedChat };
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
