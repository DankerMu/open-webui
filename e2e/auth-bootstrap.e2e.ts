import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { test, openAuthenticatedPage, ownerCredentials } from './ocu-auth';

// Credential-bearing browser artifacts are opt-in, only after login fields are gone.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const sessionPath = '/api/v1/auths/';
const abortFlag = 'e2e.auth-bootstrap.abort';
const holdFlag = 'e2e.auth-bootstrap.hold';
const sessionUrl = (url: URL) => url.pathname === sessionPath;
type BrowserUser = { id: string; token: string };
type AuthWindow = Window & {
	__authHold?: { ready: boolean; finished: boolean; release: () => void };
	__replacementUser?: BrowserUser;
};
const resourceErrors = {
	transport: 'Failed to load resource: net::ERR_FAILED',
	unauthorized: 'Failed to load resource: the server responded with a status of 401',
	unavailable: 'Failed to load resource: the server responded with a status of 503'
};

function watchErrors(page: Page) {
	let expectedFault: RegExp | null = null;
	let expectedResources: string[] = [];
	const unexpected: string[] = [];
	page.on('pageerror', (error) => unexpected.push(`pageerror: ${error.name}`));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const location = message.location().url;
		const path = location ? new URL(location, page.url()).pathname : '';
		const text = message.text();
		const authDiagnostic = path === '/src/lib/apis/auths/index.ts' && expectedFault?.test(text);
		const failedAuthResource =
			path === sessionPath && expectedResources.some((prefix) => text.startsWith(prefix));
		if (!authDiagnostic && !failedAuthResource) {
			let safe = text.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted token]');
			for (const value of Object.values(ownerCredentials())) {
				safe = safe.replaceAll(value, '[private]');
			}
			unexpected.push(`console: ${safe}`);
		}
	});
	return {
		allowAuthFailure(pattern: RegExp | null, resources: Array<keyof typeof resourceErrors> = []) {
			expectedFault = pattern;
			expectedResources = resources.map((key) => resourceErrors[key]);
		},
		assertClean() {
			expect(unexpected, 'unexpected console/page errors').toEqual([]);
		}
	};
}

async function openSession(page: Page) {
	await openAuthenticatedPage(page);
	const { headerId } = await currentIdentity(page);
	return headerId as string;
}

async function safeScreenshot(page: Page, name: string) {
	await expect(page.locator('input[type="password"]')).toHaveCount(0);
	mkdirSync('.run/ui-evidence', { recursive: true, mode: 0o700 });
	await page.screenshot({ path: `.run/ui-evidence/auth-bootstrap-${name}.png`, fullPage: true });
}

async function currentIdentity(page: Page) {
	return page.evaluate(async () => {
		const token = localStorage.getItem('token');
		const response = await fetch('/api/v1/auths/', {
			headers: { Authorization: `Bearer ${token}` },
			credentials: 'include'
		});
		if (!response.ok) throw new Error('Current authenticated session lookup failed');
		const headerUser = await response.json();
		const cookieResponse = await fetch('/api/v1/auths/', { credentials: 'include' });
		if (!cookieResponse.ok) throw new Error('Current cookie session lookup failed');
		const cookieUser = await cookieResponse.json();
		return {
			headerId: headerUser.id,
			cookieId: cookieUser.id,
			headerTokenCurrent: headerUser.token === token,
			cookieTokenCurrent: cookieUser.token === token
		};
	});
}

