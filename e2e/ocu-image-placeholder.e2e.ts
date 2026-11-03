import { expect, type Page } from '@playwright/test';
import { admin, openAuthenticatedPage, post, test, type Admin } from './ocu-auth';
import { context, evidence } from './ocu-fixtures';

// The stub model calls generate_image with aspect_ratio 16:9 when WebUI offers the tool, after a
// reasoning block when the message says "think"; the stub image endpoint waits 8 s before it
// returns a PNG (scripts/ocu_stub_model.py, ocu-stub.py).
const MODEL = 'ocu-stub-model';
const REPLY = 'Stub reply. Saw: no OCU system prompt.';

async function getJson(api: Admin, path: string) {
	const response = await api.request.get(path, { headers: api.headers });
	expect(response.status(), path).toBe(200);
	return response.json();
}

const placeholderOf = (page: Page) => page.locator('[data-cy="image-generation-placeholder"]');

const seconds = async (page: Page) => {
	const text = await page.locator('[data-cy="image-generation-seconds"]').textContent();
	const match = /^(\d+) 秒$/.exec(text?.trim() ?? '');
	if (!match) throw new Error(`unexpected seconds text ${JSON.stringify(text)}`);
	return Number(match[1]);
};

const waveAnimation = (page: Page) =>
	page
		.locator('[data-cy="image-generation-dots"] > div')
		.evaluate((wave) => getComputedStyle(wave).animationName);

/** Point WebUI's provider and image engine at the stub, run the case in Chinese, restore both. */
async function withImageStub(page: Page, run: () => Promise<void>) {
	// Admin setup, an 8 s image call, the follow-up completion and the restore outlast 60 s on slow runners.
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await openAuthenticatedPage(page);
	const api = await admin(page);
	const openai = await getJson(api, '/openai/config');
	const images = await getJson(api, '/api/v1/images/config');
	try {
		await post(api, '/openai/config/update', {
			ENABLE_OPENAI_API: true,
			OPENAI_API_BASE_URLS: [`${context.stub}/v1`],
			OPENAI_API_KEYS: ['ocu-stub'],
			OPENAI_API_CONFIGS: {}
		});
		await post(api, '/api/v1/images/config/update', {
			...images,
			ENABLE_IMAGE_GENERATION: true,
			IMAGE_GENERATION_ENGINE: 'openai',
			IMAGE_GENERATION_MODEL: 'ocu-stub-image',
			IMAGE_SIZE: '512x512',
			IMAGES_OPENAI_API_BASE_URL: `${context.stub}/v1`,
			IMAGES_OPENAI_API_KEY: 'ocu-stub',
			IMAGES_OPENAI_API_PARAMS: {}
		});
		// A fresh load picks up the provider and image config (it may show the changelog again, in
		// English); then reload in Chinese, the owner's language. The URL turns the image feature on.
		await openAuthenticatedPage(page, `/?models=${MODEL}&image-generation=true`);
		await page.evaluate(() => localStorage.setItem('locale', 'zh-CN'));
		await page.reload();
		await expect(page.locator('#chat-input')).toBeVisible();
		await run();
	} finally {
		// Restore both even when one fails, then report the first failure.
		const restored = await Promise.allSettled([
			post(api, '/openai/config/update', openai),
			post(api, '/api/v1/images/config/update', images)
		]);
		const failed = restored.find((result) => result.status === 'rejected');
		if (failed) throw failed.reason;
	}
	expect(errors).toEqual([]);
}

async function send(page: Page, text: string) {
	await page.locator('#chat-input').click();
	await page.keyboard.type(text);
	await page.locator('#send-message-button').click();
}

/** The card is up: 16:9, labelled, no percentage, and its seconds keep counting. */
async function expectRunningCard(page: Page) {
	const placeholder = placeholderOf(page);
	await expect(placeholder).toHaveCount(1);
	await expect(placeholder).toBeVisible();
	await expect(placeholder).toContainText('正在创建图像');
	await expect(placeholder).not.toContainText('%');
	const first = await seconds(page);
	await expect.poll(() => seconds(page), { timeout: 3_000 }).toBeGreaterThan(first);
	const box = await placeholder.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
	expect(await waveAnimation(page)).not.toBe('none');
}

async function expectImageReplacesCard(page: Page, shot: string) {
	const messages = page.locator('#messages-container');
	await expect(messages.locator('[data-cy="image"]').first()).toBeVisible({ timeout: 30_000 });
	await expect(placeholderOf(page)).toHaveCount(0);
	await expect(messages.getByText(REPLY)).toBeVisible();
	await page.screenshot({ path: `${evidence}/${shot}`, fullPage: true });
}

test('a running generate_image call shows a 16:9 placeholder until the image arrives', async ({
	page
}) => {
	await withImageStub(page, async () => {
		await send(page, 'Draw a wide picture');
		await expectRunningCard(page);

		// No animations: 'disabled' here: it would cancel the wave, the one thing this shot shows.
		await page.screenshot({ path: `${evidence}/ocu-image-placeholder-light.png` });
		await page.evaluate(() => document.documentElement.classList.add('dark'));
		await page.screenshot({ path: `${evidence}/ocu-image-placeholder-dark.png` });
		await page.evaluate(() => document.documentElement.classList.remove('dark'));

		await page.emulateMedia({ reducedMotion: 'reduce' });
		expect(await waveAnimation(page)).toBe('none');
		const still = await seconds(page);
		await expect.poll(() => seconds(page), { timeout: 3_000 }).toBeGreaterThan(still);
		await page.emulateMedia({ reducedMotion: null });

		await expectImageReplacesCard(page, 'ocu-image-placeholder-done.png');
	});
});

test('a call after a thinking block shows the placeholder under the collapsed group', async ({
	page
}) => {
	await withImageStub(page, async () => {
		await send(page, 'Think, then draw a wide picture');
		// The thinking block and the call share one collapsed row, whose slot (and tool row) is hidden.
		// The group's toggle; opened, the thinking block inside has its own aria-expanded <button>.
		const group = page.locator('#messages-container div[role="button"][aria-expanded]');
		await expect(group).toHaveCount(1);
		await expect(group).toHaveAttribute('aria-expanded', 'false');
		await expectRunningCard(page);
		await page.screenshot({ path: `${evidence}/ocu-image-placeholder-grouped.png` });

		// The group owns the card, so opening and closing it keeps the one card and its count. The
		// counts are read once right after each click, inside the 300 ms slide, not auto-retried.
		const before = await seconds(page);
		await group.click();
		expect(await placeholderOf(page).count()).toBe(1);
		await expect(group).toHaveAttribute('aria-expanded', 'true');
		const opened = await seconds(page);
		expect(opened).toBeGreaterThanOrEqual(before);
		await group.click();
		expect(await placeholderOf(page).count()).toBe(1);
		await expect(group).toHaveAttribute('aria-expanded', 'false');
		expect(await placeholderOf(page).count()).toBe(1);
		expect(await seconds(page)).toBeGreaterThanOrEqual(opened);

		await expectImageReplacesCard(page, 'ocu-image-placeholder-grouped-done.png');
	});
});

test('stopping the generation mid-call removes the placeholder', async ({ page }) => {
	await withImageStub(page, async () => {
		await send(page, 'Draw a wide picture');
		await expectRunningCard(page);
		// The call never gets an output; the finished message must not leave the card counting.
		await page.locator('button[aria-label="停止"]').click();
		await expect(placeholderOf(page)).toHaveCount(0);
		await page.screenshot({ path: `${evidence}/ocu-image-placeholder-stopped.png` });
	});
});
