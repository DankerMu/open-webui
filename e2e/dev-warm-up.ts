import { chromium, type FullConfig } from '@playwright/test';

// Vite dev compiles a route and optimizes its dependencies on the first browser load, and the
// optimizer may reload the page once. Whichever spec runs first (in any shard of
// `make verify-ui SHARD=…`) must not pay that inside its 20 s expect timeout, so the run warms
// /auth once before any spec starts. A login form that never renders fails the whole run here.
export default async function warmUp(config: FullConfig): Promise<void> {
	const baseURL = config.projects[0]?.use.baseURL;
	if (!baseURL) throw new Error('dev warm-up: the Playwright config has no baseURL');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const loginForm = page.locator('input[type="email"], input[name="email"]').first();
		await page.goto(new URL('/auth', baseURL).href);
		await loginForm.waitFor({ state: 'visible', timeout: 120_000 });
		// An optimizer reload happens after the first render; settle it, then require the form again.
		await page.waitForLoadState('networkidle', { timeout: 120_000 });
		await loginForm.waitFor({ state: 'visible', timeout: 120_000 });
	} finally {
		await browser.close();
	}
}