for (const failure of ['transport rejection', 'AbortError', 'HTTP 503', 'parse failure'] as const) {
	test(`auth bootstrap preserves credentials after ${failure} and recovers manually`, async ({
		page
	}) => {
		const diagnostics = watchErrors(page);
		const userId = await openSession(page);
		const token = await page.evaluate(() => localStorage.getItem('token'));
		expect(Boolean(token), 'real login persists a session token').toBe(true);

		if (failure === 'transport rejection') {
			diagnostics.allowAuthFailure(/TypeError: (Failed to fetch|Load failed)/, ['transport']);
			await page.route(sessionUrl, (route) => route.abort('failed'));
		} else if (failure === 'AbortError') {
			diagnostics.allowAuthFailure(/AbortError/);
			await page.addInitScript(
				({ sessionPath, abortFlag }) => {
					const originalFetch = window.fetch.bind(window);
					window.fetch = (input, init) => {
						const url = new URL(
							input instanceof Request ? input.url : String(input),
							window.location.href
						);
						if (url.pathname === sessionPath && sessionStorage.getItem(abortFlag) === 'on') {
							const controller = new AbortController();
							controller.abort();
							return originalFetch(input, { ...init, signal: controller.signal });
						}
						return originalFetch(input, init);
					};
				},
				{ sessionPath, abortFlag }
			);
			await page.evaluate((flag) => sessionStorage.setItem(flag, 'on'), abortFlag);
		} else {
			diagnostics.allowAuthFailure(
				failure === 'HTTP 503'
					? /Bootstrap unavailable/
					: /SyntaxError|Unexpected token|not valid JSON/,
				failure === 'HTTP 503' ? ['unavailable'] : []
			);
			await page.route(sessionUrl, (route) =>
				route.fulfill({
					status: failure === 'HTTP 503' ? 503 : 200,
					contentType: 'application/json',
					body: failure === 'HTTP 503' ? '{"detail":"Bootstrap unavailable"}' : '{invalid'
				})
			);
		}

		await page.reload();
		const login = page.locator('input[type="email"], input[name="email"]').first();
		const connectionFailure = page.getByText('Server connection failed', { exact: true });
		const retry = page.getByRole('button', { name: 'Check Again', exact: true });
		// Await the continuation that can delete the token, not just the failed request.
		await expect
			.poll(
				async () =>
					(await login.isVisible()) ||
					((await connectionFailure.isVisible()) && (await retry.isVisible())),
				{ message: 'bootstrap settles on login or the unverified-session recovery surface' }
			)
			.toBe(true);
		expect(
			await page.evaluate((expected) => localStorage.getItem('token') === expected, token),
			'non-authoritative bootstrap failure preserves the persisted token'
		).toBe(true);
		await expect(page.locator('#auth-container, input[type="password"]')).toHaveCount(0);
		await expect(
			page.locator('#chat-container, #chat-input, button[aria-label="Controls"]')
		).toHaveCount(0);
		await expect(connectionFailure).toBeVisible();
		await expect(retry).toBeVisible();
		diagnostics.assertClean();
		const label = failure.replaceAll(' ', '-');
		await safeScreenshot(page, `${label}-unverified`);

		if (failure === 'AbortError') {
			await page.evaluate((flag) => sessionStorage.removeItem(flag), abortFlag);
		} else {
			await page.unroute(sessionUrl);
		}
		diagnostics.allowAuthFailure(null);
		const recovered = page.waitForResponse(
			(response) => sessionUrl(new URL(response.url())) && response.ok()
		);
		await retry.click();
		const { id } = await (await recovered).json();
		expect(id, 'manual reload restores the real signed-in user').toBe(userId);
		await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
		await expect(connectionFailure).toHaveCount(0);
		await expect(login).toHaveCount(0);
		expect(
			await page.evaluate((expected) => localStorage.getItem('token') === expected, token),
			'manual recovery retains the original credentials'
		).toBe(true);
		expect(await currentIdentity(page)).toEqual({
			headerId: userId,
			cookieId: userId,
			headerTokenCurrent: true,
			cookieTokenCurrent: true
		});
		await safeScreenshot(page, `${label}-recovered`);
		diagnostics.assertClean();
	});
}

