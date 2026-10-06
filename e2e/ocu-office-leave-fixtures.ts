import { expect, type Locator, type Page, type Response, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import type { OfficeSessionStatus, OfficeVersions } from '../src/lib/apis/ocu/office';
import { context, evidence, recordsSince } from './ocu-fixtures';
import {
	bindOfficeEditorTracking,
	chatOfficeRecords,
	clickEditAwaitCreate,
	expectLiveEditor,
	officeCreatePath,
	officeEditorIdentity,
	officeStatusPath,
	openOfficeEditor,
	openWorkspacePanel,
	readOfficeParent,
	waitOriginResponse,
	workspaceFilesPanel,
	type OfficeFrameIdentity,
	type OfficeRecord
} from './ocu-office-fixtures';

const FRAME_SELECTOR = 'iframe[title="Office editor: report.docx"]';
const SAVING_REPORT = 'Saving Office changes: report.docx';
const SAVED_REPORT = 'Office changes saved: report.docx';
const SAVED_AS_REPORT = 'Office changes saved as a new file: report (2).docx';

export type ListedOfficeFile = {
	file_id: string;
	path: string;
	url: string;
	hash: string;
	size: number;
	bytes: Buffer;
};

export type DirtyOfficeOwner = {
	sessionId: string;
	generation: number;
	fileId: string;
};

export type WorkspaceOfficeSurface = {
	fileNames: string[];
	selected: string[];
	editorTitles: string[];
	status: string | null;
	dialogs: string[];
};

type OfficeTrackingWindow = Window & { __ocuLeaveGuardWindow?: Window };

export function officeClosePath(chatId: string, sessionId: string) {
	return `/ocu/api/office/${chatId}/sessions/${encodeURIComponent(sessionId)}/close`;
}

export function expectedCloseBytes(original: Buffer, saveSeq: number) {
	return Buffer.concat([original, Buffer.from(`-close-${saveSeq}`)]);
}

export function expectedSaveAsBytes(original: Buffer) {
	return Buffer.concat([original, Buffer.from('-saved-as')]);
}

export function officeContentHash(bytes: Buffer) {
	return createHash('sha256').update(bytes).digest('hex');
}

function listedFileUrl(chatId: string, path: string) {
	return `/ocu/files/${encodeURIComponent(chatId)}/${path
		.split('/')
		.map((segment) =>
			encodeURIComponent(segment).replace(
				/[!'()*]/g,
				(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
			)
		)
		.join('/')}`;
}

export async function captureListedOfficeFile(
	page: Page,
	chatId: string,
	path = 'report.docx'
): Promise<ListedOfficeFile> {
	const listing = await page.request.get(`/ocu/api/outputs/${chatId}`);
	expect(listing.status()).toBe(200);
	const entry = (await listing.json()).files.find(
		(file: { path: string; file_id: string; url: string; hash: string; size: number }) =>
			file.path === path
	);
	expect(entry?.file_id).toBeTruthy();
	const canonical = listedFileUrl(chatId, path);
	expect(entry.url).toBe(canonical);
	const fetched = await page.request.get(entry.url);
	expect(fetched.status()).toBe(200);
	const bytes = Buffer.from(await fetched.body());
	expect(officeContentHash(bytes)).toBe(entry.hash);
	expect(bytes.length).toBe(entry.size);
	return {
		file_id: entry.file_id,
		path: entry.path,
		url: entry.url,
		hash: entry.hash,
		size: entry.size,
		bytes
	};
}

export async function expectPublishedOfficeContent(
	page: Page,
	chatId: string,
	fileId: string,
	expected: Buffer,
	url: string
) {
	const digest = officeContentHash(expected);
	const listing = await page.request.get(`/ocu/api/outputs/${chatId}`);
	expect(listing.status()).toBe(200);
	const entry = (await listing.json()).files.find(
		(file: { file_id: string; url: string; hash: string; size: number; path: string }) =>
			file.file_id === fileId
	);
	expect(entry).toBeTruthy();
	expect(entry.url).toBe(url);
	expect(entry.hash).toBe(digest);
	expect(entry.size).toBe(expected.length);
	const fetched = await page.request.get(url);
	expect(fetched.status()).toBe(200);
	const body = Buffer.from(await fetched.body());
	expect(body.equals(expected)).toBe(true);
	expect(officeContentHash(body)).toBe(digest);
	const versionsResponse = await page.request.get(
		`/ocu/api/office/${chatId}/documents/${encodeURIComponent(fileId)}/versions`
	);
	expect(versionsResponse.status()).toBe(200);
	const versions: OfficeVersions = await versionsResponse.json();
	expect(versions.file_id).toBe(fileId);
	expect(versions.published_version).not.toBeNull();
	const published = versions.versions.find(
		(version) => version.number === versions.published_version
	);
	expect(published).toMatchObject({ sha256: digest, size: expected.length, published: true });
}

function closeArrivals(offset: number, chatId: string, sessionId: string) {
	const target = officeClosePath(chatId, sessionId).slice('/ocu'.length);
	return recordsSince(offset).filter(
		(row: OfficeRecord) => row.method === 'POST' && row.target === target
	);
}

function ownerStatusReads(offset: number, chatId: string, sessionId: string) {
	return recordsSince(offset).filter(
		(row: OfficeRecord) =>
			row.method === 'GET' &&
			typeof row.target === 'string' &&
			officeStatusPath(`/ocu${row.target}`, chatId) === sessionId
	);
}

function mutationPosts(offset: number, chatId: string, suffix: '/save' | '/resolve') {
	return chatOfficeRecords(offset, chatId).filter(
		(row) => row.method === 'POST' && typeof row.target === 'string' && row.target.endsWith(suffix)
	);
}

export async function holdOfficeCloseBeforeBroker(page: Page, pathname: string) {
	let releaseRoute!: () => void;
	let enteredRoute!: () => void;
	let arrivals = 0;
	const release = new Promise<void>((resolve) => {
		releaseRoute = resolve;
	});
	const entered = new Promise<void>((resolve) => {
		enteredRoute = resolve;
	});
	const address = `${context.origin}${pathname}`;
	let work: Promise<void> | undefined;
	const handler = (route: Route) => {
		if (route.request().method() !== 'POST') return route.continue();
		arrivals += 1;
		if (arrivals !== 1) return route.continue();
		work = (async () => {
			enteredRoute();
			await release;
			const response = await route.fetch();
			await route.fulfill({ response });
		})();
		return work;
	};
	await page.route(address, handler);
	return {
		waitUntilHeld: () => entered,
		release: () => releaseRoute(),
		arrivals: () => arrivals,
		async dispose() {
			releaseRoute();
			await page.unroute(address, handler);
			await work;
		}
	};
}

export function watchTerminalOfficeStatus(page: Page, pathname: string, sessionId: string) {
	let terminal: OfficeSessionStatus | undefined;
	const failures: string[] = [];
	const handler = async (response: Response) => {
		if (
			new URL(response.url()).origin !== context.origin ||
			new URL(response.url()).pathname !== pathname ||
			response.request().method() !== 'GET'
		)
			return;
		if (response.status() !== 200) {
			failures.push(`owner status response ${response.status()}`);
			return;
		}
		try {
			const status = (await response.json()) as OfficeSessionStatus;
			if (status?.session_id === sessionId && status.state === 'closed') terminal = status;
		} catch (error) {
			failures.push(`owner status parse failed: ${String(error)}`);
		}
	};
	page.on('response', handler);
	return {
		read: () => terminal,
		failures: () => failures,
		dispose: () => page.off('response', handler)
	};
}

export async function dirtyAcceptedOfficeEditor(
	page: Page,
	chatId: string
): Promise<DirtyOfficeOwner> {
	const parent = await readOfficeParent(page, chatId);
	expect(parent).toMatchObject({ state: 'editing', dirty: false });
	expect(parent!.sessionId).toBeTruthy();
	const modification = page
		.frameLocator(FRAME_SELECTOR)
		.getByRole('button', { name: 'Simulate modification', exact: true });
	await expect(modification).toBeEnabled();
	await modification.click();
	await expect
		.poll(() => readOfficeParent(page, chatId))
		.toMatchObject({
			sessionId: parent!.sessionId,
			generation: parent!.generation,
			state: 'editing',
			dirty: true
		});
	await expect(page.locator('[data-office-status]').getByRole('status')).toHaveText('Unsaved');
	return {
		sessionId: parent!.sessionId!,
		generation: parent!.generation,
		fileId: parent!.fileId!
	};
}

async function rememberLiveOfficeWindow(page: Page) {
	await page.evaluate((selector) => {
		const frame = document.querySelector(selector) as HTMLIFrameElement | null;
		if (!frame?.contentWindow) throw new Error('missing live Office frame window before departure');
		(window as OfficeTrackingWindow).__ocuLeaveGuardWindow = frame.contentWindow;
	}, FRAME_SELECTOR);
}

async function expectHeldCloseStillOwnsLiveFrame(page: Page, before: OfficeFrameIdentity) {
	expectLiveEditor(await officeEditorIdentity(page), before);
	expect(
		await page.evaluate((selector) => {
			const frame = document.querySelector(selector) as HTMLIFrameElement | null;
			return frame?.contentWindow === (window as OfficeTrackingWindow).__ocuLeaveGuardWindow;
		}, FRAME_SELECTOR)
	).toBe(true);
	await expect(page.getByRole('region', { name: 'Workspace Files' })).toBeVisible();
	await expect(
		page.locator('[data-sonner-toast]').filter({ hasText: SAVING_REPORT })
	).toBeVisible();
	expectLiveEditor(await officeEditorIdentity(page), before);
}

async function expectAuthenticatedCloseArrival(offset: number, chatId: string, sessionId: string) {
	await expect.poll(() => closeArrivals(offset, chatId, sessionId)).toHaveLength(1);
	expect(closeArrivals(offset, chatId, sessionId)[0]).toMatchObject({
		token_ok: true,
		identity: { 'x-chat-id': chatId }
	});
}

export async function departHeldOfficeClose(
	page: Page,
	chatId: string,
	owner: DirtyOfficeOwner,
	recordOffset: number,
	before: OfficeFrameIdentity,
	action: () => Promise<unknown> | unknown,
	savingScreenshot: string
) {
	await rememberLiveOfficeWindow(page);
	const path = officeClosePath(chatId, owner.sessionId);
	const statusPath = path.slice(0, -'/close'.length);
	const gate = await holdOfficeCloseBeforeBroker(page, path);
	const terminalStatus = watchTerminalOfficeStatus(page, statusPath, owner.sessionId);
	let closeResponseFailure: unknown;
	const closeResponse = waitOriginResponse(page, path, 'POST').catch((error) => {
		closeResponseFailure = error;
		return undefined;
	});
	let actionFailure: unknown;
	try {
		const actionPromise = Promise.resolve(action()).catch((error) => {
			actionFailure = error;
		});
		await expect.poll(() => gate.arrivals()).toBe(1);
		await gate.waitUntilHeld();
		expect(closeArrivals(recordOffset, chatId, owner.sessionId)).toHaveLength(0);
		await expectHeldCloseStillOwnsLiveFrame(page, before);
		expect(closeArrivals(recordOffset, chatId, owner.sessionId)).toHaveLength(0);
		await page.screenshot({ path: `${evidence}/${savingScreenshot}`, fullPage: true });
		gate.release();
		const acceptedClose = await closeResponse;
		expect(closeResponseFailure).toBeUndefined();
		expect(acceptedClose?.status()).toBe(202);
		const closeBody = await acceptedClose!.json();
		expect(closeBody).toMatchObject({ session_id: owner.sessionId, state: 'closed' });
		expect(closeBody.save_seq).toBeGreaterThan(0);
		await actionPromise;
		expect(actionFailure).toBeUndefined();
		await expect
			.poll(() => terminalStatus.read())
			.toMatchObject({ session_id: owner.sessionId, state: 'closed' });
		expect(terminalStatus.failures()).toEqual([]);
		await expectAuthenticatedCloseArrival(recordOffset, chatId, owner.sessionId);
		await expect
			.poll(() => ownerStatusReads(recordOffset, chatId, owner.sessionId).length)
			.toBeGreaterThan(0);
		expect(mutationPosts(recordOffset, chatId, '/save')).toEqual([]);
		expect(gate.arrivals()).toBe(1);
		const observed = terminalStatus.read()!;
		expect(observed.save_seq).toBe(closeBody.save_seq);
		expect(observed).toMatchObject({
			session_id: owner.sessionId,
			save_seq: closeBody.save_seq,
			last_committed_seq: closeBody.save_seq,
			last_published_seq: closeBody.save_seq
		});
		return { closePath: path, terminal: observed };
	} finally {
		gate.release();
		terminalStatus.dispose();
		await gate.dispose();
	}
}

export async function sidebarChatLink(page: Page, chatId: string) {
	const open = page.getByRole('button', { name: 'Open Sidebar', exact: true });
	if (await open.isVisible()) await open.click();
	const history = page.getByRole('navigation', { name: 'Chat history', exact: true });
	await expect(history).toBeVisible();
	const link = history.locator(`a[href="/c/${chatId}"]`).first();
	await expect(link).toBeVisible();
	return link;
}

export async function clickSidebarChat(page: Page, chatId: string) {
	const link = await sidebarChatLink(page, chatId);
	await Promise.all([page.waitForURL(new RegExp(`/c/${chatId}$`)), link.click()]);
}

export async function snapshotWorkspaceOfficeSurface(
	page: Page,
	panel: Locator
): Promise<WorkspaceOfficeSurface> {
	const files = panel.getByRole('list', { name: 'Workspace file list' });
	const empty = panel.getByText('No workspace files yet.', { exact: true });
	const fileNames = (await files.count())
		? await files
				.getByRole('button')
				.evaluateAll((nodes) =>
					nodes.map((node) => node.getAttribute('aria-label') ?? '').filter(Boolean)
				)
		: [];
	if (!(await files.count())) await expect(empty).toBeVisible();
	const selected = await panel
		.locator('ul[aria-label="Workspace file list"] [aria-pressed="true"]')
		.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute('aria-label') ?? '').filter(Boolean)
		);
	const editorTitles = await page
		.locator('iframe[title^="Office editor:"]')
		.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('title') ?? ''));
	const statusLocator = page.locator('[data-office-status]').getByRole('status');
	const status = (await statusLocator.count()) ? await statusLocator.textContent() : null;
	const dialogs = await page.getByRole('dialog').allTextContents();
	return { fileNames, selected, editorTitles, status, dialogs };
}

