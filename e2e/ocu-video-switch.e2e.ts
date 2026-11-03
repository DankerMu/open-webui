import * as fs from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { admin, openAuthenticatedPage, post, test, type Admin } from './ocu-auth';
import { context, evidence, recordsSince } from './ocu-fixtures';

// The stub serves this OpenAI-compatible model so a send runs the backend filter chain for real.
const MODEL = 'ocu-stub-model';
const SWITCH = '视频制作';
const FILTERS = [
	{ id: 'computer_use_filter', name: 'Computer Use Filter' },
	{ id: 'video_production_filter', name: SWITCH }
] as const;

/** Install both pinned filters the way OCU's init does: create, then active and global. */
async function installFilters(api: Admin) {
	for (const { id, name } of FILTERS) {
		await post(api, '/api/v1/functions/create', {
			id,
			name,
			content: fs.readFileSync(context.filters[id], 'utf8'),
			meta: { description: `Pinned OCU ${id}` }
		});
		expect((await post(api, `/api/v1/functions/id/${id}/toggle`)).is_active).toBe(true);
		expect((await post(api, `/api/v1/functions/id/${id}/toggle/global`)).is_global).toBe(true);
	}
	await post(api, '/api/v1/functions/id/computer_use_filter/valves/update', {
		ORCHESTRATOR_URL: context.stub,
		INJECT_SYSTEM_PROMPT: true
	});
}

function systemPromptRows(offset: number) {
	return recordsSince(offset).filter((row) => row.target.startsWith('/system-prompt?'));
}

async function send(page: Page, text: string, reply: string) {
	const offset = fs.statSync(context.record).size;
	await page.locator('#chat-input').click();
	await page.keyboard.type(text);
	await page.locator('#send-message-button').click();
	await expect(page.locator('#messages-container').getByText(reply)).toBeVisible();
	return systemPromptRows(offset);
}

async function setSwitch(page: Page, on: boolean) {
	await page.locator('#integration-menu-button').click();
	// The menu row carries aria-pressed; the composer's chip for a selected filter has the same name.
	const toggle = page.locator('button[aria-pressed]').filter({ hasText: SWITCH });
	await expect(toggle).toBeVisible();
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', String(on));
	await expect(toggle.locator('[role="switch"]')).toHaveAttribute(
		'data-state',
		on ? 'checked' : 'unchecked'
	);
	return toggle;
}

/** Leave the shared stack as the other required specs expect it: no filters, no provider. */
async function cleanUp(api: Admin, openai: unknown) {
	for (const { id } of FILTERS) {
		const path = `/api/v1/functions/id/${id}/delete`;
		expect((await api.request.delete(path, { headers: api.headers })).status(), path).toBe(200);
	}
	if (openai) await post(api, '/openai/config/update', openai);
}

test('video switch sends X-OCU-Features: video only while it is on', async ({ page }) => {
	// Two real sends plus admin setup and cleanup outlast the 60 s default.
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await openAuthenticatedPage(page);
	const api = await admin(page);
	const config = await api.request.get('/openai/config', { headers: api.headers });
	expect(config.status()).toBe(200);
	const openai = await config.json();
	try {
		await exercise(page, api);
	} finally {
		await cleanUp(api, openai);
	}
	expect(errors).toEqual([]);
});

async function exercise(page: Page, api: Admin) {
	await post(api, '/openai/config/update', {
		ENABLE_OPENAI_API: true,
		OPENAI_API_BASE_URLS: [`${context.stub}/v1`],
		OPENAI_API_KEYS: ['ocu-stub'],
		OPENAI_API_CONFIGS: {}
	});
	await installFilters(api);
	const models = await api.request.get('/api/models', { headers: api.headers });
	const model = (await models.json()).data.find((item: { id: string }) => item.id === MODEL);
	expect(model?.filters.map((item: { id: string }) => item.id)).toEqual([
		'video_production_filter'
	]);

	// A fresh load picks up the provider and filters; it may show the changelog again.
	await openAuthenticatedPage(page, `/?models=${MODEL}`);
	await expect(page.locator('#chat-input')).toBeVisible();
	const toggle = await setSwitch(page, true);
	await page.screenshot({ path: `${evidence}/ocu-video-switch-menu.png`, animations: 'disabled' });
	await page.keyboard.press('Escape');
	await expect(toggle).toBeHidden();

	const on = await send(
		page,
		'Make a short video',
		'Stub reply. Saw: OCU stub system prompt (features: video).'
	);
	await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
	const chatId = new URL(page.url()).pathname.split('/').pop();
	expect(on).toHaveLength(1);
	expect(on[0]).toMatchObject({ token_ok: true, x_ocu_features: 'video' });
	expect(new URL(on[0].target, context.stub).searchParams.get('chat_id')).toBe(chatId);

	await setSwitch(page, false);
	await page.keyboard.press('Escape');
	const off = await send(
		page,
		'Now just answer in text',
		'Stub reply. Saw: OCU stub system prompt (features: none).'
	);
	expect(off).toHaveLength(1);
	expect(off[0]).toMatchObject({ token_ok: true, x_ocu_features: null });
	expect(new URL(off[0].target, context.stub).searchParams.get('chat_id')).toBe(chatId);
	await page.screenshot({ path: `${evidence}/ocu-video-switch-chat.png`, fullPage: true });
}
