import { expect, type Page } from '@playwright/test';
import { openAuthenticatedPage, test } from './ocu-auth';
import {
	context,
	createScenarioChat,
	evidence,
	records,
	recordsSince,
	setScenario
} from './ocu-fixtures';

async function openConnectedChat(page: Page, id: string) {
	// Backend enters the owner room before the client logs the socket's connect event.
	const connected = page.waitForEvent('console', {
		predicate: (message) => message.type() === 'log' && /^connected \S+$/.test(message.text())
	});
	await page.goto(`/c/${id}`);
	await connected;
	await expect(page.locator('#chat-input')).toBeVisible();
	await expect(page.locator('#messages-container a[href^="/ocu/files/"]')).toHaveCount(0);
}

const diagnostics = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	diagnostics.set(page, errors);
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await openAuthenticatedPage(page);
});
test.afterEach(async ({ page }) => {
	expect(diagnostics.get(page)).toEqual([]);
});

test('A-T11 message-less workspace hint discovers the first output while Controls stays closed', async ({
	page
}) => {
	const id = await createScenarioChat(page, 'empty');
	const listingStatuses: number[] = [];
	let hintDelivered = false;
	const observeHint = (payload: string | Buffer) => {
		const body = String(payload);
		if (body.includes('ocu:workspace_changed') && body.includes(id)) hintDelivered = true;
	};
	page.on('websocket', (socket) =>
		socket.on('framereceived', (frame) => observeHint(frame.payload))
	);
	page.on('response', (response) => {
		const pathname = new URL(response.url()).pathname;
		if (pathname === `/ocu/api/outputs/${id}`) listingStatuses.push(response.status());
		if (pathname.startsWith('/ws/socket.io') && response.request().method() === 'GET')
			void response
				.text()
				.then(observeHint)
				.catch(() => undefined);
	});
	await openConnectedChat(page, id);
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	await expect(panel).toHaveCount(0);
	await expect.poll(() => listingStatuses).toContain(200);
	await page.clock.pauseAt(new Date());
	const initialListings = records().filter((row) => row.target === `/api/outputs/${id}`).length;
	setScenario(id, 'normal');
	const token = await page.evaluate(() => localStorage.token);
	const delivery = await page.request.post(
		`/api/v1/chats/${id}/messages/missing-message-id/event`,
		{
			headers: { Authorization: `Bearer ${token}` },
			data: { type: 'ocu:workspace_changed', data: { chat_id: id, reason: 'tool_completed' } }
		}
	);
	expect(delivery.status()).toBe(200);
	expect(await delivery.json()).toBe(true);
	await expect.poll(() => hintDelivered).toBe(true);
	await expect(panel).toBeVisible({ timeout: 2_500 });
	expect(records().filter((row) => row.target === `/api/outputs/${id}`).length).toBeGreaterThan(
		initialListings
	);
	await expect(panel.getByRole('button', { name: 'page.html' })).toBeVisible();
	await page.screenshot({ path: `${evidence}/reconciliation-hint-no-link.png`, fullPage: true });
});

test('A-T11 a no-event output is found by background polling while the panel is closed', async ({
	page
}) => {
	const id = await createScenarioChat(page, 'empty');
	const listingStatuses: number[] = [];
	page.on('response', (response) => {
		if (new URL(response.url()).pathname === `/ocu/api/outputs/${id}`)
			listingStatuses.push(response.status());
	});
	await openConnectedChat(page, id);
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	await expect(panel).toHaveCount(0);
	const listingCount = () => records().filter((row) => row.target === `/api/outputs/${id}`).length;
	await expect.poll(() => listingStatuses).toContain(200);
	await expect.poll(() => listingStatuses).toContain(304);
	const before = listingCount();
	setScenario(id, 'normal');
	await expect(panel).toBeVisible({ timeout: 12_000 });
	await expect(panel.getByRole('button', { name: 'page.html' })).toBeVisible();
	expect(listingCount()).toBeGreaterThan(before);
	await page.screenshot({ path: `${evidence}/reconciliation-poll-no-event.png`, fullPage: true });
});

test('A-T06 owner history restores persisted Files and Office preview after native backend and stub restart', async ({
	page
}) => {
	const id = context.chats.restart;
	for (const service of [context.restart.backend, context.restart.stub]) {
		expect(service.old_pid).toBeGreaterThan(0);
		expect(service.new_pid).toBeGreaterThan(0);
		expect(service.new_pid).not.toBe(service.old_pid);
	}
	await openConnectedChat(page, id);
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	await expect(panel).toBeVisible();
	await expect(panel.getByRole('button', { name: 'valid.docx' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(
		page
			.frameLocator('iframe[title="Office preview: valid.docx"]')
			.getByText('Verified Office document')
	).toBeVisible({ timeout: 30_000 });
	await expect
		.poll(() =>
			recordsSince(context.restart.record_offset).some(
				(row) => row.target === `/internal/describe/${id}`
			)
		)
		.toBe(true);
	const ownerRequests = recordsSince(context.restart.record_offset);
	expect(
		ownerRequests.filter((row) => row.method === 'POST' && row.target === `/internal/launch/${id}`)
	).toEqual([]);
	await page.screenshot({ path: `${evidence}/reconciliation-native-restart.png`, fullPage: true });
});
