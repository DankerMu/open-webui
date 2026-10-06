// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import { get } from 'svelte/store';
import { config } from '$lib/stores';
import { applyWorkspaceListing, ocuWorkspaces, selectWorkspaceView } from '$lib/stores/ocu';
import { ocuOffice } from '$lib/stores/ocu-office';
import type { OfficeVersions } from '$lib/apis/ocu/office';
import { chat, describeBody, i18n, json } from '../../../../test/ocu-workspace-fixtures';
import WorkspaceArtifact from './WorkspaceArtifact.svelte';
import { WORKSPACE_RECONCILIATION } from './workspace-reconciliation';
import { officeLeaveGuard } from './office-leave-guard';
import {
	OfficeArtifactHarness,
	editAction,
	editorFrame,
	namedButton,
	officeConfig,
	officeDocx,
	officeXlsx,
	htmlFile,
	publishedOfficeVersions,
	readyEditorFrame
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();
const versionsUrl = `/ocu/api/office/${chat}/documents/report.docx/versions`;
const restoreUrl = `/ocu/api/office/${chat}/documents/report.docx/restore`;
const resolveUrl = `/ocu/api/office/${chat}/sessions/ended-session/resolve`;
const unpublished: OfficeVersions = {
	file_id: 'report.docx',
	published_version: null,
	open_session: null,
	versions: [
		{
			number: 8,
			parent: null,
			source: 'autosave',
			sha256: 'a'.repeat(64),
			size: 2048,
			created_at: '2026-10-01T09:05:00Z',
			published: false
		}
	]
};
const ended: OfficeVersions = {
	...unpublished,
	open_session: {
		session_id: 'ended-session',
		state: 'conflict',
		reason: 'baseline_mismatch',
		editor_ended: true
	}
};
const choice = () => document.querySelector('[role="dialog"][aria-label="Unpublished content"]');

function deferred() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function deliver(resolve: (response: Response) => void, response: Response) {
	const consumed = vi.spyOn(response, 'json');
	resolve(response);
	await vi.waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
	await consumed.mock.results[0].value;
	await tick();
}

function mountArtifact() {
	const mounted = createClassComponent({
		component: WorkspaceArtifact,
		target: document.body,
		props: { chatId: chat, enabled: true },
		context: new Map<unknown, unknown>([
			['i18n', i18n],
			[WORKSPACE_RECONCILIATION, harness.controller]
		])
	});
	harness.controller.observe(chat, true);
	return mounted;
}

beforeEach(() => harness.install());
afterEach(() => {
	officeLeaveGuard.dispose();
	return harness.cleanup();
});

describe('Office preflight retired admission', () => {
	it('retires a pending preflight on synchronous selected-file disappearance and keeps the HTML workspace usable', async () => {
		const held = deferred();
		const fallback = harness.scenario;
		harness.scenario = (url, init) => (url === versionsUrl ? held.promise : fallback(url, init));
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		const retainedEdit = editAction()!;
		retainedEdit.click();
		expect(harness.officeRequests().map(({ url }) => url)).toEqual([versionsUrl]);
		const state = get(ocuWorkspaces)[chat];
		applyWorkspaceListing(chat, state.generation, [htmlFile], 2, null);
		config.set(officeConfig(true));
		retainedEdit.click();
		expect(harness.officeRequests().map(({ url }) => url)).toEqual([versionsUrl]);
		await deliver(held.resolve, json(unpublished));
		expect(editorFrame('report.docx')).toBeNull();
		expect(choice()).toBeNull();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(get(ocuOffice)[chat]).toBeUndefined();
		namedButton('page.html').click();
		await tick();
		expect(document.querySelector('iframe[title="page.html"]')?.getAttribute('sandbox')).toBe(
			'allow-scripts allow-forms'
		);
		expect(harness.officeRequests().map(({ url }) => url)).toEqual([versionsUrl]);
	});

	for (const operation of ['read', 'restore', 'resolve'] as const) {
		it.each([
			'selection',
			'selection roundtrip',
			'view',
			'office flag',
			'workspace flag',
			'base',
			'removal',
			'chat',
			'enabled',
			'unmount'
		] as const)(
			`ignores a delayed ${operation} and retained controls after %s`,
			async (transition) => {
				const held = deferred();
				harness.setListing([officeDocx, htmlFile], {
					...describeBody,
					views: ['files', 'browser']
				});
				const fallback = harness.scenario;
				harness.scenario = (url, init) => {
					if (url === versionsUrl)
						return operation === 'read'
							? held.promise
							: json(operation === 'resolve' ? ended : unpublished);
					if (url === restoreUrl || url === resolveUrl) return held.promise;
					return fallback(url, init);
				};
				const mounted = mountArtifact();
				let destroyed = false;
				try {
					await harness.ready('report.docx');
					namedButton('report.docx').click();
					await tick();
					const edit = editAction()!;
					edit.click();
					let retiredControl = edit;
					if (operation !== 'read') {
						await vi.waitFor(() =>
							expect(document.querySelector('[role="dialog"]')).not.toBeNull()
						);
						retiredControl = namedButton(
							operation === 'restore' ? 'Restore the unpublished content' : 'Save as new file'
						);
						retiredControl.click();
					}
					const expected =
						operation === 'read'
							? [['GET', versionsUrl]]
							: [
									['GET', versionsUrl],
									['POST', operation === 'restore' ? restoreUrl : resolveUrl]
								];
					expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual(
						expected
					);
					const transitions: Record<typeof transition, () => void> = {
						selection: () => namedButton('page.html').click(),
						'selection roundtrip': () => namedButton('page.html').click(),
						view: () => selectWorkspaceView(chat, 'browser'),
						'office flag': () => config.set(officeConfig(false)),
						'workspace flag': () => config.set(officeConfig(true, false)),
						base: () =>
							ocuWorkspaces.update((states) => ({
								...states,
								[chat]: { ...states[chat], baseUrl: undefined }
							})),
						removal: () => {
							const state = get(ocuWorkspaces)[chat];
							applyWorkspaceListing(chat, state.generation, [htmlFile], 2, null);
						},
						chat: () => mounted.$set({ chatId: 'other-chat' }),
						enabled: () => mounted.$set({ enabled: false }),
						unmount: () => {
							mounted.$destroy();
							destroyed = true;
						}
					};
					transitions[transition]();
					retiredControl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
					await tick();
					if (transition === 'selection roundtrip') {
						namedButton('report.docx').click();
						await tick();
					}
					await deliver(
						held.resolve,
						json(
							operation === 'read'
								? publishedOfficeVersions()
								: operation === 'restore'
									? { file_id: 'report.docx', number: 9, published: true }
									: {
											session_id: 'ended-session',
											state: 'closed',
											file_id: 'copy',
											path: 'copy.docx'
										}
						)
					);
					expect(editorFrame('report.docx')).toBeNull();
					expect(document.querySelector('[role="dialog"]')).toBeNull();
					expect(document.querySelector('[role="alert"]')).toBeNull();
					expect(get(ocuOffice)[chat]).toBeUndefined();
					expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual(
						expected
					);
				} finally {
					held.resolve(json(publishedOfficeVersions()));
					if (!destroyed) mounted.$destroy();
				}
			}
		);
	}

	it.each(['restore', 'resolve'] as const)(
		'keeps a pending %s frame-less after dismissal and completion',
		async (operation) => {
			const held = deferred();
			const fallback = harness.scenario;
			harness.scenario = (url, init) =>
				url === versionsUrl
					? json(operation === 'restore' ? unpublished : ended)
					: url === restoreUrl || url === resolveUrl
						? held.promise
						: fallback(url, init);
			await harness.open();
			await harness.ready('report.docx');
			namedButton('report.docx').click();
			await tick();
			editAction()!.click();
			await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
			namedButton(
				operation === 'restore' ? 'Restore the unpublished content' : 'Save as new file'
			).click();
			namedButton(operation === 'restore' ? 'Close' : 'Close conflict dialog').click();
			await tick();
			await deliver(
				held.resolve,
				json(
					operation === 'restore'
						? { file_id: 'report.docx', number: 9, published: true }
						: { session_id: 'ended-session', state: 'closed', file_id: 'copy', path: 'copy.docx' }
				)
			);
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(editorFrame('report.docx')).toBeNull();
			expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
				['GET', versionsUrl],
				['POST', operation === 'restore' ? restoreUrl : resolveUrl]
			]);
		}
	);

	it.each(['read', 'restore', 'resolve'] as const)(
		'preserves captured %s admission across same-ID reclassification',
		async (operation) => {
			const held = deferred();
			const fallback = harness.scenario;
			harness.scenario = (url, init) =>
				url === versionsUrl
					? operation === 'read'
						? held.promise
						: json(operation === 'restore' ? unpublished : ended)
					: url === restoreUrl || url === resolveUrl
						? held.promise
						: fallback(url, init);
			await harness.open();
			await harness.ready('report.docx');
			namedButton('report.docx').click();
			await tick();
			editAction()!.click();
			if (operation !== 'read') {
				await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
				namedButton(
					operation === 'restore' ? 'Restore the unpublished content' : 'Save as new file'
				).click();
			}
			const state = get(ocuWorkspaces)[chat];
			applyWorkspaceListing(
				chat,
				state.generation,
				[harness.reclassifiedFile('report.html', 'html', 'text/html', 9), htmlFile],
				9,
				null
			);
			await tick();
			expect(editAction()).toBeUndefined();
			await deliver(
				held.resolve,
				json(
					operation === 'read'
						? publishedOfficeVersions()
						: operation === 'restore'
							? { file_id: 'report.docx', number: 9, published: true }
							: { session_id: 'ended-session', state: 'closed', file_id: 'copy', path: 'copy.docx' }
				)
			);
			if (operation === 'resolve') {
				expect(editorFrame('report.html')).toBeNull();
				expect(get(ocuOffice)[chat]).toBeUndefined();
			} else {
				await readyEditorFrame('report.html');
				expect(get(ocuOffice)[chat].fileId).toBe('report.docx');
			}
			expect(document.querySelector('[role="dialog"]')).toBeNull();
			expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual(
				operation === 'read'
					? [['GET', versionsUrl]]
					: [
							['GET', versionsUrl],
							['POST', operation === 'restore' ? restoreUrl : resolveUrl]
						]
			);
		}
	);

	it('does not let an old read replace a newer selected-file choice', async () => {
		const old = deferred();
		harness.setListing([officeDocx, officeXlsx, htmlFile]);
		const fallback = harness.scenario;
		const sheetUrl = `/ocu/api/office/${chat}/documents/sheet.xlsx/versions`;
		harness.scenario = (url, init) =>
			url === versionsUrl
				? old.promise
				: url === sheetUrl
					? json({ ...unpublished, file_id: 'sheet.xlsx' })
					: fallback(url, init);
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		editAction()!.click();
		namedButton('sheet.xlsx').click();
		await tick();
		editAction()!.click();
		await vi.waitFor(() => expect(choice()).not.toBeNull());
		await deliver(old.resolve, json(ended));
		expect(choice()).not.toBeNull();
		expect(document.querySelector('[aria-label="Resolve conflict"]')).toBeNull();
		expect(editorFrame('report.docx')).toBeNull();
		namedButton('Start from the current file').click();
		await readyEditorFrame('sheet.xlsx');
		expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
			['GET', versionsUrl],
			['GET', sheetUrl]
		]);
	});
});

