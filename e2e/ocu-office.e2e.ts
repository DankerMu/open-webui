import { expect, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { openAuthenticatedPage, test } from './ocu-auth';
import { context, createScenarioChat, evidence, records } from './ocu-fixtures';
import {
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
	restoreUnpublishedOffice,
	startAfterStaleOffice,
	startOfficeStateCapture,
	stopOfficeStateCapture,
	waitOriginResponse,
	workspaceFilesPanel,
	type OfficeRecord
} from './ocu-office-fixtures';

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

test('Office maximize keeps the same live editor document and usable overlay Save', async ({
	page
}) => {
	const recordOffset = fs.statSync(context.record).size;
	const observed = collectDiagnostics(page);
	await page.setViewportSize({ width: 1280, height: 800 });
	try {
		await openAuthenticatedPage(page);
		const chatId = await createScenarioChat(page, 'office');
		const panel = await openWorkspacePanel(page, chatId);
		const opened = await openOfficeEditor(page, chatId, panel);
		const { session, sessionCreatePath } = opened;
		const editor = page.locator('iframe[title="Office editor: report.docx"]');
		await expect(editor).toHaveAttribute('src', `/ocu/preview/${chatId}?embed=office`);
		await expect(editor).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
		await expect(editor).toHaveAttribute('allow', '');
		const accepted = await readOfficeParent(page, chatId);
		expect(accepted!.generation).toBeGreaterThan(0);
		await bindOfficeEditorTracking(page);
		const before = await officeEditorIdentity(page);
		expectLiveEditor(before);
		const sidebarGeometry = await officeLayoutGeometry(page);
		expect(sidebarGeometry?.selected.popover).toBeNull();
		expect(sidebarGeometry?.selected.open).toBe(false);
		await page.screenshot({ path: `${evidence}/office-maximize-sidebar.png`, fullPage: true });
		await maximizeOfficeEditor(page, before);
		expect((await readOfficeParent(page, chatId))?.state).toBe('editing');
		const overlayGeometry = await officeLayoutGeometry(page);
		expect(overlayGeometry?.selected.popover).toBe('manual');
		expect(overlayGeometry?.selected.open).toBe(true);
		expect(overlayGeometry?.selected.fixed).toBe(true);
		expect(overlayGeometry?.selected.width).toBeGreaterThan(sidebarGeometry!.panel!.width);
		expect(overlayGeometry?.selected.left).toBeLessThan(sidebarGeometry!.panel!.left);
		expect(overlayGeometry?.saveHit).toBe(true);
		expect(overlayGeometry?.restoreHit).toBe(true);
		expect(overlayGeometry?.navbarCovered).toBe(true);
		expect(overlayGeometry?.resizerCovered).toBe(true);
		await page.screenshot({ path: `${evidence}/office-maximize-overlay.png`, fullPage: true });
		const savePath = await simulateModificationAndSave(page, chatId, session.session_id);
		await expect(page.locator('[data-office-status]').getByRole('status')).toHaveText('Saved');
		await restoreOfficeEditor(page, before);
		const restoredGeometry = await officeLayoutGeometry(page);
		expect(restoredGeometry?.selected.popover).toBeNull();
		expect(restoredGeometry?.selected.open).toBe(false);
		expect(restoredGeometry?.maximizeHit).toBe(true);
		await test.info().attach('office-maximize-geometry', {
			body: JSON.stringify({
				sidebar: sidebarGeometry,
				overlay: overlayGeometry,
				restored: restoredGeometry
			}),
			contentType: 'application/json'
		});
		const arrivals = await expectOfficeSaveContinuity(
			page,
			chatId,
			opened,
			accepted!.generation,
			recordOffset,
			savePath
		);
		expect(
			arrivals.filter(
				(row) => row.method === 'POST' && row.target === sessionCreatePath.slice('/ocu'.length)
			)
		).toHaveLength(1);
		expect(observed.diagnostics).toEqual([]);
	} finally {
		observed.dispose();
	}
});

test('Office maximize overlay remains reachable in the narrow Drawer layout', async ({ page }) => {
	const recordOffset = fs.statSync(context.record).size;
	const observed = collectDiagnostics(page);
	await page.setViewportSize({ width: 390, height: 844 });
	try {
		await openAuthenticatedPage(page);
		const chatId = await createScenarioChat(page, 'office');
		const panel = await openWorkspacePanel(page, chatId);
		expect(
			await page.evaluate(() => ({
				width: window.innerWidth,
				height: window.innerHeight,
				drawer: !!document.querySelector('.modal')
			}))
		).toEqual({ width: 390, height: 844, drawer: true });
		const opened = await openOfficeEditor(page, chatId, panel);
		const accepted = await readOfficeParent(page, chatId);
		await bindOfficeEditorTracking(page);
		const before = await officeEditorIdentity(page);
		expectLiveEditor(before);
		await maximizeOfficeEditor(page, before);
		expect((await readOfficeParent(page, chatId))?.state).toBe('editing');
		const overlayGeometry = await officeLayoutGeometry(page);
		expect(overlayGeometry?.drawer).toBe(true);
		expect(overlayGeometry?.selected.popover).toBe('manual');
		expect(overlayGeometry?.selected.open).toBe(true);
		expect(overlayGeometry?.selected.fixed).toBe(true);
		expect(overlayGeometry?.selected.width).toBeGreaterThan(overlayGeometry!.viewport.width * 0.9);
		expect(overlayGeometry?.saveHit).toBe(true);
		expect(overlayGeometry?.restoreHit).toBe(true);
		await page.screenshot({ path: `${evidence}/office-maximize-narrow.png`, fullPage: true });
		const savePath = await simulateModificationAndSave(page, chatId, opened.session.session_id);
		await expect(page.locator('[data-office-status]').getByRole('status')).toHaveText('Saved');
		await restoreOfficeEditor(page, before);
		const restoredGeometry = await officeLayoutGeometry(page);
		expect(restoredGeometry?.selected.popover).toBeNull();
		expect(restoredGeometry?.selected.open).toBe(false);
		expect(restoredGeometry?.maximizeHit).toBe(true);
		await expectOfficeSaveContinuity(
			page,
			chatId,
			opened,
			accepted!.generation,
			recordOffset,
			savePath
		);
		await test.info().attach('office-maximize-narrow-geometry', {
			body: JSON.stringify({ overlay: overlayGeometry, restored: restoredGeometry }),
			contentType: 'application/json'
		});
		expect(observed.diagnostics).toEqual([]);
	} finally {
		observed.dispose();
	}
});

test('Office conflict save-as keeps the live original editor and adds a deduplicated File', async ({
	page
}) => {
	const recordOffset = fs.statSync(context.record).size;
	const observed = collectDiagnostics(page);
	await page.setViewportSize({ width: 390, height: 844 });
	try {
		await openAuthenticatedPage(page);
		const chatId = await createScenarioChat(page, 'office_conflict');
		const panel = await openWorkspacePanel(page, chatId);
		await expect(page.locator('.modal')).toBeVisible();
		const opened = await openOfficeEditor(page, chatId, panel);
		const initialListingResponse = await page.request.get(`/ocu/api/outputs/${chatId}`);
		expect(initialListingResponse.status()).toBe(200);
		const initialListing = await initialListingResponse.json();
		const original = initialListing.files.find(
			(file: { file_id: string }) => file.file_id === opened.file.file_id
		);
		expect(original).toMatchObject({
			file_id: opened.file.file_id,
			path: 'report.docx',
			name: 'report.docx'
		});
		expect(original.hash).toMatch(/^[a-f0-9]{64}$/);
		expect(Number.isSafeInteger(original.revision)).toBe(true);
		expect(Number.isSafeInteger(initialListing.revision)).toBe(true);
		const accepted = await readOfficeParent(page, chatId);
		expect(accepted).toMatchObject({
			fileId: original.file_id,
			sessionId: opened.session.session_id,
			state: 'editing',
			dirty: false,
			reason: null
		});
		expect(accepted!.generation).toBeGreaterThan(0);
		await bindOfficeEditorTracking(page);
		const before = await officeEditorIdentity(page);
		expectLiveEditor(before);
		await maximizeOfficeEditor(page, before);
		await startOfficeStateCapture(page);
		const savePath = await simulateModificationAndSave(page, chatId, opened.session.session_id);
		await expect
			.poll(() => readOfficeParent(page, chatId))
			.toMatchObject({
				fileId: original.file_id,
				sessionId: opened.session.session_id,
				generation: accepted!.generation,
				state: 'conflict',
				dirty: true,
				reason: 'baseline_mismatch'
			});

		const dialog = page.getByRole('dialog', { name: 'Resolve conflict' });
		const saveAs = dialog.getByRole('button', { name: 'Save as new file', exact: true });
		const overwrite = dialog.getByRole('button', { name: 'Overwrite workspace file', exact: true });
		await expect(dialog).toBeVisible();
		await expect(saveAs).toBeVisible();
		await expect(saveAs).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(panel).toBeVisible();
		expectLiveEditor(await officeEditorIdentity(page), before);
		expect(
			chatOfficeRecords(recordOffset, chatId).filter((row) => row.target?.endsWith('/resolve'))
		).toHaveLength(0);
		await page.getByRole('button', { name: 'Resolve conflict', exact: true }).click();
		await expect(dialog).toBeVisible();
		await expect(saveAs).toBeFocused();
		await expectOfficeControlHit(saveAs);
		await expectOfficeControlHit(overwrite);
		await expectOfficeControlHit(
			dialog.getByRole('button', { name: 'Close conflict dialog', exact: true })
		);
		await page.screenshot({ path: `${evidence}/office-conflict.png`, fullPage: true });

		const resolvePath = `/ocu/api/office/${chatId}/sessions/${encodeURIComponent(opened.session.session_id)}/resolve`;
		const resolveRequest = page.waitForRequest(
			(request) =>
				new URL(request.url()).origin === context.origin &&
				new URL(request.url()).pathname === resolvePath &&
				request.method() === 'POST'
		);
		const resolveResponse = waitOriginResponse(page, resolvePath, 'POST');
		await page.keyboard.press('Enter');
		const [request, response] = await Promise.all([resolveRequest, resolveResponse]);
		expect(response.status()).toBe(200);
		const [requestedWith, contentType] = await Promise.all([
			request.headerValue('X-Requested-With'),
			request.headerValue('Content-Type')
		]);
		expect(requestedWith).toBe('ocu-workspace');
		expect(contentType).toContain('application/json');
		expect(request.postDataJSON()).toEqual({ action: 'save_as' });
		const resolved = await response.json();
		expect(resolved).toMatchObject({
			session_id: opened.session.session_id,
			state: 'editing',
			path: 'report (2).docx'
		});
		expect(resolved.file_id).not.toBe(original.file_id);
		await expect
			.poll(() => readOfficeParent(page, chatId))
			.toMatchObject({
				fileId: original.file_id,
				sessionId: opened.session.session_id,
				generation: accepted!.generation,
				state: 'editing',
				dirty: false,
				reason: null
			});
		await expect(dialog).toHaveCount(0);
		const captured = await page.evaluate(
			() =>
				(
					window as Window & {
						__ocuConflictStates?: Array<{
							chat_id: string;
							file_id: string;
							generation: number;
							session_id: string | null;
							state: string;
							dirty: boolean;
						}>;
					}
				).__ocuConflictStates ?? []
		);
		const conflictAt = captured.findIndex(
			(message) =>
				message.chat_id === chatId &&
				message.file_id === original.file_id &&
				message.generation === accepted!.generation &&
				message.session_id === opened.session.session_id &&
				message.state === 'conflict' &&
				message.dirty
		);
		expect(conflictAt).toBeGreaterThanOrEqual(0);
		expect(captured.slice(conflictAt + 1)).toContainEqual({
			chat_id: chatId,
			file_id: original.file_id,
			generation: accepted!.generation,
			session_id: opened.session.session_id,
			state: 'editing',
			dirty: false
		});
		const afterResolve = await officeEditorIdentity(page);
		expectLiveEditor(afterResolve, before);
		const restored = await restoreOfficeEditor(page, before);
		expectLiveEditor(restored, before);
		const refresh = panel.getByRole('button', { name: 'Refresh workspace files', exact: true });
		const listingCycle = page.waitForResponse(
			(response) =>
				new URL(response.url()).origin === context.origin &&
				new URL(response.url()).pathname === `/ocu/api/outputs/${chatId}` &&
				response.request().method() === 'GET'
		);
		await refresh.click();
		await expect(refresh).toBeDisabled();
		const refreshListing = await listingCycle;
		expect([200, 304]).toContain(refreshListing.status());
		await expect(refresh).toBeEnabled();
		await expect(panel.getByRole('button', { name: original.name, exact: true })).toBeVisible();
		await expect(panel.getByRole('button', { name: 'report (2).docx', exact: true })).toBeVisible();
		const metadataResponse = await page.request.get(`/ocu/api/outputs/${chatId}`);
		expect(metadataResponse.status()).toBe(200);
		const listing = await metadataResponse.json();
		expect(listing.revision).toBeGreaterThan(initialListing.revision);
		const originalAfter = listing.files.find(
			(file: { file_id: string }) => file.file_id === original.file_id
		);
		expect(originalAfter).toMatchObject(original);
		const added = listing.files.filter(
			(file: { file_id: string }) => file.file_id !== original.file_id
		);
		expect(added).toHaveLength(1);
		expect(added[0].file_id).not.toBe(original.file_id);
		expect(added[0]).toMatchObject({
			file_id: resolved.file_id,
			path: 'report (2).docx',
			name: 'report (2).docx'
		});
		expect(resolved.path).toBe(added[0].path);
		await expect(panel.getByRole('button', { name: original.name, exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(
			panel.getByRole('button', { name: 'report (2).docx', exact: true })
		).toHaveAttribute('aria-pressed', 'false');
		const afterRefresh = await officeEditorIdentity(page);
		expectLiveEditor(afterRefresh, before);
		expect(await readOfficeParent(page, chatId)).toMatchObject({
			fileId: original.file_id,
			sessionId: opened.session.session_id,
			generation: accepted!.generation,
			state: 'editing',
			dirty: false
		});
		const arrivals = chatOfficeRecords(recordOffset, chatId);
		expectAuthenticatedPost(arrivals, resolvePath.slice('/ocu'.length), chatId);
		expectAuthenticatedPost(arrivals, savePath.slice('/ocu'.length), chatId);
		expect(observed.diagnostics).toEqual([]);
	} finally {
		await stopOfficeStateCapture(page);
		observed.dispose();
	}
});

test('Office unpublished content restores the captured version before opening the editor', async ({
	page
}) => {
	const recordOffset = fs.statSync(context.record).size;
	const observed = collectDiagnostics(page);
	try {
		await openAuthenticatedPage(page);
		const chatId = await createScenarioChat(page, 'office_unpublished');
		await restoreUnpublishedOffice(page, chatId, recordOffset);
		expect(observed.diagnostics).toEqual([]);
	} finally {
		observed.dispose();
	}
});

test('Office stale session rechecks unpublished content once before starting from the current file', async ({
	page
}) => {
	const recordOffset = fs.statSync(context.record).size;
	const observed = collectDiagnostics(page);
	try {
		await openAuthenticatedPage(page);
		const chatId = await createScenarioChat(page, 'office_stale');
		const createPath = await startAfterStaleOffice(page, chatId, recordOffset);
		const expectedCreateUrl = new URL(createPath, context.origin).href;
		expect(
			observed.diagnostics.filter(
				(diagnostic) =>
					!(
						diagnostic.kind === 'console' &&
						diagnostic.url === expectedCreateUrl &&
						/^Failed to load resource: the server responded with a status of 409(?:\b|\s|\()/.test(
							diagnostic.text
						)
					)
			)
		).toEqual([]);
	} finally {
		observed.dispose();
	}
});