export async function expectNoNativeUnloadPrompt(page: Page, reload: () => Promise<unknown>) {
	let unexpected: string | undefined;
	const onDialog = async (dialog: { type(): string; dismiss(): Promise<void> }) => {
		unexpected = dialog.type();
		await dialog.dismiss();
	};
	page.on('dialog', onDialog);
	try {
		await reload();
		expect(unexpected).toBeUndefined();
	} finally {
		page.off('dialog', onDialog);
	}
}

async function prepareDirtyEditor(page: Page, chatId: string) {
	const panel = await openWorkspacePanel(page, chatId);
	const original = await captureListedOfficeFile(page, chatId);
	const opened = await openOfficeEditor(page, chatId, panel);
	expect(opened.file.file_id).toBe(original.file_id);
	const owner = await dirtyAcceptedOfficeEditor(page, chatId);
	expect(owner.sessionId).toBe(opened.session.session_id);
	expect(owner.fileId).toBe(original.file_id);
	await bindOfficeEditorTracking(page);
	return { panel, original, opened, owner, before: await officeEditorIdentity(page) };
}

export async function walkOfficeRefresh(page: Page, chatId: string) {
	const panel = await openWorkspacePanel(page, chatId);
	const original = await captureListedOfficeFile(page, chatId);
	const opened = await openOfficeEditor(page, chatId, panel);
	expect(opened.file.file_id).toBe(original.file_id);
	await page.screenshot({
		path: `${evidence}/office-leave-refresh-clean-editor.png`,
		fullPage: true
	});
	await expectNoNativeUnloadPrompt(page, () => page.reload());
	await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
	await page.screenshot({
		path: `${evidence}/office-leave-refresh-after-clean.png`,
		fullPage: true
	});
	await expectNoNativeUnloadPrompt(page, () => page.reload());
	await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
	await page.screenshot({ path: `${evidence}/office-leave-refresh-absent.png`, fullPage: true });
	const reopenedPanel = await workspaceFilesPanel(page);
	const reopenPath = officeCreatePath(chatId, original.file_id);
	const reopened = waitOriginResponse(page, reopenPath, 'POST');
	await clickEditAwaitCreate(page, reopenedPanel, reopenPath);
	const reopenResponse = await reopened;
	expect([200, 201]).toContain(reopenResponse.status());
	const reopenedSession = await reopenResponse.json();
	await expect
		.poll(() => readOfficeParent(page, chatId))
		.toMatchObject({
			fileId: original.file_id,
			sessionId: reopenedSession.session_id,
			state: 'editing',
			dirty: false
		});
	const dirty = await dirtyAcceptedOfficeEditor(page, chatId);
	await bindOfficeEditorTracking(page);
	const beforeRefresh = await officeEditorIdentity(page);
	await page.screenshot({ path: `${evidence}/office-leave-refresh-dirty.png`, fullPage: true });
	const dialog = page.waitForEvent('dialog');
	const reload = page.evaluate(() => location.reload());
	const beforeUnload = await dialog;
	expect(beforeUnload.type()).toBe('beforeunload');
	await beforeUnload.dismiss();
	await reload;
	fs.writeFileSync(
		`${evidence}/office-leave-refresh-dialog.json`,
		JSON.stringify({ type: beforeUnload.type(), dismissed: true })
	);
	expectLiveEditor(await officeEditorIdentity(page), beforeRefresh);
	await expect
		.poll(() => readOfficeParent(page, chatId))
		.toMatchObject({
			fileId: original.file_id,
			sessionId: dirty.sessionId,
			generation: dirty.generation,
			dirty: true
		});
	const modification = page
		.frameLocator(FRAME_SELECTOR)
		.getByRole('button', { name: 'Simulate modification', exact: true });
	await expect(modification).toBeEnabled();
	await modification.click();
	await expect
		.poll(() => readOfficeParent(page, chatId))
		.toMatchObject({
			sessionId: dirty.sessionId,
			generation: dirty.generation,
			dirty: true
		});
	await page.screenshot({
		path: `${evidence}/office-leave-refresh-dismissed.png`,
		fullPage: true
	});
}

