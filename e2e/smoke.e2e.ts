import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';

// Key UI routes (Q7.3) — keep in sync with AGENTS.md ## Verification Matrix.
// Evidence: screenshot per route under .run/ui-evidence/ + zero console errors.
// Pending rows (add when implemented, never before): send a message on `/`
// (needs a model backend), open the OCU workspace sidebar on `/c/{id}`.

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'admin@harness.local';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'harness-admin-pw';

fs.mkdirSync('.run/ui-evidence', { recursive: true });

function collectConsoleErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	page.on('pageerror', (err) => errors.push(String(err)));
	return errors;
}

test('route /auth renders the login form without console errors', async ({ page }) => {
	const errors = collectConsoleErrors(page);
	const response = await page.goto('/auth');
	expect(response?.ok(), 'HTTP status for /auth').toBe(true);
	await page.waitForLoadState('load');
	await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
	await page.screenshot({ path: '.run/ui-evidence/auth.png', fullPage: true });
	expect(errors, 'console errors on /auth').toEqual([]);
});

test('route / renders the chat shell after login without console errors', async ({ page }) => {
	const errors = collectConsoleErrors(page);
	await page.goto('/auth');
	await page.waitForLoadState('load');
	await page.locator('input[type="email"], input[name="email"]').first().fill(SEED_EMAIL);
	await page.locator('input[type="password"]').first().fill(SEED_PASSWORD);
	await page.locator('button[type="submit"]').first().click();
	await page.waitForURL(/\/$|\/c\//, { timeout: 20_000 });
	await page.waitForLoadState('load');
	await expect(page.locator('#chat-container, #chat-input, textarea').first()).toBeVisible();
	await page.screenshot({ path: '.run/ui-evidence/home.png', fullPage: true });
	expect(errors, 'console errors on /').toEqual([]);
});
