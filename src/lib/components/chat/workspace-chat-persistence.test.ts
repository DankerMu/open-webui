import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createWorkspaceChatPersistence, persistInitialChat } from './workspace-chat-persistence';
import { settings } from '$lib/stores';

const previousSettings = get(settings);
beforeEach(() => settings.set({ autoFollowUps: false }));
afterEach(() => settings.set(previousSettings));

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
		expect(
			owner.generationTasks({
				chatId: 'server-id',
				parentId: null,
				count: 2,
				embedded: false
			})
		).toEqual({ title_generation: true, tags_generation: true, follow_up_generation: false });
		const send = await pendingSend;
		expect(send?.first).toBe(false);
		owner.finishSend(send!.epoch, 'server-id');
		expect(
			owner.generationTasks({
				chatId: 'server-id',
				parentId: null,
				count: 2,
				embedded: false
			})
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
		owner.finishSend(send!.epoch, null);
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
});
