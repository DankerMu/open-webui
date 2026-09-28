// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, type Writable } from 'svelte/store';
import { chatId, config, selectedFolder, settings, temporaryChatEnabled } from '$lib/stores';
import { registerFolderRefreshHandler, resetChatListState } from '$lib/stores/chatList';
import { createWorkspaceChatPersistence, persistWebUIChat } from './workspace-chat-persistence';

const folder = selectedFolder as Writable<{ id: string } | null>;
const ownerConfig = { features: { enable_ocu_workspace: true } } as unknown as Parameters<
	typeof config.set
>[0];
const serverChat = { id: 'server-chat', chat: { title: 'New Chat' } };
const response = (body: object, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
const emptyHistory = () => ({ messages: {}, currentId: null });

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let createReply: () => Promise<Response>;
let unregisterFolder: () => void;
let previous: {
	chatId: string;
	config: Parameters<typeof config.set>[0];
	folder: Parameters<typeof selectedFolder.set>[0];
	settings: Parameters<typeof settings.set>[0];
	temporary: boolean;
	url: string;
	token: string | null;
};

beforeEach(() => {
	previous = {
		chatId: get(chatId),
		config: get(config),
		folder: get(selectedFolder),
		settings: get(settings),
		temporary: get(temporaryChatEnabled),
		url: window.location.href,
		token: localStorage.getItem('token')
	};
	chatId.set('');
	config.set(ownerConfig);
	folder.set(null);
	settings.set({ system: 'saved system prompt' });
	temporaryChatEnabled.set(false);
	localStorage.setItem('token', 'fixture-owner-token');
	window.history.replaceState(null, '', '/');
	calls = [];
	createReply = async () => response(serverChat);
	unregisterFolder = () => {};
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, init });
			if (url.endsWith('/chats/new') && init?.method === 'POST') return createReply();
			if (url.includes('/chats/?page=1'))
				return Promise.resolve(response([{ id: 'server-chat', updated_at: 1 }]));
			throw new Error(`Unexpected request ${url}`);
		})
	);
});

