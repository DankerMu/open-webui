import {
	test,
	expect,
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	type Locator,
	type Page
} from '@playwright/test';
import * as fs from 'node:fs';
import { finishOnboarding } from './ocu-auth';

// Wallpaper skins (openspec webui-wallpaper-skins, evidence e). A dedicated admin makes every
// skin choice, so specs running in parallel as the seed admin never see a skin.
test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const SEED_EMAIL = process.env.SEED_EMAIL ?? 'admin@harness.local';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'harness-admin-pw';
const PASSWORD = 'skins-e2e-pw';
const evidence = '.run/ui-evidence/skins';
fs.mkdirSync(evidence, { recursive: true });

// Expected catalogue: design.md (id, English name, suggested mode).
const SKINS = [
	['olive-ops', 'Olive Ops', 'dark'],
	['snow-plateau', 'Snow Plateau', 'light'],
	['golden-peaks', 'Golden Peaks', 'dark'],
	['cloud-watch', 'Cloud Watch', 'light'],
	['river-hydrology', 'River Hydrology', 'light'],
	['terrain-grid', 'Terrain Grid', 'dark'],
	['glacier-lake', 'Glacier Lake', 'light'],
	['starfield', 'Starfield', 'dark'],
	['minimal-terrain', 'Minimal Terrain', 'light']
] as const;
// Non-chat routes per skin: path, a content element that proves the page rendered, screenshot name.
const CONTENT_SHOTS: Record<string, [string, string, string][]> = {
	'olive-ops': [['/workspace', 'Search Models', 'workspace']],
	'snow-plateau': [
		['/workspace', 'Search Models', 'workspace'],
		['/admin/users', 'Search', 'admin-users']
	]
};
// The weakest strong backing (dark mode, skins.css --skin-backing).
const STRONG_BACKING = 0.75;
const HOOKS = [
	'body',
	'.skin-shell',
	'#sidebar',
	'#navbar-bg-gradient-to-b',
	'#chat-container',
	'#messages-container',
	'#message-input-container'
];
const other = (mode: string) => (mode === 'dark' ? 'light' : 'dark');

const errors: string[] = [];
const contexts: BrowserContext[] = [];
let seed: { Authorization: string };
let account: { id: string; email: string };
let page: Page;
let chatId: string;
let shareId: string;

async function signIn(browser: Browser, theme: string, options: BrowserContextOptions = {}) {
	const context = await browser.newContext({ baseURL: BASE_URL, ...options });
	contexts.push(context);
	const response = await context.request.post('/api/v1/auths/signin', {
		data: { email: account.email, password: PASSWORD }
	});
	expect(response.ok()).toBe(true);
	const { token } = await response.json();
	await context.addInitScript(
		([value, mode]) => {
			if (!sessionStorage.skinsSeeded) {
				Object.assign(sessionStorage, { skinsSeeded: '1' });
				Object.assign(localStorage, { token: value, theme: mode, sidebar: 'true' });
			}
		},
		[token, theme]
	);
	const opened = await context.newPage();
	opened.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	opened.on('pageerror', (error) => errors.push(String(error)));
	return opened;
}

// One user and one assistant message; no model is needed to render them.
async function createChat(token: string) {
	const user = {
		id: 'u1',
		parentId: null,
		childrenIds: ['a1'],
		role: 'user',
		content: 'Show me the river gauge readings for this week.',
		timestamp: 1
	};
	const reply = {
		id: 'a1',
		parentId: 'u1',
		childrenIds: [],
		role: 'assistant',
		content: 'Here are the readings.\n\n- Monday: 2.4 m\n- Tuesday: 2.7 m\n- Wednesday: 3.1 m',
		done: true,
		timestamp: 2
	};
	const headers = { Authorization: `Bearer ${token}` };
	const created = await page.request.post('/api/v1/chats/new', {
		headers,
		data: {
			chat: {
				title: 'Skin readability',
				history: { messages: { u1: user, a1: reply }, currentId: 'a1' },
				messages: [user, reply]
			}
		}
	});
	expect(created.ok()).toBe(true);
	chatId = (await created.json()).id;
	const shared = await page.request.post(`/api/v1/chats/${chatId}/share`, { headers });
	expect(shared.ok()).toBe(true);
	shareId = (await shared.json()).share_id;
}

