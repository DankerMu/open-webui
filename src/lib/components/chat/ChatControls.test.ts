// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get, writable } from 'svelte/store';
import {
	chatId,
	config,
	settings,
	showArtifacts,
	showCallOverlay,
	showControls,
	showEmbeds,
	temporaryChatEnabled
} from '$lib/stores';
import {
	applyWorkspaceListing,
	beginGeneration,
	hydrateWorkspacePrefs,
	ocuWorkspaces,
	queueWorkspacePrefs
} from '$lib/stores/ocu';
import ChatControls from './ChatControls.svelte';
import {
	createWorkspaceReconciliation,
	WORKSPACE_RECONCILIATION,
	type WorkspaceReconciliation
} from './workspace-reconciliation';
// This policy case never mounts XTerminal; its eager xterm import needs canvas in jsdom.
vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn() }));

const id = 'owner-chat';
const file = {
	file_id: 'fixture-page.html',
	name: 'page.html',
	path: 'page.html',
	url: `/ocu/files/${id}/page.html`,
	type: 'html',
	mime: 'text/html',
	revision: 1,
	size: 128
};
const json = (body: object) =>
	new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json' }
	});
const i18n = writable({ t: (key: string) => key });
let component: Record<string, unknown> | undefined;
let controller: WorkspaceReconciliation;
let prior: {
	chatId: string;
	config: Parameters<typeof config.set>[0];
	settings: Parameters<typeof settings.set>[0];
	temporary: boolean;
	showControls: boolean;
	showArtifacts: boolean;
	showEmbeds: boolean;
	showCallOverlay: boolean;
	token: string | null;
};

beforeEach(() => {
	prior = {
		chatId: get(chatId),
		config: get(config),
		settings: get(settings),
		temporary: get(temporaryChatEnabled),
		showControls: get(showControls),
		showArtifacts: get(showArtifacts),
		showEmbeds: get(showEmbeds),
		showCallOverlay: get(showCallOverlay),
		token: localStorage.getItem('token')
	};
	chatId.set(id);
	config.set({ features: { enable_ocu_workspace: true } } as unknown as Parameters<
		typeof config.set
	>[0]);
	settings.set({});
	temporaryChatEnabled.set(false);
	showControls.set(false);
	showArtifacts.set(false);
	showEmbeds.set(false);
	showCallOverlay.set(false);
	ocuWorkspaces.set({});
	localStorage.setItem('token', 'owner-fixture');
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({
			matches: true,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {}
		}))
	);
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/prefs') && init?.method === 'PUT')
				return Promise.resolve(json({ prefs: JSON.parse(String(init.body)) }));
			if (url.includes(`/workspaces/${id}`))
				return Promise.resolve(
					json({
						chat_id: id,
						status: 'running',
						revision: 1,
						capabilities: ['prefs'],
						views: ['files'],
						base_url: '/ocu'
					})
				);
			if (url.includes(`/api/outputs/${id}`))
				return Promise.resolve(
					json({
						chat_id: id,
						revision: 1,
						files: [file],
						total: 1,
						next_cursor: null
					})
				);
			throw new Error(`Unexpected workspace request ${url}`);
		})
	);
	controller = createWorkspaceReconciliation({
		token: () => localStorage.token,
		available: () => true,
		translate: (key) => get(i18n).t(key)
	});
	controller.observe(id, true);
});

afterEach(async () => {
	if (component) await unmount(component);
	const generation = get(ocuWorkspaces)[id]?.generation;
	if (generation !== undefined) hydrateWorkspacePrefs(id, generation, {});
	controller.retire();
	await queueWorkspacePrefs(id, async () => {});
	component = undefined;
	chatId.set(prior.chatId);
	config.set(prior.config);
	settings.set(prior.settings);
	temporaryChatEnabled.set(prior.temporary);
	showControls.set(prior.showControls);
	showArtifacts.set(prior.showArtifacts);
	showEmbeds.set(prior.showEmbeds);
	showCallOverlay.set(prior.showCallOverlay);
	ocuWorkspaces.set({});
	if (prior.token === null) localStorage.removeItem('token');
	else localStorage.setItem('token', prior.token);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('mounted chat workspace policy', () => {
	it('auto-opens first output, keeps a user-closed panel closed with a change badge, then acknowledges explicit open', async () => {
		component = mount(ChatControls, {
			target: document.body,
			context: new Map<unknown, unknown>([
				['i18n', i18n],
				[WORKSPACE_RECONCILIATION, controller]
			]),
			props: {
				chatId: id,
				history: { messages: {}, currentId: null },
				files: [],
				modelId: null,
				eventTarget: new EventTarget(),
				submitPrompt: () => {},
				stopResponse: () => {},
				showMessage: () => {},
				ensureSavedChat: async () => id
			}
		});
		await tick();
		const first = beginGeneration(id);
		applyWorkspaceListing(id, first, [file], 1, null);
		await vi.waitFor(() => expect(get(showControls)).toBe(true));
		await vi.waitFor(() =>
			expect(document.querySelector('section[aria-label="Workspace Files"]')).not.toBeNull()
		);
		expect(document.body.textContent).not.toContain('Workspace changed');

		const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close workspace"]');
		expect(close).not.toBeNull();
		close!.click();
		await vi.waitFor(() => expect(get(showControls)).toBe(false));
		const next = beginGeneration(id);
		applyWorkspaceListing(id, next, [{ ...file, revision: 2 }], 2, null);
		await vi.waitFor(() => expect(document.body.textContent).toContain('Workspace changed'));
		expect(get(showControls)).toBe(false);
		expect(document.querySelector('section[aria-label="Workspace Files"]')).toBeNull();

		const action = document.querySelector<HTMLButtonElement>(
			'button[aria-label="Workspace Files"]'
		);
		expect(action).not.toBeNull();
		action!.click();
		await vi.waitFor(() => expect(get(showControls)).toBe(true));
		await vi.waitFor(() => expect(document.body.textContent).not.toContain('Workspace changed'));
	});
});
