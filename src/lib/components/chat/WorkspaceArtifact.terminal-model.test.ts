// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import { get } from 'svelte/store';
import { ocuWorkspaces } from '$lib/stores/ocu';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import {
	chat,
	i18n,
	file,
	describeBody,
	listing,
	json
} from '../../../../test/ocu-workspace-fixtures';
import {
	createWorkspaceReconciliation,
	WORKSPACE_RECONCILIATION,
	type WorkspaceReconciliation
} from './workspace-reconciliation';

let component: ReturnType<typeof createClassComponent> | undefined;
let controller: WorkspaceReconciliation;
let detach: () => void;
let savedView: 'files' | 'terminal';
const terminalUrl = `/ocu/preview/${chat}?embed=terminal`;

function button(name: string) {
	const found = [...document.querySelectorAll('button')].find(
		(node) => node.textContent?.trim() === name
	);
	expect(found, name).toBeDefined();
	return found!;
}
function frame(label: 'Terminal' | 'Browser') {
	return document.querySelector<HTMLIFrameElement>(`iframe[title="Workspace ${label}"]`);
}
async function open(modelId: string | null | undefined) {
	component = createClassComponent({
		component: WorkspaceArtifact,
		target: document.body,
		props: { chatId: chat, enabled: true, modelId },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, controller]
		])
	});
	controller.observe(chat, true);
	await vi.waitFor(() => expect(button('Files')).toBeDefined());
}
async function show(view: 'Files' | 'Terminal' | 'Browser') {
	await vi.waitFor(() => expect(button(view).disabled).toBe(false));
	button(view).click();
	await tick();
}

beforeEach(() => {
	ocuWorkspaces.set({});
	savedView = 'files';
	vi.stubGlobal(
		'fetch',
		vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
			const target = String(url);
			if (target.endsWith('/prefs'))
				return Promise.resolve(json({ prefs: JSON.parse(String(init?.body)) }));
			if (target.includes('/workspaces/'))
				return Promise.resolve(
					json({
						...describeBody,
						views: ['files', 'browser', 'terminal'],
						prefs: { view: savedView, open: true }
					})
				);
			return Promise.resolve(json(listing([file('page.html')])));
		})
	);
	controller = createWorkspaceReconciliation({
		token: () => 'fixture-session',
		available: () => true,
		translate: (key, params) => get(i18n).t(key, params)
	});
	detach = controller.mount();
});
afterEach(async () => {
	component?.$destroy();
	component = undefined;
	detach();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

it('keeps the model captured at terminal open until the terminal is reopened', async () => {
	await open('model-a');
	await show('Terminal');
	const opened = frame('Terminal')!;
	expect(opened.getAttribute('src')).toBe(`${terminalUrl}&model=model-a`);

	component!.$set({ modelId: 'model-b' });
	await tick();
	expect(frame('Terminal')).toBe(opened);
	expect(opened.getAttribute('src')).toBe(`${terminalUrl}&model=model-a`);

	await show('Browser');
	expect(frame('Browser')!.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=browser`);
	await show('Terminal');
	expect(frame('Terminal')!.getAttribute('src')).toBe(`${terminalUrl}&model=model-b`);

	component!.$set({ modelId: 'model-c' });
	await show('Files');
	expect(frame('Terminal')).toBeNull();
	await show('Terminal');
	expect(frame('Terminal')!.getAttribute('src')).toBe(`${terminalUrl}&model=model-c`);
});

it("uses the mounted chat's model when its saved view is the terminal", async () => {
	savedView = 'terminal';
	await open('chat-b-model');
	await vi.waitFor(() => expect(frame('Terminal')).not.toBeNull());
	expect(frame('Terminal')!.getAttribute('src')).toBe(`${terminalUrl}&model=chat-b-model`);
});

it.each([null, undefined, ''])(
	'opens the terminal without a model parameter for %j',
	async (model) => {
		await open(model);
		await show('Terminal');
		expect(frame('Terminal')!.getAttribute('src')).toBe(terminalUrl);
	}
);
