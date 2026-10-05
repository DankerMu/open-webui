import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { openAuthenticatedPage, test } from './ocu-auth';
import { context, createScenarioChat, evidence, records, recordsSince } from './ocu-fixtures';
import type { OcuOfficeState } from '../src/lib/stores/ocu-office';

type OfficeRecord = {
	method?: string;
	target?: string;
	token_ok?: boolean;
	identity?: { 'x-chat-id'?: string };
};

async function workspaceFilesPanel(page: Page) {
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	if (!(await panel.isVisible())) {
		if (!(await page.locator('#controls-container').isVisible())) {
			await page.getByRole('button', { name: 'Controls', exact: true }).click();
		}
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
	}
	await expect(panel).toBeVisible();
	return panel;
}

async function openWorkspacePanel(page: Page, chatId: string) {
	await page.goto(`/c/${chatId}`);
	return workspaceFilesPanel(page);
}

function collectDiagnostics(page: Page) {
	const diagnostics: Array<{ kind: string; text: string; url: string }> = [];
	const onPageError = (error: Error) =>
		diagnostics.push({ kind: 'pageerror', text: String(error), url: '' });
	const onConsole = (message: { type(): string; text(): string; location(): { url: string } }) => {
		if (message.type() === 'error')
			diagnostics.push({ kind: 'console', text: message.text(), url: message.location().url });
	};
	page.on('pageerror', onPageError);
	page.on('console', onConsole);
	return {
		diagnostics,
		dispose() {
			page.off('pageerror', onPageError);
			page.off('console', onConsole);
		}
	};
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

function officeStatusPath(pathname: string, chatId: string) {
	const prefix = `/ocu/api/office/${chatId}/sessions/`;
	if (!pathname.startsWith(prefix)) return null;
	const remainder = pathname.slice(prefix.length);
	if (!remainder || remainder.includes('/')) return null;
	return decodeURIComponent(remainder);
}

test('Office first open reaches parent-accepted editing through the gateway', async ({ page }) => {
	const chatId = context.chats.office;
	expect(chatId, 'missing office scenario chat in OCU_E2E_CONTEXT').toBeTruthy();
	const observed = collectDiagnostics(page);
	try {
		await openAuthenticatedPage(page, `/c/${chatId}`);
		const panel = await workspaceFilesPanel(page);
		const file = await listedReport(page, panel, chatId);
		const sessionPath = officeCreatePath(chatId, file.file_id);
		const response = await clickEditAwaitCreate(page, panel, sessionPath);
		expect(response.status()).toBe(201);
		const session = await response.json();
		const frame = panel.locator('iframe[title="Office editor: report.docx"]');
		await expect(frame).toHaveAttribute('src', `/ocu/preview/${chatId}?embed=office`);
		await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
		await expect(frame).toHaveAttribute('allow', '');
		await expect
			.poll(() => readOfficeParent(page, chatId))
			.toMatchObject({
				fileId: file.file_id,
				sessionId: session.session_id,
				state: 'editing',
				dirty: false,
				workspaceChanged: false,
				reason: null
			});
		const accepted = await readOfficeParent(page, chatId);
		expect(accepted!.generation).toBeGreaterThan(0);
		expectAuthenticatedPost(
			records().filter(
				(row: OfficeRecord) =>
					row.method === 'POST' && row.target === sessionPath.slice('/ocu'.length)
			),
			sessionPath.slice('/ocu'.length),
			chatId
		);
		await expect(
			page
				.frameLocator('iframe[title="Office editor: report.docx"]')
				.getByRole('button', { name: 'Simulate modification', exact: true })
		).toBeEnabled();
		await page.screenshot({ path: `${evidence}/office-editing.png`, fullPage: true });
		fs.writeFileSync(
			`${evidence}/office-parent-acceptance.json`,
			JSON.stringify(
				{
					chatId,
					fileId: file.file_id,
					sessionId: session.session_id,
					sessionPath,
					status: response.status(),
					accepted,
					upstreamArrivals: 1,
					diagnostics: observed.diagnostics
				},
				null,
				2
			)
		);
		expect(observed.diagnostics).toEqual([]);
	} finally {
		observed.dispose();
	}
});

test('Office save waits for reported status confirmation after parent Save', async ({ page }) => {
	const recordOffset = fs.statSync(context.record).size;
	const observed = collectDiagnostics(page);
	await openAuthenticatedPage(page);
	const chatId = await createScenarioChat(page, 'office');
	const panel = await openWorkspacePanel(page, chatId);
	const file = await listedReport(page, panel, chatId);
	const sessionCreatePath = officeCreatePath(chatId, file.file_id);
	let boundSessionId: string | undefined;
	let bindSession = (sessionId: string) => {
		boundSessionId = sessionId;
	};
	const sessionBound = new Promise<string>((resolve) => {
		bindSession = (sessionId) => {
			boundSessionId = sessionId;
			resolve(sessionId);
		};
		if (boundSessionId) resolve(boundSessionId);
	});
	let releaseStatus = () => {};
	const statusReleased = new Promise<void>((resolve) => {
		releaseStatus = resolve;
	});
	const held: Array<Promise<void>> = [];
	const statusHandler = async (route: Route) => {
		const request = route.request();
		const address = new URL(request.url());
		const sessionId =
			address.origin === context.origin && request.method() === 'GET'
				? officeStatusPath(address.pathname, chatId)
				: null;
		if (!sessionId) {
			await route.continue();
			return;
		}
		const work = (async () => {
			if (sessionId !== (boundSessionId ?? (await sessionBound))) {
				await route.continue();
				return;
			}
			await statusReleased;
			await route.continue();
		})();
		held.push(work);
		await work;
	};
	const statusRoute = `${context.origin}/ocu/api/office/${chatId}/sessions/*`;
	await page.route(statusRoute, statusHandler);
	try {
		const created = await clickEditAwaitCreate(page, panel, sessionCreatePath);
		expect(created.status()).toBe(201);
		const session = await created.json();
		expect(session.session_id).toBeTruthy();
		bindSession(session.session_id);
		const editor = panel.locator('iframe[title="Office editor: report.docx"]');
		await expect(editor).toHaveAttribute('src', `/ocu/preview/${chatId}?embed=office`);
		await expect
			.poll(() => readOfficeParent(page, chatId))
			.toMatchObject({
				fileId: file.file_id,
				sessionId: session.session_id,
				state: 'editing',
				dirty: false,
				reason: null
			});
		const host = page.frameLocator('iframe[title="Office editor: report.docx"]');
		await expect(
			host.getByRole('button', { name: 'Simulate modification', exact: true })
		).toBeEnabled();
		await host.getByRole('button', { name: 'Simulate modification', exact: true }).click();
		await expect(page.locator('[data-office-status]').getByRole('status')).toHaveText('Unsaved');
		const savePath = `/ocu/api/office/${chatId}/sessions/${encodeURIComponent(session.session_id)}/save`;
		const statusPath = `/ocu/api/office/${chatId}/sessions/${encodeURIComponent(session.session_id)}`;
		const saveResponse = waitOriginResponse(page, savePath, 'POST');
		await panel.getByRole('button', { name: 'Save', exact: true }).click();
		const acceptedSave = await saveResponse;
		expect(acceptedSave.status()).toBe(202);
		const saveBody = await acceptedSave.json();
		expect(saveBody).toMatchObject({
			session_id: session.session_id,
			intent: 'publish'
		});
		expect(saveBody.save_seq).toBeGreaterThan(0);
		const saving = page.locator('[data-office-status]').getByRole('status');
		await expect(saving).toBeVisible();
		await expect(saving).toHaveText('Saving');
		await expect(saving).not.toHaveText('Saved');
		await expect(saving).not.toHaveText('Unsaved');
		await page.screenshot({ path: `${evidence}/office-saving-confirmation.png`, fullPage: true });
		const confirmingStatus = page.waitForResponse(
			(response) =>
				new URL(response.url()).origin === context.origin &&
				new URL(response.url()).pathname === statusPath &&
				response.request().method() === 'GET' &&
				response.status() === 200
		);
		releaseStatus();
		const status = await confirmingStatus;
		const statusBody = await status.json();
		expect(statusBody).toMatchObject({
			session_id: session.session_id,
			file_id: file.file_id,
			state: 'editing',
			last_published_seq: saveBody.save_seq,
			last_committed_seq: saveBody.save_seq
		});
		await expect(page.locator('[data-office-status]').getByRole('status')).toHaveText('Saved');
		await page.screenshot({ path: `${evidence}/office-saved.png`, fullPage: true });
		const arrivals = chatOfficeRecords(recordOffset, chatId);
		expectAuthenticatedPost(arrivals, savePath.slice('/ocu'.length), chatId);
		expectAuthenticatedPost(arrivals, sessionCreatePath.slice('/ocu'.length), chatId);
		expect(observed.diagnostics).toEqual([]);
	} finally {
		releaseStatus();
		if (!boundSessionId) bindSession('');
		await Promise.allSettled(held);
		await page.unroute(statusRoute, statusHandler);
		observed.dispose();
	}
});

test('Office unsupported creation keeps readonly preview and download without close', async ({
	page
}) => {
	const recordOffset = fs.statSync(context.record).size;
	const observed = collectDiagnostics(page);
	try {
		await openAuthenticatedPage(page);
		const chatId = await createScenarioChat(page, 'office_unsupported');
		const panel = await openWorkspacePanel(page, chatId);
		const file = await listedReport(page, panel, chatId);
		expect(file.hash).toMatch(/^[0-9a-f]{64}$/);
		const sessionCreatePath = officeCreatePath(chatId, file.file_id);
		const refused = await clickEditAwaitCreate(page, panel, sessionCreatePath);
		expect(refused.status()).toBe(415);
		expect(await refused.json()).toMatchObject({ reason: 'unsupported_type' });
		await expect(page.locator('[data-office-status]').getByRole('status')).toHaveText(
			'This file type cannot be edited'
		);
		await expect(panel.locator('iframe[title="Office editor: report.docx"]')).toHaveCount(0);
		await expect(panel.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
		const preview = page.frameLocator('iframe[title="Office preview: report.docx"]');
		await expect(preview.getByText('Verified Office document')).toBeVisible();
		await expect(panel.locator('iframe[title="Office preview: report.docx"]')).toHaveAttribute(
			'sandbox',
			'allow-scripts allow-same-origin allow-forms'
		);
		const downloadLink = panel.getByRole('link', { name: 'Download report.docx' });
		await expect(downloadLink).toHaveAttribute(
			'href',
			`/ocu/files/${chatId}/report.docx?download=1`
		);
		const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
		expect(download.suggestedFilename()).toBe('report.docx');
		const chunks: Buffer[] = [];
		const stream = await download.createReadStream();
		expect(stream).toBeTruthy();
		for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
		const downloaded = Buffer.concat(chunks);
		const fixtureBytes = fs.readFileSync(
			`${context.fixtures.replace(/fixtures\.json$/, 'valid.docx')}`
		);
		expect(downloaded.equals(fixtureBytes)).toBe(true);
		expect(createHash('sha256').update(downloaded).digest('hex')).toBe(file.hash);
		await page.screenshot({ path: `${evidence}/office-unsupported-preview.png`, fullPage: true });
		const arrivals = chatOfficeRecords(recordOffset, chatId);
		expectAuthenticatedPost(arrivals, sessionCreatePath.slice('/ocu'.length), chatId);
		expect(
			arrivals.filter(
				(row) =>
					row.method === 'POST' && typeof row.target === 'string' && row.target.endsWith('/close')
			)
		).toEqual([]);
		const expectedCreateUrl = new URL(sessionCreatePath, context.origin).href;
		expect(
			observed.diagnostics.filter((diagnostic) => {
				if (diagnostic.kind === 'pageerror') return true;
				return !(
					diagnostic.kind === 'console' &&
					diagnostic.url === expectedCreateUrl &&
					/^Failed to load resource: the server responded with a status of 415(?:\b|\s|\()/.test(
						diagnostic.text
					)
				);
			})
		).toEqual([]);
	} finally {
		observed.dispose();
	}
});
