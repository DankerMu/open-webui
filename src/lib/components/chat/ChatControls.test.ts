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
	applyDescribe,
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
import {
	OfficeArtifactHarness,
	expectOfficeCloseHeld,
	namedButton,
	officeCommandCalls,
	postOfficeState
} from './workspace-artifact-office-test';
import { officeLeaveGuard, officeLeaveSnapshot } from './office-leave-guard';
import { closingStatus, deliver } from './office-leave-guard-test';
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

function mountControls(workspaceController: WorkspaceReconciliation) {
	return mount(ChatControls, {
		target: document.body,
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, workspaceController]
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
}

describe('mounted chat workspace policy', () => {
	it('preserves a hydrated open workspace through initial desktop layout replacement without persisting a close', async () => {
		const generation = beginGeneration(id);
		applyDescribe(id, generation, {
			status: 'running',
			capabilities: ['prefs'],
			views: ['files'],
			base_url: '/ocu'
		});
		applyWorkspaceListing(id, generation, [file], 1, null);
		hydrateWorkspacePrefs(id, generation, {
			open: true,
			view: 'files',
			selected_file_id: file.file_id
		});
		showControls.set(true);
		component = mountControls(controller);
		await tick();
		await queueWorkspacePrefs(id, async () => {});
		const closeWrites = vi
			.mocked(fetch)
			.mock.calls.filter(
				([input, init]) =>
					String(input).endsWith('/prefs') &&
					init?.method === 'PUT' &&
					JSON.parse(String(init.body)).open === false
			);
		expect(closeWrites).toEqual([]);
		expect(document.querySelector('section[aria-label="Workspace Files"]')).not.toBeNull();
		expect(document.querySelector('[aria-label="Resize panel"]')).not.toBeNull();
		expect(get(ocuWorkspaces)[id].open).toBe(true);
		expect(get(showControls)).toBe(true);
	});

	it('auto-opens first output, keeps a user-closed panel closed with a change badge, then acknowledges explicit open', async () => {
		component = mountControls(controller);
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

	it.each([
		{ large: true, trigger: 'button' },
		{ large: false, trigger: 'button' },
		{ large: true, trigger: 'external controls' },
		{ large: false, trigger: 'external controls' },
		{ large: true, trigger: 'external workspace' },
		{ large: false, trigger: 'external workspace' },
		{ large: true, trigger: 'resizer' },
		{ large: false, trigger: 'escape' },
		{ large: false, trigger: 'backdrop' }
	])(
		'retains the original Office frame until broker close acceptance ($large, $trigger)',
		async ({ large, trigger }) => {
			const office = new OfficeArtifactHarness();
			office.install();
			vi.stubGlobal(
				'matchMedia',
				vi.fn((query: string) => ({
					matches: large,
					media: query,
					addEventListener: () => {},
					removeEventListener: () => {}
				}))
			);
			const held = Promise.withResolvers<Response>();
			const fallback = office.scenario;
			const statusUrl = `/ocu/api/office/${id}/sessions/sess-1`;
			office.scenario = (url, init) => (url === statusUrl ? held.promise : fallback(url, init));
			showControls.set(true);
			try {
				office.component = mountControls(office.controller);
				office.controller.observe(id, true);
				await office.ready('report.docx');
				const frame = await office.selectAndEdit('report.docx');
				const originalWindow = frame.contentWindow;
				const { sent, openMessage } = await office.acceptEditing(frame);
				postOfficeState(frame, openMessage.generation, { dirty: true });
				await tick();
				if (trigger === 'button') namedButton('Close workspace').click();
				else if (trigger === 'external controls') showControls.set(false);
				else if (trigger === 'external workspace')
					ocuWorkspaces.update((states) => ({
						...states,
						[id]: { ...states[id], open: false, userClosed: true }
					}));
				else if (trigger === 'escape')
					window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
				else if (trigger === 'backdrop')
					document
						.querySelector('.modal')!
						.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
				else {
					document
						.querySelector('[aria-label="Resize panel"]')!
						.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0 }));
					window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1000 }));
				}
				await tick();
				expectOfficeCloseHeld(frame, originalWindow, sent, openMessage.generation, id);
				expect(office.officeRequests().filter(({ url }) => url === statusUrl)).toHaveLength(1);
				await deliver(held, closingStatus());
				await vi.waitFor(() => expect(frame.isConnected).toBe(false));
				expect(get(officeLeaveSnapshot).reports[id].outcome).toBe('saving');
				expect(officeCommandCalls(sent)).toHaveLength(1);
			} finally {
				officeLeaveGuard.dispose();
				await office.cleanup();
			}
		}
	);
});