async function installHeldLookup(page: Page, ordinal = 1) {
	await page.addInitScript(
		({ sessionPath, holdFlag }) => {
			const originalFetch = window.fetch.bind(window);
			let lookups = 0;
			window.fetch = (input, init) => {
				const url = new URL(
					input instanceof Request ? input.url : String(input),
					window.location.href
				);
				if (
					url.pathname !== sessionPath ||
					++lookups !== Number(sessionStorage.getItem(holdFlag))
				) {
					return originalFetch(input, init);
				}
				sessionStorage.removeItem(holdFlag);
				let release!: () => void;
				const gate = new Promise<void>((resolve) => (release = resolve));
				const held = { ready: false, finished: false, release };
				(window as AuthWindow).__authHold = held;
				return (async () => {
					try {
						const response = await originalFetch(input, init);
						held.ready = true;
						await gate;
						return response;
					} catch (error) {
						held.ready = true;
						await gate;
						throw error;
					} finally {
						held.finished = true;
					}
				})();
			};
		},
		{ sessionPath, holdFlag }
	);
	await page.evaluate(({ flag, ordinal }) => sessionStorage.setItem(flag, String(ordinal)), {
		flag: holdFlag,
		ordinal
	});
}

// The live browser store cannot be statically imported into Playwright's Node process.
async function replaceSession(page: Page, replaceToken: boolean) {
	return page.evaluate(
		async ({ email, password, replaceToken }) => {
			const response = replaceToken
				? await fetch('/api/v1/auths/signin', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						credentials: 'include',
						body: JSON.stringify({ email, password })
					})
				: await fetch('/api/v1/auths/', {
						headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
						credentials: 'include'
					});
			if (!response.ok) throw new Error('Real replacement session lookup failed');
			const value: BrowserUser = await response.json();
			if (replaceToken) localStorage.setItem('token', value.token);
			const storesPath = '/src/lib/stores/index.ts';
			const { user } = await import(storesPath);
			(window as AuthWindow).__replacementUser = value;
			user.set(value);
			return value.id;
		},
		{ ...ownerCredentials(), replaceToken }
	);
}

async function assertReplacement(page: Page, userId: string) {
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	expect(
		await page.evaluate(async () => {
			const storesPath = '/src/lib/stores/index.ts';
			const { user } = await import(storesPath);
			let current: unknown;
			user.subscribe((value: unknown) => (current = value))();
			return current === (window as AuthWindow).__replacementUser;
		}),
		'old completion preserves the independently adopted real user'
	).toBe(true);
	expect(await currentIdentity(page)).toEqual({
		headerId: userId,
		cookieId: userId,
		headerTokenCurrent: true,
		cookieTokenCurrent: true
	});
}

for (const completion of ['success', 'transport failure', '401', '401 confirmation'] as const) {
	for (const replacement of ['token', 'same-token user'] as const) {
		if (completion.startsWith('401') && replacement === 'same-token user') continue;
		test(`auth bootstrap ignores delayed ${completion} after replacement ${replacement}`, async ({
			page
		}) => {
			const diagnostics = watchErrors(page);
			const userId = await openSession(page);
			await installHeldLookup(page, completion === '401 confirmation' ? 2 : 1);
			if (completion === 'transport failure') {
				diagnostics.allowAuthFailure(/TypeError: (Failed to fetch|Load failed)/, ['transport']);
				await page.route(sessionUrl, (route) => route.abort('failed'), { times: 1 });
			} else if (completion.startsWith('401')) {
				diagnostics.allowAuthFailure(/token|Token|session|Session|authenticated|Unauthorized/, [
					'unauthorized'
				]);
				await page.evaluate(() => localStorage.setItem('token', 'invalid-bootstrap-session'));
			}
			await page.reload({ waitUntil: 'commit' });
			await page.waitForFunction(() => (window as AuthWindow).__authHold?.ready === true);
			expect(await replaceSession(page, replacement === 'token')).toBe(userId);
			await page.evaluate(() => (window as AuthWindow).__authHold!.release());
			await page.waitForFunction(() => (window as AuthWindow).__authHold?.finished === true);
			await assertReplacement(page, userId);
			diagnostics.allowAuthFailure(null);
			await page.reload();
			expect(await currentIdentity(page)).toEqual({
				headerId: userId,
				cookieId: userId,
				headerTokenCurrent: true,
				cookieTokenCurrent: true
			});
			await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
			diagnostics.assertClean();
		});
	}
}