async function open(path: string, mode?: string) {
	if (mode) await page.evaluate((value) => localStorage.setItem('theme', value), mode);
	await page.goto(path);
	await expect(page.locator('button[aria-label="User menu"]').first()).toBeVisible();
	await finishOnboarding(page);
	if (mode) await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`));
}

async function openChat(mode?: string) {
	await open(`/c/${chatId}`, mode);
	await expect(page.locator('#messages-container')).toContainText('Wednesday: 3.1 m');
}

async function pick(name: string, target = page) {
	await target.locator('button[aria-label="Skin"]').click();
	const tile = target.getByRole('menu').getByRole('button', { name, exact: true });
	await tile.click();
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	await expect(target.getByRole('menu')).toBeVisible();
	await target.keyboard.press('Escape');
	await expect(target.getByRole('menu')).toBeHidden();
}

// Presses Tab until the focused element is named `name` (aria-label, else its text).
async function tabTo(name: string) {
	for (let step = 0; step < 12; step++) {
		await page.keyboard.press('Tab');
		const focused = await page.evaluate(() => {
			const element = document.activeElement;
			return element?.getAttribute('aria-label') ?? element?.textContent?.trim();
		});
		if (focused === name) return;
	}
	throw new Error(`Tab never reached ${name}`);
}

// Alpha of the computed background colour; an element without one is 1 only if it is opaque.
const alphaOf = (locator: Locator) =>
	locator.evaluate((element) => {
		const color = getComputedStyle(element).backgroundColor;
		const match = color.match(/\/\s*([\d.]+)\)$/) ?? color.match(/^rgba\(.*,\s*([\d.]+)\)$/);
		return match ? Number(match[1]) : 1;
	});

// Opens a non-chat route once its content is rendered at full opacity, and checks that the
// route root under #main-content carries the strong backing rather than bare wallpaper.
async function openContent(path: string, placeholder: string) {
	await open(path);
	const ready = page.locator('#main-content').getByPlaceholder(placeholder, { exact: true });
	await expect(ready).toBeVisible();
	await expect
		.poll(() =>
			ready.evaluate((element) => {
				let opacity = 1;
				for (let node: Element | null = element; node; node = node.parentElement)
					opacity *= Number(getComputedStyle(node).opacity);
				return opacity;
			})
		)
		.toBe(1);
	const root = page.locator('#main-content > div:not(#chat-container)');
	await expect(root).toHaveCount(1);
	expect(await alphaOf(root)).toBeGreaterThanOrEqual(STRONG_BACKING);
}

const skinOf = () => page.locator('html').getAttribute('data-skin');
const paint = () =>
	page.evaluate((selectors) => {
		const root = document.documentElement.style;
		return {
			properties: [root.getPropertyValue('--skin-image'), root.getPropertyValue('--skin-overlay')],
			hooks: selectors.map((selector) => {
				const style = getComputedStyle(document.querySelector(selector)!);
				return [selector, style.backgroundColor, style.backgroundImage, style.backdropFilter];
			})
		};
	}, HOOKS);

// Waits for loading spinners, the wallpaper and fade-in transitions, so text is judged at full opacity.
async function shoot(name: string, id: string, target = page) {
	await expect(target.locator('.spinner_ajPY')).toHaveCount(0);
	await target.evaluate(async (url) => {
		const image = new Image();
		image.src = url;
		await image.decode();
		const finite = document
			.getAnimations()
			.filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
		// A cancelled transition rejects `finished`; it no longer paints, so it is done too.
		await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
	}, `/skins/${id}.webp`);
	await target.screenshot({ path: `${evidence}/${name}.png` });
}

test.beforeAll(async ({ browser, playwright }) => {
	const api = await playwright.request.newContext({ baseURL: BASE_URL });
	const signin = await api.post('/api/v1/auths/signin', {
		data: { email: SEED_EMAIL, password: SEED_PASSWORD }
	});
	expect(signin.ok()).toBe(true);
	seed = { Authorization: `Bearer ${(await signin.json()).token}` };
	const email = `skins-e2e-${Date.now()}@harness.local`;
	const added = await api.post('/api/v1/auths/add', {
		headers: seed,
		data: { name: 'Skins E2E', email, password: PASSWORD, role: 'admin' }
	});
	expect(added.ok()).toBe(true);
	account = { id: (await added.json()).id, email };
	await api.dispose();
	page = await signIn(browser, 'dark');
	await page.goto('/');
	// A new admin gets the changelog once, shortly after load, so finishOnboarding can miss it and it
	// then covers the picker. Closing it saves the version for every context of this user.
	const changelog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: /^What's New in / })
	});
	await changelog.getByRole('button', { name: "Okay, Let's Go!" }).click();
	await expect(changelog).toBeHidden();
	await createChat(await page.evaluate(() => localStorage.token));
});

test.afterAll(async ({ playwright }) => {
	for (const context of contexts) await context.close();
	const api = await playwright.request.newContext({ baseURL: BASE_URL });
	if (account)
		expect((await api.delete(`/api/v1/users/${account.id}`, { headers: seed })).ok()).toBe(true);
	await api.dispose();
});

// Light mode: picking a light skin re-applies light, which sets no inline gray variables, so any
// difference after None comes from skin rules. (Re-applying dark inlines upstream's dark grays.)
test('None restores the computed backgrounds of the unskinned app', async () => {
	await openChat('light');
	expect(await skinOf()).toBeNull();
	const before = await paint();
	await page.screenshot({ path: `${evidence}/none-light-chat.png` });
	await pick('Snow Plateau');
	expect(await skinOf()).toBe('snow-plateau');
	// The hooks themselves change, so this also fails when the skin stylesheet never loads.
	expect((await paint()).hooks).not.toEqual(before.hooks);
	await pick('None');
	expect(await skinOf()).toBeNull();
	await expect.poll(paint).toEqual(before);
	expect(errors).toEqual([]);
});

for (const [id, name, mode] of SKINS) {
	test(`skin ${id} switches to ${mode}, persists and stays readable in both modes`, async () => {
		await openChat(other(mode));
		const wallpaper = page.waitForResponse(
			(r) => new URL(r.url()).pathname === `/skins/${id}.webp`
		);
		await pick(name);
		expect((await wallpaper).status()).toBe(200);
		expect(await skinOf()).toBe(id);
		await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`));
		await shoot(`${id}-${mode}-chat`, id);
		await open('/');
		expect(await skinOf()).toBe(id);
		await shoot(`${id}-${mode}-home`, id);
		for (const [path, placeholder, shot] of CONTENT_SHOTS[id] ?? []) {
			await openContent(path, placeholder);
			expect(await skinOf()).toBe(id);
			await shoot(`${id}-${mode}-${shot}`, id);
		}
		if (id === 'snow-plateau') {
			// /admin/settings redirects to the chat page with the admin Settings modal open.
			await open('/admin/settings');
			await expect(page.locator('#search-input-settings-modal')).toBeVisible();
			await shoot(`${id}-${mode}-admin-settings`, id);
		}
		// A reload in the other mode keeps the skin: the user may override light/dark.
		await openChat(other(mode));
		expect(await skinOf()).toBe(id);
		await shoot(`${id}-${other(mode)}-chat`, id);
		expect(errors).toEqual([]);
	});
}