afterEach(() => {
	unregisterFolder();
	resetChatListState();
	chatId.set(previous.chatId);
	config.set(previous.config);
	selectedFolder.set(previous.folder);
	settings.set(previous.settings);
	temporaryChatEnabled.set(previous.temporary);
	window.history.replaceState(null, '', previous.url);
	if (previous.token === null) localStorage.removeItem('token');
	else localStorage.setItem('token', previous.token);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function workspaceSave(
	owner: ReturnType<typeof createWorkspaceChatPersistence>,
	history: { currentId: string | null; messages?: Record<string, unknown> } = emptyHistory()
) {
	const sourceId = get(chatId);
	return {
		snapshot: history,
		sourceId,
		embedded: false,
		title: 'New Chat',
		models: ['fixture-model'],
		params: { temperature: 0.4 },
		variables: { topic: 'workspace' },
		isCurrent: owner.guard(
			() => get(chatId),
			() => get(temporaryChatEnabled),
			() => true
		),
		onCreated: () => {}
	};
}

describe('real WebUI chat persistence bridge', () => {
	it('persists history, controls, variables and folder under the server-issued id before updating URL', async () => {
		folder.set({ id: 'owner-folder' });
		const refreshed: Array<{ folder: string | null | undefined; chat: string | undefined }> = [];
		unregisterFolder = registerFolderRefreshHandler((folderId, created) => {
			refreshed.push({ folder: folderId, chat: created?.id });
		});
		const owner = createWorkspaceChatPersistence();
		const history = {
			messages: { old: { id: 'old', role: 'user', content: 'Existing history', parentId: null } },
			currentId: 'old'
		};
		let adopted: string | null = null;
		const id = await persistWebUIChat({
			...workspaceSave(owner, history),
			onCreated: (created) => {
				adopted = created.id;
			}
		});
		expect(id).toBe('server-chat');
		expect(adopted).toBe('server-chat');
		expect(get(chatId)).toBe('server-chat');
		expect(window.location.pathname).toBe('/c/server-chat');
		expect(get(selectedFolder)).toBeNull();
		expect(refreshed).toEqual([{ folder: 'owner-folder', chat: 'server-chat' }]);
		const create = calls.find((call) => call.url.endsWith('/chats/new'));
		expect(create?.init?.headers).toMatchObject({ authorization: 'Bearer fixture-owner-token' });
		expect(JSON.parse(String(create?.init?.body))).toMatchObject({
			folder_id: 'owner-folder',
			variables: { topic: 'workspace' },
			chat: {
				models: ['fixture-model'],
				system: 'saved system prompt',
				params: { temperature: 0.4 },
				history,
				messages: [{ id: 'old', role: 'user', content: 'Existing history' }]
			}
		});
	});

	it('keeps temporary chats local with no create request or folder refresh', async () => {
		temporaryChatEnabled.set(true);
		folder.set({ id: 'owner-folder' });
		const owner = createWorkspaceChatPersistence();
		let adopted = false;
		const id = await persistWebUIChat({
			...workspaceSave(owner),
			onCreated: () => {
				adopted = true;
			}
		});
		expect(id).toMatch(/^temporary:/);
		expect(get(chatId)).toBe(id);
		expect(get(selectedFolder)).toEqual({ id: 'owner-folder' });
		expect(window.location.pathname).toBe('/');
		expect(calls).toEqual([]);
		expect(adopted).toBe(false);
	});

	it.each(['navigation', 'temporary mode'] as const)(
		'ignores the old server response after %s without replacing the active chat',
		async (transition) => {
			folder.set({ id: 'owner-folder' });
			let finish: (value: Response) => void = () => {};
			createReply = () =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				});
			const owner = createWorkspaceChatPersistence();
			owner.observeTemporary(false);
			const identity = { history: emptyHistory(), chatIdProp: '' };
			let adopted = false;
			const pending = owner.ensureSavedWebUIChat({
				embedded: false,
				history: identity.history,
				chatIdProp: identity.chatIdProp,
				active: () => identity,
				save: (snapshot, canAdopt) =>
					persistWebUIChat({
						...workspaceSave(owner, snapshot),
						isCurrent: owner.guard(
							() => get(chatId),
							() => get(temporaryChatEnabled),
							canAdopt
						),
						onCreated: () => {
							adopted = true;
						}
					})
			});
			expect(calls.filter((call) => call.url.endsWith('/chats/new'))).toHaveLength(1);
			if (transition === 'navigation') {
				identity.chatIdProp = 'other-chat';
				chatId.set('other-chat');
				owner.retire();
			} else {
				temporaryChatEnabled.set(true);
				owner.observeTemporary(true);
			}
			finish(response(serverChat));
			await expect(pending).resolves.toBeNull();
			expect(adopted).toBe(false);
			expect(get(chatId)).toBe(transition === 'navigation' ? 'other-chat' : '');
			expect(window.location.pathname).toBe('/');
			expect(get(selectedFolder)).toEqual({ id: 'owner-folder' });
			expect(calls.filter((call) => call.url.includes('/chats/?page=1'))).toEqual([]);
		}
	);

	it('keeps failed save retryable and adopts only the successful server response', async () => {
		let attempts = 0;
		createReply = async () =>
			++attempts === 1 ? response({ detail: 'service unavailable' }, 503) : response(serverChat);
		const owner = createWorkspaceChatPersistence();
		const identity = { history: emptyHistory(), chatIdProp: '' };
		const save = () =>
			owner.ensureSavedWebUIChat({
				embedded: false,
				history: identity.history,
				chatIdProp: identity.chatIdProp,
				active: () => identity,
				save: (snapshot, canAdopt) =>
					persistWebUIChat({
						...workspaceSave(owner, snapshot),
						isCurrent: owner.guard(
							() => get(chatId),
							() => get(temporaryChatEnabled),
							canAdopt
						),
						onCreated: () => {}
					})
			});
		await expect(save()).resolves.toBeNull();
		expect(window.location.pathname).toBe('/');
		expect(get(chatId)).toBe('');
		await expect(save()).resolves.toBe('server-chat');
		expect(attempts).toBe(2);
		expect(get(chatId)).toBe('server-chat');
		expect(window.location.pathname).toBe('/c/server-chat');
	});
});
