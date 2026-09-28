import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createWorkspaceChatPersistence, persistInitialChat } from './workspace-chat-persistence';
import { chatId, settings, temporaryChatEnabled } from '$lib/stores';

const previousSettings = get(settings);
const previousChatId = get(chatId);
const previousTemporary = get(temporaryChatEnabled);
beforeEach(() => {
	settings.set({ autoFollowUps: false });
	chatId.set('');
	temporaryChatEnabled.set(false);
});
afterEach(() => {
	settings.set(previousSettings);
	chatId.set(previousChatId);
	temporaryChatEnabled.set(previousTemporary);
});

describe('workspace chat persistence boundary', () => {
	it('shares an unsaved persistence while blocking first Send until the same server id is adopted', async () => {
		const owner = createWorkspaceChatPersistence();
		let resolveSave: (id: string) => void = () => {};
		let creates = 0;
		let activeId: string | null = null;
		const save = () => {
			creates++;
			return new Promise<string>((resolve) => {
				resolveSave = resolve;
			});
		};
		const options = {
			chatId: null,
			enabled: true,
			temporary: false,
			embedded: false,
			isCurrent: () => activeId === null || activeId === 'server-id',
			wasEmpty: true,
			save
		};
		const first = owner.ensureSavedChat(options);
		const second = owner.ensureSavedChat(options);
		expect(creates).toBe(1);
		const pendingSend = owner.beginSend(
			() => activeId,
			() => false,
			false,
			options,
			() => options
		);
		expect(pendingSend).toBeInstanceOf(Promise);
		activeId = 'server-id';
		resolveSave('server-id');
		await expect(first).resolves.toBe('server-id');
		await expect(second).resolves.toBe('server-id');
		expect(owner.generationTasks('server-id', { messages: {} }, 'first', false)).toEqual({
			title_generation: true,
			tags_generation: true,
			follow_up_generation: false
		});
		const send = await pendingSend;
		expect(send?.first).toBe(false);
		owner.finishSend(send!.epoch);
		expect(
			owner.generationTasks(
				'server-id',
				{
					messages: { first: { role: 'assistant', done: true } }
				},
				'first',
				false
			)
		).toEqual({ follow_up_generation: false });
	});

	it('rejects retired or unsaveable context and leaves newer chat identity untouched', async () => {
		const owner = createWorkspaceChatPersistence();
		let finish: (id: string) => void = () => {};
		let adoptedId: string | null = null;
		const save = async (canAdopt: () => boolean) =>
			persistInitialChat({
				temporary: false,
				create: () =>
					new Promise<{ id: string }>((resolve) => {
						finish = (id) => resolve({ id });
					}),
				createTemporary: async () => 'temporary:session',
				isCurrent: (id) => canAdopt() && adoptedId === id,
				adopt: async (created) => {
					adoptedId = created.id;
				},
				updateUrl: () => {
					throw new Error('retired context changed URL');
				},
				tick: async () => {},
				refreshList: async () => {},
				refreshFolder: async () => {},
				clearFolder: () => {},
				hasFolder: false,
				embedded: false
			});
		const options = {
			chatId: null,
			enabled: true,
			temporary: false,
			embedded: false,
			isCurrent: () => true,
			wasEmpty: true,
			save
		};
		const pending = owner.ensureSavedChat(options);
		owner.retire();
		finish('stale-server-id');
		await expect(pending).resolves.toBeNull();
		expect(adoptedId).toBeNull();
		await expect(
			owner.ensureSavedChat({ ...options, chatId: 'temporary:session' })
		).resolves.toBeNull();
		await expect(owner.ensureSavedChat({ ...options, chatId: 'channel:abc' })).resolves.toBeNull();
		await expect(owner.ensureSavedChat({ ...options, chatId: 'default' })).resolves.toBeNull();
	});

	it('marks an in-flight first Send pending and releases it without parallel persistence', async () => {
		const owner = createWorkspaceChatPersistence();
		const source = {};
		const pending = owner.beginSend(
			() => null,
			() => false,
			false,
			source,
			() => source
		);
		expect(get(owner.firstSendPending)).toBe(true);
		const send = await pending;
		expect(send?.first).toBe(true);
		let saves = 0;
		const result = await owner.ensureSavedChat({
			chatId: null,
			enabled: true,
			temporary: false,
			embedded: false,
			isCurrent: () => true,
			wasEmpty: true,
			save: async () => {
				saves++;
				return 'parallel';
			}
		});
		expect(result).toBeNull();
		expect(saves).toBe(0);
		owner.finishSend(send!.epoch);
		expect(get(owner.firstSendPending)).toBe(false);
	});

	it('retires an in-flight first Send when temporary mode changes', async () => {
		const owner = createWorkspaceChatPersistence();
		owner.observeTemporary(false);
		const source = {};
		const pending = owner.beginSend(
			() => null,
			() => false,
			false,
			source,
			() => source
		);
		expect(get(owner.firstSendPending)).toBe(true);
		owner.observeTemporary(true);
		const first = await pending;
		expect(first?.canAdopt()).toBe(false);
		expect(get(owner.firstSendPending)).toBe(false);
	});
	it('keeps first-message generation eligible after an unsuccessful workspace-precreated send', async () => {
		const owner = createWorkspaceChatPersistence();
		const id = 'server-chat';
		await owner.ensureSavedChat({
			chatId: null,
			enabled: true,
			temporary: false,
			embedded: false,
			isCurrent: () => true,
			wasEmpty: true,
			save: async () => id
		});
		const source = {};
		const attempt = await owner.beginSend(
			() => id,
			() => false,
			false,
			source,
			() => source
		);
		expect(attempt?.first).toBe(false);
		expect(owner.generationTasks(id, { messages: {} }, 'first', false)).toMatchObject({
			title_generation: true,
			tags_generation: true
		});

		// The first assistant attempt failed; no completed assistant exists yet.
		owner.finishSend(attempt!.epoch);
		const failed = {
			messages: {
				first: {
					role: 'assistant',
					done: true,
					error: { content: 'request failed' }
				}
			}
		};
		expect(owner.generationTasks(id, failed, 'retry', false)).toMatchObject({
			title_generation: true,
			tags_generation: true
		});
		expect(
			owner.generationTasks(
				id,
				{
					messages: { first: { role: 'assistant', done: true } }
				},
				'retry',
				false
			)
		).not.toHaveProperty('title_generation');
	});
	it('settles a rejecting sibling-owned create for concurrent Workspace and Send consumers', async () => {
		const owner = createWorkspaceChatPersistence();
		const history = {};
		let failCreate: (error: Error) => void = () => {};
		let creates = 0;
		let workspaceCreates = 0;
		const sibling = owner.persistSiblingMessages({
			activeHistory: () => history,
			create: () => {
				creates++;
				return new Promise<string>((_resolve, reject) => {
					failCreate = reject;
				});
			},
			update: async () => {
				throw new Error('A failed create cannot update a chat');
			}
		});
		const workspace = owner.ensureSavedChat({
			chatId: null,
			enabled: true,
			temporary: false,
			embedded: false,
			isCurrent: () => true,
			wasEmpty: false,
			save: async () => {
				workspaceCreates++;
				return 'duplicate';
			}
		});
		const send = owner.beginSend(
			() => get(chatId),
			() => get(temporaryChatEnabled),
			false,
			history,
			() => history
		);
		await vi.waitFor(() => expect(creates).toBe(1));
		failCreate(new Error('backend create failed'));
		const outcomes = await Promise.allSettled([sibling, workspace, Promise.resolve(send)]);
		expect(outcomes[0]).toMatchObject({ status: 'fulfilled', value: null });
		expect(outcomes[1]).toMatchObject({ status: 'fulfilled', value: null });
		expect(outcomes[2]).toMatchObject({ status: 'fulfilled', value: { first: true } });
		expect(workspaceCreates).toBe(0);
		expect(creates).toBe(1);
		expect(get(owner.firstSendPending)).toBe(true);
	});

	it('creates once with current generated history after an earlier Workspace save fails', async () => {
		const owner = createWorkspaceChatPersistence();
		const history = {};
		let finishWorkspace: (id: string | null) => void = () => {};
		let creates = 0;
		const workspace = owner.ensureSavedChat({
			chatId: null,
			enabled: true,
			temporary: false,
			embedded: false,
			isCurrent: () => true,
			wasEmpty: true,
			save: () =>
				new Promise<string | null>((resolve) => {
					finishWorkspace = resolve;
				})
		});
		const sibling = owner.persistSiblingMessages({
			activeHistory: () => history,
			create: async () => {
				creates++;
				chatId.set('new-server-id');
				return 'new-server-id';
			},
			update: async () => {
				throw new Error('No accepted id exists to update');
			}
		});
		finishWorkspace(null);
		await expect(workspace).resolves.toBeNull();
		await expect(sibling).resolves.toBe('new-server-id');
		expect(creates).toBe(1);
		expect(get(chatId)).toBe('new-server-id');
	});

	it.each(['navigation', 'temporary mode'] as const)(
		'does not retry or adopt a joined obsolete Workspace save after %s',
		async (transition) => {
			const owner = createWorkspaceChatPersistence();
			owner.observeTemporary(false);
			let history = {};
			let finishWorkspace: (id: string | null) => void = () => {};
			let creates = 0;
			let updates = 0;
			const workspace = owner.ensureSavedChat({
				chatId: null,
				enabled: true,
				temporary: false,
				embedded: false,
				isCurrent: () => true,
				wasEmpty: true,
				save: () =>
					new Promise<string | null>((resolve) => {
						finishWorkspace = resolve;
					})
			});
			const sibling = owner.persistSiblingMessages({
				activeHistory: () => history,
				create: async () => {
					creates++;
					return 'wrong-server-id';
				},
				update: async () => {
					updates++;
				}
			});
			if (transition === 'navigation') {
				history = {};
				chatId.set('other-chat');
				owner.retire();
				finishWorkspace(null);
			} else {
				temporaryChatEnabled.set(true);
				owner.observeTemporary(true);
				finishWorkspace('old-chat');
			}
			const results = await Promise.allSettled([workspace, sibling]);
			expect(results[1]).toMatchObject({ status: 'fulfilled', value: null });
			expect(creates).toBe(0);
			expect(updates).toBe(0);
			expect(get(chatId)).toBe(transition === 'navigation' ? 'other-chat' : '');
		}
	);
});
