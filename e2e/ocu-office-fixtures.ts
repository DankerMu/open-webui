import { expect, type Locator, type Page } from '@playwright/test';
import { context, recordsSince } from './ocu-fixtures';
import type { OcuOfficeState } from '../src/lib/stores/ocu-office';

type OfficeRecord = {
	method?: string;
	target?: string;
	token_ok?: boolean;
	identity?: { 'x-chat-id'?: string };
};

async function workspaceFilesPanel(page: Page) {
	await expect(page.locator('#chat-pane')).toBeVisible();
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	const entry = page.getByRole('button', { name: 'Workspace Files', exact: true });
	await expect(panel.or(entry)).toBeVisible();
	if (await panel.isVisible()) return panel;
	await entry.click();
	await expect(panel).toBeVisible();
	return panel;
}

async function openWorkspacePanel(page: Page, chatId: string) {
	await page.goto(`/c/${chatId}`);
	return workspaceFilesPanel(page);
}
const readOfficeParent = (page: Page, chatId: string) =>
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

async function listedReport(page: Page, panel: Locator, chatId: string) {
	await panel.getByRole('button', { name: 'report.docx', exact: true }).click();
	const listing = await page.request.get(`/ocu/api/outputs/${chatId}`);
	expect(listing.status()).toBe(200);
	const file = (await listing.json()).files.find(
		(entry: { path: string; file_id: string; hash?: string }) => entry.path === 'report.docx'
	);
	expect(file.file_id).toBeTruthy();
	return file as { file_id: string; path: string; hash?: string };
}

function officeCreatePath(chatId: string, fileId: string) {
	return `/ocu/api/office/${chatId}/documents/${encodeURIComponent(fileId)}/sessions`;
}

function waitOriginResponse(page: Page, pathname: string, method: string) {
	return page.waitForResponse(
		(response) =>
			new URL(response.url()).origin === context.origin &&
			new URL(response.url()).pathname === pathname &&
			response.request().method() === method
	);
}

async function clickEditAwaitCreate(page: Page, panel: Locator, sessionPath: string) {
	const sessionResponse = waitOriginResponse(page, sessionPath, 'POST');
	await panel
		.locator('[data-selected-bar]')
		.getByRole('button', { name: 'Edit', exact: true })
		.click();
	return sessionResponse;
}

async function simulateModificationAndSave(page: Page, chatId: string, sessionId: string) {
	const host = page.frameLocator('iframe[title="Office editor: report.docx"]');
	await expect(
		host.getByRole('button', { name: 'Simulate modification', exact: true })
	).toBeEnabled();
	await host.getByRole('button', { name: 'Simulate modification', exact: true }).click();
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

async function openOfficeEditor(
	page: Page,
	chatId: string,
	panel: Locator
): Promise<OfficeEditorOpening> {
	const file = await listedReport(page, panel, chatId);
	const sessionCreatePath = officeCreatePath(chatId, file.file_id);
	const created = await clickEditAwaitCreate(page, panel, sessionCreatePath);
	expect(created.status()).toBe(201);
	const session = await created.json();
	await expect
		.poll(() => readOfficeParent(page, chatId))
		.toMatchObject({
			fileId: file.file_id,
			sessionId: session.session_id,
			state: 'editing',
			dirty: false,
			reason: null
		});
	return { file, session, sessionCreatePath };
}

function chatOfficeRecords(offset: number, chatId: string) {
	const prefix = `/api/office/${chatId}/`;
	return recordsSince(offset).filter(
		(row: { target?: string }) => typeof row.target === 'string' && row.target.startsWith(prefix)
	);
}

function expectAuthenticatedPost(arrivals: OfficeRecord[], target: string, chatId: string) {
	const matches = arrivals.filter((row) => row.method === 'POST' && row.target === target);
	expect(matches).toHaveLength(1);
	expect(matches[0]).toMatchObject({ token_ok: true, identity: { 'x-chat-id': chatId } });
}

async function expectOfficeSaveContinuity(
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

function officeStatusPath(pathname: string, chatId: string) {
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

async function bindOfficeEditorTracking(page: Page) {
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

async function officeEditorIdentity(page: Page): Promise<OfficeFrameIdentity> {
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

function expectLiveEditor(identity: OfficeFrameIdentity, previous?: OfficeFrameIdentity) {
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

async function maximizeOfficeEditor(page: Page, before: OfficeFrameIdentity) {
	await page.getByRole('button', { name: 'Maximize', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
	const during = await officeEditorIdentity(page);
	expectLiveEditor(during, before);
	return during;
}

async function restoreOfficeEditor(page: Page, before: OfficeFrameIdentity) {
	await page.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Maximize', exact: true })).toBeVisible();
	const after = await officeEditorIdentity(page);
	expectLiveEditor(after, before);
	return after;
}

async function officeLayoutGeometry(page: Page) {
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

async function expectOfficeControlHit(control: Locator) {
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

async function startOfficeStateCapture(page: Page) {
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

async function stopOfficeStateCapture(page: Page) {
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

export {
	bindOfficeEditorTracking,
	chatOfficeRecords,
	clickEditAwaitCreate,
	expectAuthenticatedPost,
	expectLiveEditor,
	expectOfficeControlHit,
	expectOfficeSaveContinuity,
	listedReport,
	maximizeOfficeEditor,
	officeCreatePath,
	officeEditorIdentity,
	officeLayoutGeometry,
	officeStatusPath,
	openOfficeEditor,
	openWorkspacePanel,
	readOfficeParent,
	restoreOfficeEditor,
	simulateModificationAndSave,
	startOfficeStateCapture,
	stopOfficeStateCapture,
	waitOriginResponse,
	workspaceFilesPanel,
	type OfficeRecord
};
