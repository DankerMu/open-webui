import {
	expect,
	type APIResponse,
	type Locator,
	type Page,
	type Response,
	type Route
} from '@playwright/test';
import { context, evidence, recordsSince } from './ocu-fixtures';
import type { OfficeVersions } from '../src/lib/apis/ocu/office';
import type { OcuOfficeState } from '../src/lib/stores/ocu-office';

export type OfficeRecord = {
	method?: string;
	target?: string;
	token_ok?: boolean;
	identity?: { 'x-chat-id'?: string };
};

export async function workspaceFilesPanel(page: Page) {
	await expect(page.locator('#chat-pane')).toBeVisible();
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	const entry = page.getByRole('button', { name: 'Workspace Files', exact: true });
	await expect(panel.or(entry)).toBeVisible();
	if (await panel.isVisible()) return panel;
	await entry.click();
	await expect(panel).toBeVisible();
	return panel;
}

export async function openWorkspacePanel(page: Page, chatId: string) {
	await page.goto(`/c/${chatId}`);
	return workspaceFilesPanel(page);
}
export const readOfficeParent = (page: Page, chatId: string) =>
	page.evaluate(async (id) => {
		// Static imports in the Node runner cannot observe the browser's Vite store instance.
		const modulePath = '/src/lib/stores/ocu-office.ts';
		const { ocuOffice } = await import(/* @vite-ignore */ modulePath);
		let snapshot: OcuOfficeState | undefined;
		ocuOffice.subscribe((states: Record<string, OcuOfficeState>) => {
			snapshot = states[id];
		})();
		return snapshot;
	}, chatId);

export async function listedReport(page: Page, panel: Locator, chatId: string) {
	await panel.getByRole('button', { name: 'report.docx', exact: true }).click();
	const listing = await page.request.get(`/ocu/api/outputs/${chatId}`);
	expect(listing.status()).toBe(200);
	const file = (await listing.json()).files.find(
		(entry: { path: string; file_id: string; hash?: string }) => entry.path === 'report.docx'
	);
	expect(file.file_id).toBeTruthy();
	return file as { file_id: string; path: string; hash?: string };
}

export function officeCreatePath(chatId: string, fileId: string) {
	return `/ocu/api/office/${chatId}/documents/${encodeURIComponent(fileId)}/sessions`;
}

export function waitOriginResponse(page: Page, pathname: string, method: string) {
	return page.waitForResponse(
		(response) =>
			new URL(response.url()).origin === context.origin &&
			new URL(response.url()).pathname === pathname &&
			response.request().method() === method
	);
}

export async function clickEditAwaitCreate(page: Page, panel: Locator, sessionPath: string) {
	const sessionResponse = waitOriginResponse(page, sessionPath, 'POST');
	await panel
		.locator('[data-selected-bar]')
		.getByRole('button', { name: 'Edit', exact: true })
		.click();
	return sessionResponse;
}

async function readyOfficeModification(page: Page) {
	const control = page
		.frameLocator('iframe[title="Office editor: report.docx"]')
		.getByRole('button', { name: 'Simulate modification', exact: true });
	await expect(control).toBeEnabled();
	return control;
}

export async function simulateModificationAndSave(page: Page, chatId: string, sessionId: string) {
	const modification = await readyOfficeModification(page);
	await modification.click();
	await expect(page.locator('[data-office-status]').getByRole('status')).toHaveText('Unsaved');
	const savePath = `/ocu/api/office/${chatId}/sessions/${encodeURIComponent(sessionId)}/save`;
	const saveResponse = waitOriginResponse(page, savePath, 'POST');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	expect((await saveResponse).status()).toBe(202);
	return savePath;
}

type OfficeEditorOpening = {
	file: { file_id: string; path: string; hash?: string };
	session: { session_id: string };
	sessionCreatePath: string;
};

async function acceptOfficeEditor(
	page: Page,
	chatId: string,
	fileId: string,
	created: Response
): Promise<OfficeEditorOpening['session']> {
	expect(created.status()).toBe(201);
	const session = await created.json();
	await expect
		.poll(() => readOfficeParent(page, chatId))
		.toMatchObject({
			fileId,
			sessionId: session.session_id,
			state: 'editing',
			dirty: false,
			reason: null
		});
	return session;
}

