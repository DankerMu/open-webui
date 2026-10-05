import { expect } from '@playwright/test';
import * as fs from 'node:fs';
import { openAuthenticatedPage, test } from './ocu-auth';
import { context, evidence, records } from './ocu-fixtures';
import type { OcuOfficeState } from '../src/lib/stores/ocu-office';

test('Office first open reaches parent-accepted editing through the gateway', async ({ page }) => {
	const chatId = context.chats.office;
	expect(chatId, 'missing office scenario chat in OCU_E2E_CONTEXT').toBeTruthy();
	const diagnostics: Array<{ kind: string; text: string; url: string }> = [];
	page.on('pageerror', (error) =>
		diagnostics.push({ kind: 'pageerror', text: String(error), url: '' })
	);
	page.on('console', (message) => {
		if (message.type() === 'error')
			diagnostics.push({ kind: 'console', text: message.text(), url: message.location().url });
	});
	await openAuthenticatedPage(page, `/c/${chatId}`);
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	if (!(await panel.isVisible())) {
		if (!(await page.locator('#controls-container').isVisible())) {
			await page.getByRole('button', { name: 'Controls', exact: true }).click();
		}
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
	}
	await expect(panel).toBeVisible();
	await panel.getByRole('button', { name: 'report.docx', exact: true }).click();
	const listing = await page.request.get(`/ocu/api/outputs/${chatId}`);
	expect(listing.status()).toBe(200);
	const file = (await listing.json()).files.find(
		(entry: { path: string }) => entry.path === 'report.docx'
	);
	expect(file.file_id).toBeTruthy();
	const sessionPath = `/ocu/api/office/${chatId}/documents/${encodeURIComponent(file.file_id)}/sessions`;
	const sessionResponse = page.waitForResponse(
		(response) =>
			new URL(response.url()).origin === context.origin &&
			new URL(response.url()).pathname === sessionPath &&
			response.request().method() === 'POST'
	);
	await panel
		.locator('[data-selected-bar]')
		.getByRole('button', { name: 'Edit', exact: true })
		.click();
	const response = await sessionResponse;
	expect(response.status()).toBe(201);
	const session = await response.json();
	const frame = panel.locator('iframe[title="Office editor: report.docx"]');
	await expect(frame).toHaveAttribute('src', `/ocu/preview/${chatId}?embed=office`);
	await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
	await expect(frame).toHaveAttribute('allow', '');
	const readParent = async () =>
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
	await expect.poll(readParent).toMatchObject({
		fileId: file.file_id,
		sessionId: session.session_id,
		state: 'editing',
		dirty: false,
		workspaceChanged: false,
		reason: null
	});
	const accepted = await readParent();
	expect(accepted!.generation).toBeGreaterThan(0);
	const arrivals = records().filter(
		(row) => row.method === 'POST' && row.target === sessionPath.slice('/ocu'.length)
	);
	expect(arrivals).toHaveLength(1);
	expect(arrivals[0]).toMatchObject({ token_ok: true, identity: { 'x-chat-id': chatId } });
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
				upstreamArrivals: arrivals.length,
				diagnostics
			},
			null,
			2
		)
	);
	expect(diagnostics).toEqual([]);
});