export async function walkDirtySidebarClose(page: Page, chatId: string, recordOffset: number) {
	const prepared = await prepareDirtyEditor(page, chatId);
	await page.screenshot({
		path: `${evidence}/office-leave-sidebar-editing.png`,
		fullPage: true
	});
	const closed = await departHeldOfficeClose(
		page,
		chatId,
		prepared.owner,
		recordOffset,
		prepared.before,
		() =>
			page
				.getByRole('button', { name: 'Close workspace', exact: true })
				.click({ noWaitAfter: true }),
		'office-leave-sidebar-saving.png'
	);
	await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Workspace Files' })).toHaveCount(0);
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: SAVED_REPORT })).toBeVisible();
	await page.screenshot({ path: `${evidence}/office-leave-sidebar-saved.png`, fullPage: true });
	expect(closed.terminal.saved_as).toBeNull();
	expect(closed.terminal.file_id).toBe(prepared.original.file_id);
	await expectPublishedOfficeContent(
		page,
		chatId,
		prepared.original.file_id,
		expectedCloseBytes(prepared.original.bytes, closed.terminal.save_seq),
		prepared.original.url
	);
}

export async function walkDirtyChatSwitch(
	page: Page,
	chatA: string,
	chatB: string,
	recordOffset: number
) {
	const baselinePanel = await openWorkspacePanel(page, chatB);
	await expect(baselinePanel.getByText('No workspace files yet.', { exact: true })).toBeVisible();
	const baseline = await snapshotWorkspaceOfficeSurface(page, baselinePanel);
	expect(baseline.fileNames).toEqual([]);
	expect(baseline.editorTitles).toEqual([]);
	expect(baseline.dialogs.map((text) => text.trim()).filter(Boolean)).toEqual([]);
	const prepared = await prepareDirtyEditor(page, chatA);
	await page.screenshot({ path: `${evidence}/office-leave-switch-a-editing.png`, fullPage: true });
	const otherLink = await sidebarChatLink(page, chatB);
	const closed = await departHeldOfficeClose(
		page,
		chatA,
		prepared.owner,
		recordOffset,
		prepared.before,
		() => otherLink.click({ noWaitAfter: true }),
		'office-leave-switch-saving.png'
	);
	await expect(page).toHaveURL(new RegExp(`/c/${chatB}$`));
	await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: SAVED_REPORT })).toHaveCount(
		0
	);
	const panelB = await workspaceFilesPanel(page);
	await expect(panelB.getByText('No workspace files yet.', { exact: true })).toBeVisible();
	const isolated = await snapshotWorkspaceOfficeSurface(page, panelB);
	expect(isolated).toEqual(baseline);
	expect(isolated.fileNames).not.toContain('report.docx');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.screenshot({ path: `${evidence}/office-leave-switch-b.png`, fullPage: true });
	const returnOffset = fs.statSync(context.record).size;
	await clickSidebarChat(page, chatA);
	const returnedPanel = await workspaceFilesPanel(page);
	await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
	await expect(page.locator('[data-sonner-toast]').filter({ hasText: SAVED_REPORT })).toBeVisible();
	await expect(
		returnedPanel.getByRole('button', { name: 'report.docx', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	const returnedListing = await page.request.get(`/ocu/api/outputs/${chatA}`);
	expect(returnedListing.status()).toBe(200);
	expect(
		(await returnedListing.json()).files.find(
			(file: { file_id: string }) => file.file_id === prepared.original.file_id
		)
	).toMatchObject({
		file_id: prepared.original.file_id,
		path: 'report.docx',
		url: prepared.original.url
	});
	expect(
		recordsSince(returnOffset).filter(
			(row: OfficeRecord) =>
				row.method === 'POST' &&
				row.target === prepared.opened.sessionCreatePath.slice('/ocu'.length)
		)
	).toEqual([]);
	await page.screenshot({ path: `${evidence}/office-leave-switch-a-returned.png`, fullPage: true });
	expect(closed.terminal.file_id).toBe(prepared.original.file_id);
	await expectPublishedOfficeContent(
		page,
		chatA,
		prepared.original.file_id,
		expectedCloseBytes(prepared.original.bytes, closed.terminal.save_seq),
		prepared.original.url
	);
	const reopen = waitOriginResponse(page, prepared.opened.sessionCreatePath, 'POST');
	await clickEditAwaitCreate(page, returnedPanel, prepared.opened.sessionCreatePath);
	expect((await reopen).status()).toBe(201);
}

export async function walkAutomaticSaveAs(page: Page, chatId: string, recordOffset: number) {
	const prepared = await prepareDirtyEditor(page, chatId);
	const openedListing = await page.request.get(`/ocu/api/outputs/${chatId}`);
	expect(openedListing.status()).toBe(200);
	expect(
		((await openedListing.json()).files as Array<{ path: string }>).some(
			(file) => file.path === 'report.docx'
		)
	).toBe(false);
	await page.screenshot({ path: `${evidence}/office-leave-save-as-open.png`, fullPage: true });
	const closed = await departHeldOfficeClose(
		page,
		chatId,
		prepared.owner,
		recordOffset,
		prepared.before,
		() =>
			page
				.getByRole('button', { name: 'Close workspace', exact: true })
				.click({ noWaitAfter: true }),
		'office-leave-save-as-saving.png'
	);
	expect(mutationPosts(recordOffset, chatId, '/resolve')).toEqual([]);
	const terminalStatus = closed.terminal;
	expect(terminalStatus.saved_as).toMatchObject({ path: 'report (2).docx' });
	expect(terminalStatus.saved_as!.file_id).not.toBe(prepared.original.file_id);
	expect(terminalStatus.file_id).toBe(terminalStatus.saved_as!.file_id);
	await expect(page.locator(FRAME_SELECTOR)).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Workspace Files' })).toHaveCount(0);
	await expect(
		page.locator('[data-sonner-toast]').filter({ hasText: SAVED_AS_REPORT })
	).toBeVisible();
	await page.screenshot({ path: `${evidence}/office-leave-save-as-saved.png`, fullPage: true });
	await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
	const panel = await workspaceFilesPanel(page);
	const refresh = panel.getByRole('button', { name: 'Refresh workspace files', exact: true });
	const listingCycle = page.waitForResponse(
		(response) =>
			new URL(response.url()).origin === context.origin &&
			new URL(response.url()).pathname === `/ocu/api/outputs/${chatId}` &&
			response.request().method() === 'GET'
	);
	await refresh.click();
	await listingCycle;
	await expect(panel.getByRole('button', { name: 'report (2).docx', exact: true })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'report.docx', exact: true })).toHaveCount(0);
	const listing = await page.request.get(`/ocu/api/outputs/${chatId}`);
	expect(listing.status()).toBe(200);
	const files = (await listing.json()).files as Array<{
		file_id: string;
		path: string;
		url: string;
	}>;
	const saved = files.find((file) => file.path === 'report (2).docx');
	expect(saved).toBeTruthy();
	expect(files.some((file) => file.path === 'report.docx')).toBe(false);
	expect(saved!.file_id).toBe(terminalStatus.saved_as!.file_id);
	expect(saved!.path).toBe(terminalStatus.saved_as!.path);
	expect(saved!.path).toBe('report (2).docx');
	expect(saved!.url).toBe(listedFileUrl(chatId, 'report (2).docx'));
	await page.screenshot({ path: `${evidence}/office-leave-save-as-listing.png`, fullPage: true });
	await expectPublishedOfficeContent(
		page,
		chatId,
		saved!.file_id,
		expectedSaveAsBytes(prepared.original.bytes),
		saved!.url
	);
}
