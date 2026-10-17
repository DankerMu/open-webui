import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

type OwnerState = Awaited<ReturnType<BrowserContext['storageState']>>;

export const test = base.extend<Record<string, never>, { ownerState: OwnerState }>({
	ownerState: [
		async ({ browser }, use) => {
			const context = await browser.newContext({
				baseURL: process.env.BASE_URL ?? 'http://localhost:5173'
			});
			try {
				const page = await context.newPage();
				await signIn(page);
				await use(await context.storageState());
			} finally {
				await context.close();
			}
		},
		{ scope: 'worker' }
	],
	storageState: async ({ ownerState }, use) => {
		await use(ownerState);
	}
});

export async function openAuthenticatedPage(page: Page, path = '/') {
	await page.goto(path);
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	await finishOnboarding(page);
}

export async function finishOnboarding(page: Page) {
	const changelog = page.getByRole('dialog').filter({
		has: page.getByRole('heading', { name: /What's New in Open WebUI/ })
	});
	if (await changelog.isVisible()) {
		await changelog.getByRole('button', { name: "Okay, Let's Go!" }).click();
		await expect(changelog).toBeHidden();
	}
}

export function ownerCredentials() {
	const email = process.env.OCU_E2E_EMAIL ?? process.env.SEED_EMAIL;
	const password = process.env.OCU_E2E_PASSWORD ?? process.env.SEED_PASSWORD;
	if (!email || !password) throw new Error('Browser owner credentials are required');
	return { email, password };
}

async function signIn(page: Page) {
	await page.goto('/auth');
	await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
	// Native input events preserve bindings without credential-bearing locator.fill call logs.
	await page.evaluate(({ email, password }) => {
		for (const [selector, value] of [
			['input[type="email"], input[name="email"]', email],
			['input[type="password"]', password]
		]) {
			const input = document.querySelector<HTMLInputElement>(selector);
			if (!input) throw new Error('Login input is unavailable');
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			if (!setter) throw new Error('Login input value setter is unavailable');
			setter.call(input, value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}, ownerCredentials());
	await page.locator('button[type="submit"]').first().click();
	await page.waitForURL(/\/$|\/c\//, { timeout: 20_000 });
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	await finishOnboarding(page);
}
