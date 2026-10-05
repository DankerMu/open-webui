import { expect, vi, type MockInstance } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { config, settings } from '$lib/stores';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import {
	chat,
	describeBody,
	file,
	i18n,
	json,
	listing
} from '../../../../test/ocu-workspace-fixtures';
import {
	createWorkspaceReconciliation,
	WORKSPACE_RECONCILIATION,
	type WorkspaceReconciliation
} from './workspace-reconciliation';
import type { WorkspaceFile } from '$lib/apis/ocu';

export type OfficeOpenMessage = {
	type: string;
	chat_id: string;
	file_id: string;
	generation: number;
};

export type OfficeHandshake = {
	sent: MockInstance;
	openMessage: OfficeOpenMessage;
};

export const officeDocx: WorkspaceFile = file('report.docx');
export const officeXlsx: WorkspaceFile = {
	...file('sheet.xlsx', 'sheet.xlsx'),
	type: 'xlsx',
	mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
export const officePptx: WorkspaceFile = {
	...file('deck.pptx', 'deck.pptx'),
	type: 'pptx',
	mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
export const htmlFile: WorkspaceFile = file('page.html');
export const pdfFile: WorkspaceFile = {
	...file('brief.pdf', 'brief.pdf'),
	type: 'pdf',
	mime: 'application/pdf'
};
export const legacyDoc: WorkspaceFile = {
	...file('legacy.doc', 'legacy.doc'),
	type: 'doc',
	mime: 'application/msword'
};

export function officeConfig(office: boolean | undefined, workspace = true) {
	const features: Record<string, boolean> = { enable_ocu_workspace: workspace };
	if (office !== undefined) features.enable_ocu_office_edit = office;
	return { features } as unknown as Parameters<typeof config.set>[0];
}

export function namedControl(name: string) {
	return [...document.querySelectorAll('button')].find(
		(item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name
	) as HTMLButtonElement | undefined;
}

export function namedButton(name: string) {
	const button = namedControl(name);
	expect(button, name).toBeDefined();
	return button as HTMLButtonElement;
}

export function editAction() {
	const bar = document.querySelector('[data-selected-bar]');
	if (!bar) return undefined;
	return [...bar.querySelectorAll('button')].find(
		(item) => item.getAttribute('aria-label') === 'Edit' || item.textContent?.trim() === 'Edit'
	);
}

export function editorFrame(name: string) {
	return document.querySelector(
		`iframe[title="Office editor: ${name}"]`
	) as HTMLIFrameElement | null;
}

export function previewFrame(name: string) {
	return document.querySelector(
		`iframe[title="Office preview: ${name}"]`
	) as HTMLIFrameElement | null;
}

export const saveControl = () => namedControl('Save');
export const reopenControl = () => namedControl('Open again');

export class OfficeArtifactHarness {
	calls: Array<{ url: string; init?: RequestInit }> = [];
	component: Record<string, unknown> | undefined;
	controller!: WorkspaceReconciliation;
	scenario: (input: string, init?: RequestInit) => Response | Promise<Response> = () =>
		json(listing([officeDocx, htmlFile]));
	private detachController: (() => void) | undefined;
	private priorConfig!: Parameters<typeof config.set>[0];
	private priorSettings!: Parameters<typeof settings.set>[0];

	officeRequests() {
		return this.calls.filter((call) => call.url.includes('/ocu/api/office/'));
	}

	launchRequests() {
		return this.calls.filter(
			(call) => call.url.endsWith('/launch') && call.init?.method === 'POST'
		);
	}

	install() {
		this.priorConfig = get(config);
		this.priorSettings = get(settings);
		config.set(officeConfig(true));
		settings.set({
			iframeSandboxAllowScripts: false,
			iframeSandboxAllowSameOrigin: true,
			iframeSandboxAllowForms: true,
			iframeSandboxAllowDownloads: true
		});
		ocuWorkspaces.set({});
		ocuOffice.set({});
		document.body.replaceChildren();
		localStorage.setItem('token', 'fixture-session');
		this.calls = [];
		this.scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([officeDocx, htmlFile]));
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				this.calls.push({ url: String(input), init });
				return Promise.resolve(this.scenario(String(input), init));
			})
		);
		this.controller = createWorkspaceReconciliation({
			token: () => localStorage.token,
			available: () => true,
			translate: (key, params) => get(i18n).t(key, params)
		});
		this.detachController = this.controller.mount();
	}

	async cleanup() {
		if (this.component) await unmount(this.component);
		this.detachController?.();
		this.component = undefined;
		config.set(this.priorConfig);
		settings.set(this.priorSettings);
		ocuOffice.set({});
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		document.body.replaceChildren();
	}

	async open(enabled = true, id = chat) {
		this.component = mount(WorkspaceArtifact, {
			target: document.body,
			props: { chatId: id, enabled },
			context: new Map<unknown, unknown>([
				['i18n', i18n],
				[WORKSPACE_RECONCILIATION, this.controller]
			])
		});
		this.controller.observe(id, enabled);
		await vi.waitFor(() =>
			expect(document.body.querySelector('[aria-label="Workspace Files"]')).not.toBeNull()
		);
		return document.body;
	}

	async ready(text: string) {
		await vi.waitFor(() => expect(document.body.textContent).toContain(text));
	}

	async selectAndEdit(name: string) {
		namedButton(name).click();
		await tick();
		expect(editAction()).toBeDefined();
		editAction()!.click();
		await tick();
		const frame = editorFrame(name);
		expect(frame).not.toBeNull();
		return frame as HTMLIFrameElement;
	}

	handshake(frame: HTMLIFrameElement): OfficeHandshake {
		const sent = vi.spyOn(frame.contentWindow!, 'postMessage');
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: frame.contentWindow,
				data: { type: 'ocu:office-ready', chat_id: chat }
			})
		);
		expect(sent).toHaveBeenCalledTimes(1);
		const openMessage = sent.mock.calls[0][0] as OfficeOpenMessage;
		expect(sent.mock.calls[0][1]).toBe(window.location.origin);
		return { sent, openMessage };
	}

	async acceptEditing(frame: HTMLIFrameElement, sessionId = 'sess-1') {
		const { sent, openMessage } = this.handshake(frame);
		window.dispatchEvent(
			new MessageEvent('message', {
				origin: window.location.origin,
				source: frame.contentWindow,
				data: {
					type: 'ocu:office-state',
					chat_id: chat,
					file_id: officeDocx.file_id,
					generation: openMessage.generation,
					session_id: sessionId,
					state: 'editing',
					dirty: false,
					workspace_changed: false,
					reason: null
				}
			})
		);
		await tick();
		expect(get(ocuOffice)[chat]).toMatchObject({
			fileId: officeDocx.file_id,
			sessionId,
			state: 'editing',
			generation: openMessage.generation
		});
		return { sent, openMessage };
	}

	reclassifiedFile(path: string, type: string, mime: string, revision = 2): WorkspaceFile {
		return {
			file_id: officeDocx.file_id,
			path,
			name: path,
			url: `/ocu/files/${chat}/${path}`,
			type,
			mime,
			revision,
			size: officeDocx.size
		};
	}

	async refreshReclassifiedListing(next: WorkspaceFile) {
		const beforeOffice = this.officeRequests().length;
		const beforeLaunch = this.launchRequests().length;
		this.scenario = (input, init) =>
			input.endsWith('/prefs') && init?.method === 'PUT'
				? json({ prefs: JSON.parse(String(init.body)) })
				: input.includes('/workspaces/')
					? json(describeBody)
					: json(listing([next, htmlFile], null, next.revision));
		namedButton('Refresh workspace files').click();
		await this.ready(next.name);
		await tick();
		expect(get(ocuWorkspaces)[chat].selectedFileId).toBe(officeDocx.file_id);
		expect(get(ocuWorkspaces)[chat].files[0]).toMatchObject({
			file_id: officeDocx.file_id,
			path: next.path,
			type: next.type,
			mime: next.mime
		});
		expect(this.officeRequests()).toHaveLength(beforeOffice);
		expect(this.launchRequests()).toHaveLength(beforeLaunch);
	}
}
