import { expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import { finishOnboarding, openAuthenticatedPage, test } from './ocu-auth';

// Composer thinking-strength selector (openspec chat-reasoning-effort, evidence d). Models and the completion
// endpoint are stubbed at the network boundary; chats, params saves and reloads are real.

// Same seeded owner defaults as smoke.e2e.ts; ocu-auth signs in once per worker (sign-in is rate limited).
process.env.SEED_EMAIL ??= 'admin@harness.local';
process.env.SEED_PASSWORD ??= 'harness-admin-pw';
const evidence = '.run/ui-evidence';
fs.mkdirSync(evidence, { recursive: true });

const MODELS = [
	{ id: 'qwen3.8-27b', name: 'Qwen3.8 27B' },
	{ id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash' },
	{ id: 'fixture-generic', name: 'Generic fixture' },
	{ id: 'fixture-generic-two', name: 'Generic fixture two' }
];
const MEDIUM = { reasoning_effort: 'medium', thinking: null };
const OFF = { reasoning_effort: null, thinking: { type: 'disabled' } };

type Sent = { chat_id?: string; model: string; params: Record<string, unknown> };
const sent = new WeakMap<Page, Sent[]>();
const problems = new WeakMap<Page, string[]>();

async function token(page: Page) {
	return page.evaluate(() => localStorage.token as string);
}

async function createChat(
	page: Page,
	model: string,
	params: Record<string, unknown>,
	title: string
) {
	const user = {
		id: 'u1',
		parentId: null,
		childrenIds: ['a1'],
		role: 'user',
		content: 'hi',
		timestamp: 1,
		models: [model]
	};
	const reply = {
		id: 'a1',
		parentId: 'u1',
		childrenIds: [],
		role: 'assistant',
		content: 'hello',
		model,
		done: true,
		timestamp: 2
	};
	const response = await page.request.post('/api/v1/chats/new', {
		headers: { Authorization: `Bearer ${await token(page)}` },
		data: {
			chat: {
				title,
				models: [model],
				params,
				history: { messages: { u1: user, a1: reply }, currentId: 'a1' },
				messages: [user, reply]
			}
		}
	});
	expect(response.ok()).toBe(true);
	return (await response.json()).id as string;
}

async function savedParams(page: Page, id: string) {
	const response = await page.request.get(`/api/v1/chats/${id}`, {
		headers: { Authorization: `Bearer ${await token(page)}` }
	});
	return (await response.json()).chat?.params ?? {};
}

// The Dropdown wrapper (span role=button) takes its name from this button; target the button itself.
const trigger = (page: Page) => page.locator('button[aria-label^="Thinking strength: "]');

async function pick(page: Page, label: string) {
	await trigger(page).click();
	await page.getByRole('menuitemradio', { name: label, exact: true }).click();
	await expect(page.getByRole('menu')).toBeHidden();
}

async function selectModel(page: Page, name: string) {
	await page.locator('#model-selector-model-button').click();
	await page.getByRole('option', { name: `Select ${name} model` }).click();
	await expect(page.locator('#model-selector-model-button')).toHaveAttribute(
		'aria-label',
		`Selected model: ${name}`
	);
}

// Sends one message, returns the intercepted request, and ends the stubbed turn with Stop.
async function send(page: Page, text: string) {
	const requests = sent.get(page)!;
	const count = requests.length;
	await page.locator('#chat-input').fill(text);
	await page.locator('#send-message-button').click();
	await expect.poll(() => requests.length).toBe(count + 1);
	await expect(page).toHaveURL(/\/c\/[^/]+$/);
	const stop = page.getByRole('button', { name: 'Stop', exact: true });
	await stop.click();
	await expect(stop).toBeHidden();
	return requests[count];
}

const effortKeys = (params: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(params).filter(([key]) => key === 'reasoning_effort' || key === 'thinking')
	);

test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	problems.set(page, errors);
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('pageerror', (error) => errors.push(String(error)));
	const requests: Sent[] = [];
	sent.set(page, requests);
	await page.route('**/api/models*', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				data: MODELS.map((model) => ({
					...model,
					owned_by: 'openai',
					info: { meta: { capabilities: {} } }
				}))
			})
		})
	);
	await page.route('**/api/chat/completions', async (route) => {
		const body = route.request().postDataJSON() as Sent;
		requests.push(body);
		// The completion boundary is stubbed; a new chat gets a real id from the authenticated backend.
		const chatId =
			body.chat_id && !body.chat_id.startsWith('local:')
				? body.chat_id
				: await createChat(page, body.model, {}, 'Thinking strength fixture');
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ chat_id: chatId })
		});
	});
	await openAuthenticatedPage(page);
});

test.afterEach(async ({ page }) => {
	expect(problems.get(page), 'console and page errors').toEqual([]);
});

test('new Qwen chat sends Medium, then Off and High as mapped, and reopens with High', async ({
	page
}) => {
	await page.goto('/?models=qwen3.8-27b');
	await finishOnboarding(page);
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Medium');
	const model = await page.locator('#model-selector-model-button').boundingBox();
	const effort = await trigger(page).boundingBox();
	expect(effort!.x).toBeGreaterThanOrEqual(model!.x + model!.width - 1);
	expect(Math.abs(effort!.y + effort!.height / 2 - (model!.y + model!.height / 2))).toBeLessThan(4);

	expect(effortKeys((await send(page, 'first')).params)).toEqual(MEDIUM);
	const id = page.url().split('/c/')[1];
	await pick(page, 'Off');
	expect(effortKeys((await send(page, 'second')).params)).toEqual(OFF);
	await pick(page, 'High');
	expect(effortKeys((await send(page, 'third')).params)).toEqual({
		reasoning_effort: 'high',
		thinking: null
	});
	await expect
		.poll(async () => effortKeys(await savedParams(page, id)))
		.toEqual({
			reasoning_effort: 'high',
			thinking: null
		});
	await page.goto(`/c/${id}`);
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: High');
});