test('auth bootstrap retains real backend 401 sign-out behavior', async ({ page }) => {
	const diagnostics = watchErrors(page);
	await openSession(page);
	// The real sign-out must not revoke the worker session copied into other contexts.
	await page.context().clearCookies({ name: 'token' });
	diagnostics.allowAuthFailure(/token|Token|session|Session|authenticated|Unauthorized/, [
		'unauthorized'
	]);
	await page.evaluate(() => localStorage.setItem('token', 'invalid-bootstrap-session'));
	await page.reload();
	await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
	expect(await page.evaluate(() => localStorage.getItem('token') === null)).toBe(true);
	await expect(page.getByText('Server connection failed', { exact: true })).toHaveCount(0);
	await expect(page.locator('button[aria-label="Controls"]')).toHaveCount(0);
	diagnostics.assertClean();
});

test('auth bootstrap document replacement does not revive a held old success', async ({ page }) => {
	const diagnostics = watchErrors(page);
	const userId = await openSession(page);
	await installHeldLookup(page);
	await page.reload({ waitUntil: 'commit' });
	await page.waitForFunction(() => (window as AuthWindow).__authHold?.ready === true);
	await page.reload();
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	expect(await currentIdentity(page)).toEqual({
		headerId: userId,
		cookieId: userId,
		headerTokenCurrent: true,
		cookieTokenCurrent: true
	});
	diagnostics.assertClean();
});

test('auth bootstrap retirement leaves manual recovery and restores fresh protection', async ({
	page
}) => {
	const diagnostics = watchErrors(page);
	const userId = await openSession(page);
	await installHeldLookup(page);
	await page.reload({ waitUntil: 'commit' });
	await page.waitForFunction(() => (window as AuthWindow).__authHold?.ready === true);
	await page.evaluate(() => {
		window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
		window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
		(window as AuthWindow).__authHold!.release();
	});
	await expect(page.getByText('Server connection failed', { exact: true })).toBeVisible();
	await expect(page.locator('button[aria-label="Controls"]')).toHaveCount(0);
	await page.getByRole('button', { name: 'Check Again', exact: true }).click();
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	expect(await currentIdentity(page)).toEqual({
		headerId: userId,
		cookieId: userId,
		headerTokenCurrent: true,
		cookieTokenCurrent: true
	});
	diagnostics.assertClean();
});

test('auth bootstrap keeps an adopted session when real 401 confirmation is unavailable', async ({
	page
}) => {
	const diagnostics = watchErrors(page);
	const userId = await openSession(page);
	const token = await page.evaluate(() => localStorage.getItem('token'));
	diagnostics.allowAuthFailure(/TypeError: (Failed to fetch|Load failed)/, [
		'unauthorized',
		'transport'
	]);
	let requests = 0;
	await page.route(sessionUrl, (route) => {
		requests += 1;
		return requests === 2 ? route.abort('failed') : route.continue();
	});
	const status = await page.evaluate(async () => {
		const response = await fetch('/api/v1/auths/', {
			headers: { Authorization: 'Bearer invalid-bootstrap-session' },
			credentials: 'include'
		});
		return response.status;
	});
	expect(status).toBe(401);
	expect(
		await page.evaluate((expected) => localStorage.getItem('token') === expected, token),
		'a failed independent confirmation cannot invalidate the adopted session'
	).toBe(true);
	await page.unroute(sessionUrl);
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	diagnostics.allowAuthFailure(null);
	expect(await currentIdentity(page)).toEqual({
		headerId: userId,
		cookieId: userId,
		headerTokenCurrent: true,
		cookieTokenCurrent: true
	});
	diagnostics.assertClean();
});