export async function openOfficeEditor(
	page: Page,
	chatId: string,
	panel: Locator
): Promise<OfficeEditorOpening> {
	const file = await listedReport(page, panel, chatId);
	const sessionCreatePath = officeCreatePath(chatId, file.file_id);
	const created = await clickEditAwaitCreate(page, panel, sessionCreatePath);
	const session = await acceptOfficeEditor(page, chatId, file.file_id, created);
	return { file, session, sessionCreatePath };
}

export function chatOfficeRecords(offset: number, chatId: string) {
	const prefix = `/api/office/${chatId}/`;
	return recordsSince(offset).filter(
		(row: { target?: string }) => typeof row.target === 'string' && row.target.startsWith(prefix)
	);
}

export function expectAuthenticatedPost(arrivals: OfficeRecord[], target: string, chatId: string) {
	const matches = arrivals.filter((row) => row.method === 'POST' && row.target === target);
	expect(matches).toHaveLength(1);
	expect(matches[0]).toMatchObject({ token_ok: true, identity: { 'x-chat-id': chatId } });
}

export async function expectOfficeSaveContinuity(
	page: Page,
	chatId: string,
	opened: OfficeEditorOpening,
	generation: number,
	recordOffset: number,
	savePath: string
) {
	expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
	expect(await readOfficeParent(page, chatId)).toMatchObject({
		fileId: opened.file.file_id,
		sessionId: opened.session.session_id,
		state: 'editing',
		generation
	});
	const arrivals = chatOfficeRecords(recordOffset, chatId);
	expectAuthenticatedPost(arrivals, opened.sessionCreatePath.slice('/ocu'.length), chatId);
	expectAuthenticatedPost(arrivals, savePath.slice('/ocu'.length), chatId);
	return arrivals;
}

export function officeStatusPath(pathname: string, chatId: string) {
	const prefix = `/ocu/api/office/${chatId}/sessions/`;
	if (!pathname.startsWith(prefix)) return null;
	const remainder = pathname.slice(prefix.length);
	if (!remainder || remainder.includes('/')) return null;
	return decodeURIComponent(remainder);
}
type OfficeFrameIdentity = {
	sameNode: boolean;
	sameDocument: boolean;
	sameSurface: boolean;
	sameSurfaceParent: boolean;
	hasDocument: boolean;
	marker: string | null;
	src: string;
	sandbox: string | null;
	allow: string | null;
	loads: number;
};

type OfficeTrackingWindow = Window & {
	__ocuOfficeFrame?: HTMLIFrameElement;
	__ocuOfficeDocument?: Document;
	__ocuOfficeSurface?: Element;
	__ocuOfficeSurfaceParent?: Node | null;
};

export async function bindOfficeEditorTracking(page: Page) {
	await page.evaluate(() => {
		const remembered = window as OfficeTrackingWindow;
		const node = document.querySelector(
			'iframe[title="Office editor: report.docx"]'
		) as HTMLIFrameElement | null;
		if (!node) throw new Error('missing office editor iframe');
		const doc = node.contentDocument;
		if (!doc) throw new Error('missing office editor document');
		remembered.__ocuOfficeFrame = node;
		remembered.__ocuOfficeDocument = doc;
		const surface = document.querySelector('[aria-label="Selected workspace file"]');
		if (!surface) throw new Error('missing selected workspace file surface');
		remembered.__ocuOfficeSurface = surface;
		remembered.__ocuOfficeSurfaceParent = surface.parentNode;
		if (node.dataset.ocuOfficeTracked !== '1') {
			node.dataset.ocuOfficeTracked = '1';
			node.dataset.ocuOfficeLoads = '0';
			node.addEventListener('load', () => {
				node.dataset.ocuOfficeLoads = String(Number(node.dataset.ocuOfficeLoads ?? '0') + 1);
			});
		}
		if (!doc.documentElement.getAttribute('data-ocu-office-frame')) {
			doc.documentElement.setAttribute('data-ocu-office-frame', 'alive');
		}
	});
}

export async function officeEditorIdentity(page: Page): Promise<OfficeFrameIdentity> {
	return page.evaluate(() => {
		const remembered = window as OfficeTrackingWindow;
		const node = document.querySelector(
			'iframe[title="Office editor: report.docx"]'
		) as HTMLIFrameElement | null;
		const doc = node?.contentDocument ?? null;
		const surface = document.querySelector('[aria-label="Selected workspace file"]');
		return {
			sameNode: !!node && node === remembered.__ocuOfficeFrame,
			sameDocument: !!doc && doc === remembered.__ocuOfficeDocument,
			sameSurface: !!surface && surface === remembered.__ocuOfficeSurface,
			sameSurfaceParent: !!surface && surface.parentNode === remembered.__ocuOfficeSurfaceParent,
			hasDocument: !!doc,
			marker: doc?.documentElement.getAttribute('data-ocu-office-frame') ?? null,
			src: node?.getAttribute('src') ?? '',
			sandbox: node?.getAttribute('sandbox') ?? null,
			allow: node?.getAttribute('allow') ?? null,
			loads: Number(node?.dataset.ocuOfficeLoads ?? '0')
		};
	});
}