describe('Office hidden pending conflict', () => {
	it('retains resolve authority while dismissed and reopens a refused resolution without another read', async () => {
		const held = deferred();
		const fallback = harness.scenario;
		harness.scenario = (url, init) =>
			url === versionsUrl ? json(ended) : url === resolveUrl ? held.promise : fallback(url, init);
		await harness.open();
		await harness.ready('report.docx');
		namedButton('report.docx').click();
		await tick();
		editAction()!.click();
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
		namedButton('Save as new file').click();
		namedButton('Close conflict dialog').click();
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		namedButton('Resolve conflict').click();
		await tick();
		expect(namedButton('Save as new file').disabled).toBe(true);
		expect(editorFrame('report.docx')).toBeNull();
		await deliver(held.resolve, json({ reason: 'publish_timeout' }, 503));
		await vi.waitFor(() =>
			expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toBe(
				'Resolve was refused: publish_timeout'
			)
		);
		expect(namedButton('Save as new file').disabled).toBe(false);
		expect(get(ocuOffice)[chat]).toBeUndefined();
		expect(editorFrame('report.docx')).toBeNull();
		expect(harness.officeRequests().map(({ url, init }) => [init?.method, url])).toEqual([
			['GET', versionsUrl],
			['POST', resolveUrl]
		]);
	});
});