test('model switches carry, default or clear the choice and keep a generic pick', async ({
	page
}) => {
	await page.goto('/?models=qwen3.8-27b');
	await finishOnboarding(page);
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Medium');
	await selectModel(page, 'DeepSeek V4.1 Flash');
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: High');
	await pick(page, 'Max');
	await selectModel(page, 'Qwen3.8 27B');
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Medium');
	await selectModel(page, 'Generic fixture');
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Default');
	const generic = await send(page, 'generic before a pick');
	expect(generic.model).toBe('fixture-generic');
	expect(effortKeys(generic.params)).toEqual({});
	await pick(page, 'XHigh');
	expect(effortKeys((await send(page, 'generic after a pick')).params)).toEqual({
		reasoning_effort: 'xhigh',
		thinking: null
	});
	await selectModel(page, 'Generic fixture two');
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: XHigh');
	expect(effortKeys((await send(page, 'second generic')).params)).toEqual({
		reasoning_effort: 'xhigh',
		thinking: null
	});
});

test('a new chat opened in place on a generic model does not inherit the family default', async ({
	page
}) => {
	await page.goto('/?models=qwen3.8-27b');
	await finishOnboarding(page);
	expect(effortKeys((await send(page, 'qwen first')).params)).toEqual(MEDIUM);
	// An in-app link is a client-side navigation: Chat.svelte resets params in place (initNewChat).
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/?models=fixture-generic';
		link.textContent = 'new generic chat';
		document.body.append(link);
		link.click();
		link.remove();
	});
	await expect(page.locator('#model-selector-model-button')).toHaveAttribute(
		'aria-label',
		'Selected model: Generic fixture'
	);
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Default');
	const generic = await send(page, 'generic first');
	expect(generic.model).toBe('fixture-generic');
	expect(effortKeys(generic.params)).toEqual({});
});

test('auto-submitted ?q= request on a Qwen model carries Medium', async ({ page }) => {
	await page.goto('/?q=hello&models=qwen3.8-27b');
	const requests = sent.get(page)!;
	await expect.poll(() => requests.length).toBe(1);
	await expect(page).toHaveURL(/\/c\/[^/]+$/);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	expect(requests[0].model).toBe('qwen3.8-27b');
	expect(effortKeys(requests[0].params)).toEqual(MEDIUM);
});

test('switching between a saved Qwen chat and a saved generic XHigh chat keeps both values', async ({
	page
}) => {
	const qwen = await createChat(page, 'qwen3.8-27b', { ...MEDIUM }, 'Saved Qwen chat');
	const generic = await createChat(
		page,
		'fixture-generic',
		{ reasoning_effort: 'xhigh', thinking: null },
		'Saved generic chat'
	);
	await page.goto(`/c/${qwen}`);
	await finishOnboarding(page);
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Medium');
	const sidebar = page.getByRole('button', { name: 'Open Sidebar' }).first();
	if (await sidebar.isVisible()) await sidebar.click();
	// Client-side navigation keeps the composer mounted, so chat id, params and model update in place.
	for (const [id, label] of [
		[generic, 'XHigh'],
		[qwen, 'Medium'],
		[generic, 'XHigh']
	]) {
		await page.locator(`a[href="/c/${id}"]`).first().click();
		await expect(page).toHaveURL(`/c/${id}`);
		await expect(trigger(page)).toHaveAttribute('aria-label', `Thinking strength: ${label}`);
	}
	expect(effortKeys((await send(page, 'saved generic')).params)).toEqual({
		reasoning_effort: 'xhigh',
		thinking: null
	});
	// Past the 400 ms params save: neither chat's saved value was rewritten by the switches.
	await page.waitForTimeout(1000);
	expect(effortKeys(await savedParams(page, generic))).toEqual({
		reasoning_effort: 'xhigh',
		thinking: null
	});
	expect(effortKeys(await savedParams(page, qwen))).toEqual(MEDIUM);
});

test('composer screenshots in light and dark and at 390 px', async ({ page }) => {
	const composer = page.locator('#message-input-container');
	for (const theme of ['light', 'dark']) {
		await page.evaluate((value) => localStorage.setItem('theme', value), theme);
		await page.goto('/?models=qwen3.8-27b');
		await finishOnboarding(page);
		await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Medium');
		await trigger(page).click();
		await expect(page.getByRole('menuitemradio', { name: 'Medium' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
		const box = (await composer.boundingBox())!;
		await page.screenshot({
			path: `${evidence}/reasoning-effort-qwen-${theme}.png`,
			clip: { x: box.x, y: Math.max(0, box.y - 260), width: box.width, height: box.height + 260 }
		});
		await page.keyboard.press('Escape');
		await selectModel(page, 'Generic fixture');
		await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Default');
		await composer.screenshot({ path: `${evidence}/reasoning-effort-generic-${theme}.png` });
	}
	await page.evaluate(() => localStorage.setItem('theme', 'light'));
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/?models=qwen3.8-27b');
	await finishOnboarding(page);
	await expect(trigger(page)).toHaveAttribute('aria-label', 'Thinking strength: Medium');
	await expect(trigger(page).getByText('Medium')).toBeHidden();
	const model = (await page.locator('#model-selector-model-button').boundingBox())!;
	const effort = (await trigger(page).boundingBox())!;
	expect(effort.x).toBeGreaterThanOrEqual(model.x + model.width - 1);
	expect(effort.x + effort.width).toBeLessThanOrEqual(390);
	await page.screenshot({ path: `${evidence}/reasoning-effort-390.png` });
});