export function expectLiveEditor(identity: OfficeFrameIdentity, previous?: OfficeFrameIdentity) {
	expect(identity.hasDocument).toBe(true);
	expect(identity.sameNode).toBe(true);
	expect(identity.sameDocument).toBe(true);
	expect(identity.sameSurface).toBe(true);
	expect(identity.sameSurfaceParent).toBe(true);
	expect(identity.marker).toBe('alive');
	expect(identity.loads).toBe(0);
	if (previous) {
		expect(identity.src).toBe(previous.src);
		expect(identity.sandbox).toBe(previous.sandbox);
		expect(identity.allow).toBe(previous.allow);
	}
}

export async function maximizeOfficeEditor(page: Page, before: OfficeFrameIdentity) {
	await page.getByRole('button', { name: 'Maximize', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
	const during = await officeEditorIdentity(page);
	expectLiveEditor(during, before);
	return during;
}

export async function restoreOfficeEditor(page: Page, before: OfficeFrameIdentity) {
	await page.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Maximize', exact: true })).toBeVisible();
	const after = await officeEditorIdentity(page);
	expectLiveEditor(after, before);
	return after;
}

export async function officeLayoutGeometry(page: Page) {
	return page.evaluate(() => {
		const selected = document.querySelector('[aria-label="Selected workspace file"]');
		const panel = document.querySelector('[aria-label="Workspace Files"]');
		const save = [...document.querySelectorAll('button')].find(
			(item) => item.getAttribute('aria-label') === 'Save'
		);
		const restore = [...document.querySelectorAll('button')].find(
			(item) => item.getAttribute('aria-label') === 'Restore'
		);
		const maximize = [...document.querySelectorAll('button')].find(
			(item) => item.getAttribute('aria-label') === 'Maximize'
		);
		const resizer = document.getElementById('controls-resizer');
		const drawer = document.querySelector('.modal');
		const navbarTitle = [...document.querySelectorAll('nav div')].find((item) =>
			(item.textContent ?? '').includes('Workspace controls fixture')
		);
		if (!selected) return null;
		const selectedBox = selected.getBoundingClientRect();
		const panelBox = panel?.getBoundingClientRect();
		const overlayOwns = (top: Element | null) =>
			!!top && (top === selected || selected.contains(top));
		const controlHit = (x: number, y: number, expected: Element | null) => {
			if (!expected) return false;
			const top = document.elementFromPoint(x, y);
			return !!top && (top === expected || expected.contains(top));
		};
		const saveBox = save?.getBoundingClientRect();
		const restoreBox = restore?.getBoundingClientRect();
		const maximizeBox = maximize?.getBoundingClientRect();
		const navbarBox = navbarTitle?.getBoundingClientRect();
		const resizerBox = resizer?.getBoundingClientRect();
		return {
			selected: {
				left: selectedBox.left,
				top: selectedBox.top,
				right: selectedBox.right,
				bottom: selectedBox.bottom,
				width: selectedBox.width,
				height: selectedBox.height,
				fixed: getComputedStyle(selected).position === 'fixed',
				popover: selected.getAttribute('popover'),
				open: selected.matches(':popover-open')
			},
			panel: panelBox
				? { left: panelBox.left, right: panelBox.right, width: panelBox.width }
				: null,
			viewport: { width: window.innerWidth, height: window.innerHeight },
			drawer: !!drawer,
			saveHit: saveBox
				? controlHit(
						saveBox.left + saveBox.width / 2,
						saveBox.top + saveBox.height / 2,
						save ?? null
					)
				: false,
			restoreHit: restoreBox
				? controlHit(
						restoreBox.left + restoreBox.width / 2,
						restoreBox.top + restoreBox.height / 2,
						restore ?? null
					)
				: false,
			maximizeHit: maximizeBox
				? controlHit(
						maximizeBox.left + maximizeBox.width / 2,
						maximizeBox.top + maximizeBox.height / 2,
						maximize ?? null
					)
				: false,
			navbarCovered: navbarBox
				? overlayOwns(
						document.elementFromPoint(
							navbarBox.left + Math.min(24, navbarBox.width / 2),
							navbarBox.top + navbarBox.height / 2
						)
					)
				: false,
			resizerCovered: resizerBox
				? overlayOwns(
						document.elementFromPoint(
							resizerBox.left + resizerBox.width / 2,
							resizerBox.top + resizerBox.height / 2
						)
					)
				: false
		};
	});
}

type CapturedOfficeState = {
	chat_id: string;
	file_id: string;
	generation: number;
	session_id: string | null;
	state: string;
	dirty: boolean;
};

export async function expectOfficeControlHit(control: Locator) {
	const hit = await control.evaluate((element) => {
		const selected = document.querySelector('[aria-label="Selected workspace file"]');
		const iframe = selected?.querySelector('iframe[title^="Office editor:"]');
		const bounds = element.getBoundingClientRect();
		const top = document.elementFromPoint(
			bounds.left + bounds.width / 2,
			bounds.top + bounds.height / 2
		);
		return {
			inSelectedWrapper: !!selected?.contains(element),
			controlOwnsHit: !!top && (top === element || element.contains(top)),
			iframeOwnsHit: !!iframe && !!top && (top === iframe || iframe.contains(top))
		};
	});
	expect(hit.inSelectedWrapper).toBe(true);
	expect(hit.controlOwnsHit).toBe(true);
	expect(hit.iframeOwnsHit).toBe(false);
}

export async function startOfficeStateCapture(page: Page) {
	await page.evaluate(() => {
		const remembered = window as Window & {
			__ocuConflictStates?: CapturedOfficeState[];
			__ocuConflictListener?: (event: MessageEvent) => void;
		};
		const frame = document.querySelector(
			'iframe[title="Office editor: report.docx"]'
		) as HTMLIFrameElement | null;
		if (!frame?.contentWindow) throw new Error('missing office editor frame for state capture');
		remembered.__ocuConflictStates = [];
		remembered.__ocuConflictListener = (event) => {
			const data = event.data;
			if (
				event.origin !== window.location.origin ||
				event.source !== frame.contentWindow ||
				!data ||
				typeof data !== 'object' ||
				Array.isArray(data) ||
				data.type !== 'ocu:office-state' ||
				typeof data.chat_id !== 'string' ||
				typeof data.file_id !== 'string' ||
				typeof data.generation !== 'number' ||
				!(data.session_id === null || typeof data.session_id === 'string') ||
				typeof data.state !== 'string' ||
				typeof data.dirty !== 'boolean'
			)
				return;
			remembered.__ocuConflictStates?.push({
				chat_id: data.chat_id,
				file_id: data.file_id,
				generation: data.generation,
				session_id: data.session_id,
				state: data.state,
				dirty: data.dirty
			});
		};
		window.addEventListener('message', remembered.__ocuConflictListener);
	});
}

export async function stopOfficeStateCapture(page: Page) {
	await page.evaluate(() => {
		const remembered = window as Window & {
			__ocuConflictListener?: (event: MessageEvent) => void;
		};
		if (remembered.__ocuConflictListener)
			window.removeEventListener('message', remembered.__ocuConflictListener);
		delete remembered.__ocuConflictListener;
		delete (remembered as Window & { __ocuConflictStates?: CapturedOfficeState[] })
			.__ocuConflictStates;
	});
}

async function holdOfficeResponse(page: Page, path: string, method: string, ordinal = 1) {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let receive!: (response: APIResponse) => void;
	const response = new Promise<APIResponse>((resolve) => {
		receive = resolve;
	});
	let count = 0;
	let work: Promise<void> | undefined;
	const address = `${context.origin}${path}`;
	const handler = (route: Route) => {
		if (route.request().method() !== method || ++count !== ordinal) return route.continue();
		work = (async () => {
			const upstream = await route.fetch();
			receive(upstream);
			await gate;
			await route.fulfill({ response: upstream });
		})();
		return work;
	};
	await page.route(address, handler);
	return {
		response,
		release,
		async dispose() {
			release();
			await page.unroute(address, handler);
			await work;
		}
	};
}

async function showUnpublishedChoice(page: Page, editor: Locator, screenshot: string) {
	const dialog = page.getByRole('dialog', { name: 'Unpublished content' });
	await expect(dialog).toBeVisible();
	await expect(editor).toHaveCount(0);
	await page.screenshot({ path: `${evidence}/${screenshot}`, fullPage: true });
	return dialog;
}

function expectOfficeRequestOrder(arrivals: OfficeRecord[], sequence: Array<[string, string]>) {
	const expected = sequence.map(([method, path]) => [method, path.slice('/ocu'.length)]);
	expect(
		arrivals
			.filter((row) => expected.some(([, target]) => row.target === target))
			.map((row) => [row.method, row.target])
	).toEqual(expected);
}

async function openOfficeHistory(page: Page, versionsPath: string): Promise<OfficeVersions> {
	const response = waitOriginResponse(page, versionsPath, 'GET');
	await page
		.locator('[data-office-status]')
		.getByRole('button', { name: 'Version history', exact: true })
		.click();
	return (await response).json();
}

export async function restoreUnpublishedOffice(page: Page, chatId: string, recordOffset: number) {
	const panel = await openWorkspacePanel(page, chatId);
	const file = await listedReport(page, panel, chatId);
	const versionsPath = `/ocu/api/office/${chatId}/documents/${encodeURIComponent(file.file_id)}/versions`;
	const restorePath = `/ocu/api/office/${chatId}/documents/${encodeURIComponent(file.file_id)}/restore`;
	const createPath = officeCreatePath(chatId, file.file_id);
	const heldRead = await holdOfficeResponse(page, versionsPath, 'GET');
	const heldRestore = await holdOfficeResponse(page, restorePath, 'POST');
	const editor = panel.locator('iframe[title="Office editor: report.docx"]');
	try {
		const versionsResponse = waitOriginResponse(page, versionsPath, 'GET');
		await panel
			.locator('[data-selected-bar]')
			.getByRole('button', { name: 'Edit', exact: true })
			.click();
		const read = await heldRead.response;
		expect(read.status()).toBe(200);
		const before: OfficeVersions = await read.json();
		expect(before.open_session).toBeNull();
		const latest = before.versions[before.versions.length - 1];
		expect(latest).toMatchObject({ number: 2, source: 'autosave', published: false });
		await expect(editor).toHaveCount(0);
		expect(await readOfficeParent(page, chatId)).toBeUndefined();
		heldRead.release();
		await versionsResponse;
		const dialog = await showUnpublishedChoice(page, editor, 'office-unpublished-content.png');
		const restoring = waitOriginResponse(page, restorePath, 'POST');
		const created = waitOriginResponse(page, createPath, 'POST');
		await dialog
			.getByRole('button', { name: 'Restore the unpublished content', exact: true })
			.click();
		const accepted = await heldRestore.response;
		expect(accepted.status()).toBe(200);
		await expect(editor).toHaveCount(0);
		expect(await readOfficeParent(page, chatId)).toBeUndefined();
		const posts = chatOfficeRecords(recordOffset, chatId).filter((row) => row.method === 'POST');
		expect(posts.map((row) => row.target)).toEqual([restorePath.slice('/ocu'.length)]);
		heldRestore.release();
		const restoredResponse = await restoring;
		expect(restoredResponse.request().postDataJSON()).toEqual({ number: latest.number });
		expect(await restoredResponse.request().headerValue('X-Requested-With')).toBe('ocu-workspace');
		const restored = await restoredResponse.json();
		expect(restored).toMatchObject({ file_id: file.file_id, number: 3, published: true });
		const sessionResponse = await created;
		await acceptOfficeEditor(page, chatId, file.file_id, sessionResponse);
		await expect(dialog).toHaveCount(0);
		await expect(editor).toHaveAttribute('src', `/ocu/preview/${chatId}?embed=office`);
		const arrivals = chatOfficeRecords(recordOffset, chatId);
		expectOfficeRequestOrder(arrivals, [
			['GET', versionsPath],
			['POST', restorePath],
			['POST', createPath]
		]);
		expectAuthenticatedPost(arrivals, restorePath.slice('/ocu'.length), chatId);
		expectAuthenticatedPost(arrivals, createPath.slice('/ocu'.length), chatId);
		const history = await openOfficeHistory(page, versionsPath);
		expect(history.published_version).toBe(restored.number);
		expect(history.versions.find((version) => version.number === restored.number)).toMatchObject({
			source: 'restore',
			published: true,
			sha256: latest.sha256,
			size: latest.size
		});
		expect(history.versions.find((version) => version.number === latest.number)).toEqual(latest);
		const rows = page.getByRole('region', { name: 'Version history' }).locator('tbody tr');
		await expect(
			rows.filter({ has: page.locator('td').filter({ hasText: /^restore$/ }) })
		).toContainText('true');
		await readyOfficeModification(page);
	} finally {
		await heldRead.dispose();
		await heldRestore.dispose();
	}
}

export async function startAfterStaleOffice(page: Page, chatId: string, recordOffset: number) {
	const panel = await openWorkspacePanel(page, chatId);
	const file = await listedReport(page, panel, chatId);
	const versionsPath = `/ocu/api/office/${chatId}/documents/${encodeURIComponent(file.file_id)}/versions`;
	const createPath = officeCreatePath(chatId, file.file_id);
	const heldCreate = await holdOfficeResponse(page, createPath, 'POST');
	const heldRecheck = await holdOfficeResponse(page, versionsPath, 'GET', 2);
	const editor = panel.locator('iframe[title="Office editor: report.docx"]');
	try {
		const firstRead = waitOriginResponse(page, versionsPath, 'GET');
		const refusedCreation = waitOriginResponse(page, createPath, 'POST');
		await panel
			.locator('[data-selected-bar]')
			.getByRole('button', { name: 'Edit', exact: true })
			.click();
		const initial: OfficeVersions = await (await firstRead).json();
		expect(initial.open_session).toMatchObject({ state: 'editing', editor_ended: false });
		const latest = initial.versions[initial.versions.length - 1];
		expect(latest).toMatchObject({ number: 2, source: 'autosave', published: false });
		const refused = await heldCreate.response;
		expect(refused.status()).toBe(409);
		expect(await refused.json()).toEqual({ reason: 'unpublished_version' });
		await expect(editor).toHaveCount(1);
		const retiredFrame = await editor.elementHandle();
		expect(retiredFrame).not.toBeNull();
		const secondRead = waitOriginResponse(page, versionsPath, 'GET');
		heldCreate.release();
		expect((await refusedCreation).status()).toBe(409);
		const rechecked = await heldRecheck.response;
		expect(rechecked.status()).toBe(200);
		const fresh: OfficeVersions = await rechecked.json();
		expect(fresh.open_session).toBeNull();
		expect(fresh.versions.find((version) => version.number === latest.number)).toEqual(latest);
		await expect(editor).toHaveCount(0);
		expect(await retiredFrame!.evaluate((node) => node.isConnected)).toBe(false);
		await expect(
			page.getByText('Editing was refused: unpublished_version', { exact: true })
		).toHaveCount(0);
		expect((await readOfficeParent(page, chatId))?.state).not.toBe('refused');
		heldRecheck.release();
		await secondRead;
		const dialog = await showUnpublishedChoice(
			page,
			editor,
			'office-stale-unpublished-content.png'
		);
		const newCreation = waitOriginResponse(page, createPath, 'POST');
		await dialog.getByRole('button', { name: 'Start from the current file', exact: true }).click();
		const created = await newCreation;
		const session = await acceptOfficeEditor(page, chatId, file.file_id, created);
		expect(session.session_id).not.toBe(initial.open_session!.session_id);
		await expect(editor).toHaveCount(1);
		expect(await retiredFrame!.evaluate((node) => node.isConnected)).toBe(false);
		await expect(dialog).toHaveCount(0);
		const arrivals = chatOfficeRecords(recordOffset, chatId);
		expectOfficeRequestOrder(arrivals, [
			['GET', versionsPath],
			['POST', createPath],
			['GET', versionsPath],
			['POST', createPath]
		]);
		expect(arrivals.filter((row) => row.target?.endsWith('/restore'))).toEqual([]);
		const creations = arrivals.filter(
			(row) => row.method === 'POST' && row.target === createPath.slice('/ocu'.length)
		);
		expect(creations).toHaveLength(2);
		for (const arrival of creations)
			expect(arrival).toMatchObject({ token_ok: true, identity: { 'x-chat-id': chatId } });
		const history = await openOfficeHistory(page, versionsPath);
		expect(history.versions.find((version) => version.number === latest.number)).toEqual(latest);
		const rows = page.getByRole('region', { name: 'Version history' }).locator('tbody tr');
		await expect(
			rows.filter({ has: page.locator('td').filter({ hasText: /^autosave$/ }) })
		).toContainText('false');
		await readyOfficeModification(page);
		return createPath;
	} finally {
		await heldCreate.dispose();
		await heldRecheck.dispose();
	}
}
