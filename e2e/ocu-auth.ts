import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

type OwnerState = Awaited<ReturnType<BrowserContext['storageState']>>;

export const test = base.extend<Record<string, never>, { ownerState: OwnerState }>({
	ownerState: [
		async ({ browser }, use) => {
			const context = await browser.newContext({ baseURL: process.env.BASE_URL });
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

async function signIn(page: Page) {
	await page.goto('/auth');
	await page
		.locator('input[type="email"], input[name="email"]')
		.first()
		.fill(process.env.OCU_E2E_EMAIL!);
	await page.locator('input[type="password"]').first().fill(process.env.OCU_E2E_PASSWORD!);
	await page.locator('button[type="submit"]').first().click();
	await page.waitForURL(/\/$|\/c\//, { timeout: 20_000 });
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	await finishOnboarding(page);
}