test('the picker works from the keyboard', async () => {
	await openChat();
	// The chat input autofocuses after load and can take focus mid-walk; retry the walk.
	await expect(async () => {
		await page.locator('#chat-context-menu-button').focus();
		await tabTo('Skin');
	}).toPass();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('menu')).toBeVisible();
	await tabTo('Starfield');
	await page.keyboard.press('Enter');
	const tile = page.getByRole('menu').getByRole('button', { name: 'Starfield', exact: true });
	await expect(tile).toHaveAttribute('aria-pressed', 'true');
	expect(await skinOf()).toBe('starfield');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toBeHidden();
	expect(errors).toEqual([]);
});

test('light mode chosen in Settings overrides the skin mode and keeps the skin', async () => {
	await openChat();
	await expect(page.locator('html')).toHaveClass(/\bdark\b/);
	await page.locator('button[aria-label="User menu"]').first().click();
	await page.getByRole('menu').getByRole('button', { name: 'Settings' }).click();
	await page.getByRole('combobox', { name: 'Theme' }).selectOption('light');
	await expect(page.locator('html')).toHaveClass(/\blight\b/);
	await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
	expect(await skinOf()).toBe('starfield');
	expect(await page.evaluate(() => localStorage.theme)).toBe('light');
	await shoot('starfield-light-settings-override', 'starfield');
	expect(errors).toEqual([]);
});

test('a second browser gets the skin and keeps its own light/dark', async ({ browser }) => {
	const second = await signIn(browser, 'dark');
	await second.goto(`/c/${chatId}`);
	await finishOnboarding(second);
	await expect(second.locator('html')).toHaveAttribute('data-skin', 'starfield');
	await expect(second.locator('html')).toHaveClass(/\bdark\b/);
	await shoot('second-context-dark-chat', 'starfield', second);
	await openChat();
	await expect(page.locator('html')).toHaveClass(/\blight\b/);
	expect(errors).toEqual([]);
});
test('a client-side link to a shared chat clears the skin', async () => {
	await openChat();
	expect(await skinOf()).toBe('starfield');
	await page.evaluate((id) => {
		Object.assign(window, { skinsSameDocument: true });
		const link = Object.assign(document.createElement('a'), {
			href: `/s/${id}`,
			id: 'skins-share-link'
		});
		link.textContent = 'Shared chat';
		document.querySelector('#chat-container')!.append(link);
	}, shareId);
	await page.locator('#skins-share-link').click();
	await page.waitForURL(`**/s/${shareId}`);
	await expect(page.getByText('Wednesday: 3.1 m')).toBeVisible();
	expect(await page.evaluate(() => 'skinsSameDocument' in window)).toBe(true);
	expect(await skinOf()).toBeNull();
	await page.screenshot({ path: `${evidence}/shared-chat-no-skin.png` });
	expect(errors).toEqual([]);
});

test('signing out leaves the sign-in page without a skin', async () => {
	await openChat();
	expect(await skinOf()).toBe('starfield');
	await page.locator('button[aria-label="User menu"]').first().click();
	await page.getByRole('button', { name: 'Sign Out' }).click();
	await page.waitForURL('**/auth**');
	await expect(page.locator('input[type="password"]')).toBeVisible();
	expect(await skinOf()).toBeNull();
	await page.screenshot({ path: `${evidence}/signed-out-auth.png` });
	expect(errors).toEqual([]);
});

// The drawer covers the chat on a phone, so it is near-opaque rather than a blurred panel.
test('the mobile drawer is near-opaque on a light and a dark skin', async ({ browser }) => {
	const phone = await signIn(browser, 'light', { viewport: { width: 390, height: 844 } });
	for (const [id, name, mode] of [
		['snow-plateau', 'Snow Plateau', 'light'],
		['starfield', 'Starfield', 'dark']
	]) {
		await phone.goto(`/c/${chatId}`);
		await finishOnboarding(phone);
		await expect(phone.locator('#messages-container')).toContainText('Wednesday: 3.1 m');
		await pick(name, phone);
		await expect(phone.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`));
		await phone.locator('#sidebar-toggle-button').click();
		const drawer = phone.locator('#sidebar');
		await expect(drawer.getByText('New Chat')).toBeVisible();
		expect(await alphaOf(drawer)).toBeGreaterThanOrEqual(0.9);
		await shoot(`${id}-${mode}-mobile-drawer`, id, phone);
	}
	expect(errors).toEqual([]);
});
