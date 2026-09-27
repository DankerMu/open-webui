import { test, expect, type BrowserContext, type Page } from '@playwright/test';

declare global {
	interface Window {
		fixtureEvents: Array<{
			origin: string;
			type: string;
			storage: string;
			parentAccess: string;
			cookie: string;
		}>;
	}
}
import * as fs from 'node:fs';

const contextFile = process.env.OCU_E2E_CONTEXT;
if (!contextFile) throw new Error('OCU_E2E_CONTEXT is required; run make verify-ui-ocu');
const context: { origin: string; chats: Record<string, string>; fixtures: string; record: string } =
	JSON.parse(fs.readFileSync(contextFile, 'utf8'));
const evidence = '.run/ui-evidence';
fs.mkdirSync(evidence, { recursive: true });

function observe(
	page: Page,
	partialChatId?: string,
	expectedStylesheet?: (url: string, text: string) => boolean
) {
	const diagnostics: Array<{ text: string; url: string }> = [];
	const expectedListing503 = new Set<string>();
	page.on('response', (response) => {
		const address = new URL(response.url());
		if (
			partialChatId &&
			address.pathname === `/ocu/api/outputs/${partialChatId}` &&
			address.searchParams.get('cursor') === '100' &&
			response.status() === 503
		)
			expectedListing503.add(response.url());
	});
	page.on('console', (message) => {
		if (message.type() === 'error')
			diagnostics.push({
				text: message.text(),
				url: message.location().url
			});
	});
	page.on('pageerror', (error) => diagnostics.push({ text: String(error), url: '' }));
	return {
		expectedListing503,
		get errors() {
			return diagnostics
				.filter(
					({ text, url }) =>
						!expectedStylesheet?.(url, text) &&
						!(expectedListing503.has(url) && text.includes('503'))
				)
				.map(({ text }) => text);
		}
	};
}

type StylesheetProof = {
	url: string;
	requests: string[];
	responses: number[];
	failures: string[];
	confirmed401: boolean;
};

function observeStylesheet(browser: BrowserContext, chatId: string): StylesheetProof {
	const url = `${context.origin}/ocu/files/${chatId}/style.css`;
	const requests: string[] = [];
	const responses: number[] = [];
	const failures: string[] = [];
	browser.on('request', (request) => {
		if (request.url() === url) requests.push(request.headers()['cookie'] ?? '');
	});
	browser.on('response', (response) => {
		if (response.url() === url) responses.push(response.status());
	});
	browser.on('requestfailed', (request) => {
		if (request.url() === url) failures.push(request.failure()?.errorText ?? '');
	});
	return { url, requests, responses, failures, confirmed401: false };
}

async function expectDeniedStylesheet(
	proof: StylesheetProof,
	before: {
		requests: number;
		responses: number;
		failures: number;
	}
) {
	await expect.poll(() => proof.requests.length).toBeGreaterThan(before.requests);
	await expect
		.poll(() => proof.responses.length + proof.failures.length)
		.toBeGreaterThan(before.responses + before.failures);
	expect(proof.confirmed401).toBe(true);
	expect(proof.requests.slice(before.requests).every((cookie) => cookie === '')).toBe(true);
	expect(proof.responses.slice(before.responses).every((status) => status === 401)).toBe(true);
	expect(
		proof.failures.slice(before.failures).every((failure) => failure === 'net::ERR_BLOCKED_BY_ORB')
	).toBe(true);
}
function stylesheetSnapshot(proof: StylesheetProof) {
	return {
		requests: proof.requests.length,
		responses: proof.responses.length,
		failures: proof.failures.length
	};
}

async function openWorkspace(page: Page, scenario: string, navigate = true) {
	if (navigate) await page.goto(`/c/${context.chats[scenario]}`);
	await expect(page.locator('#chat-pane')).toBeVisible();
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	if (!(await panel.isVisible())) {
		const entry = page.getByRole('button', { name: 'Workspace Files', exact: true });
		if (!(await page.locator('#controls-container').isVisible())) {
			await page.locator('button[aria-label="Controls"]').click();
		}
		await entry.click();
	}
	await expect(panel).toBeVisible();
	return panel;
}

function setScenario(scenario: string, state: string) {
	const rows = JSON.parse(fs.readFileSync(context.fixtures, 'utf8'));
	rows[context.chats[scenario]] = state;
	const staged = `${context.fixtures}.next`;
	fs.writeFileSync(staged, JSON.stringify(rows));
	fs.renameSync(staged, context.fixtures);
}

async function finishOnboarding(page: Page) {
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

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('A-T01 generated HTML keeps opaque origin in sidebar, message link and direct tab', async ({
	page,
	context: browser,
	playwright
}) => {
	const normalCss = observeStylesheet(browser, context.chats.normal);
	const linkCss = observeStylesheet(browser, context.chats.link);
	const anonymous = await playwright.request.newContext();
	try {
		for (const proof of [normalCss, linkCss]) {
			expect((await anonymous.get(proof.url)).status()).toBe(401);
			proof.confirmed401 = true;
		}
	} finally {
		await anonymous.dispose();
	}
	const expectedStyleDiagnostic = (url: string, text: string) => {
		const proof = [normalCss, linkCss].find((item) => item.url === url);
		return (
			!!proof?.confirmed401 &&
			proof.requests.length > 0 &&
			proof.requests.every((cookie) => cookie === '') &&
			((text.includes('401') && proof.responses.includes(401)) ||
				(text.includes('ERR_BLOCKED_BY_ORB') && proof.failures.includes('net::ERR_BLOCKED_BY_ORB')))
		);
	};
	const parent = observe(page, undefined, expectedStyleDiagnostic);
	const browserErrors: Array<{ url: string; text: string }> = [];
	const fileResponses: Array<{ url: string; status: number; headers: Record<string, string> }> = [];
	browser.on('console', (message) => {
		if (message.type() === 'error')
			browserErrors.push({ url: message.location().url, text: message.text() });
	});
	browser.on('weberror', (error) => browserErrors.push({ url: '', text: error.error().message }));
	browser.on('response', (response) => {
		if (
			response.request().resourceType() === 'document' &&
			response.url().includes('/ocu/files/')
		) {
			fileResponses.push({
				url: response.url(),
				status: response.status(),
				headers: response.headers()
			});
		}
	});
	await browser.addInitScript(() => {
		window.fixtureEvents = [];
		window.addEventListener('message', (event) => {
			if (event.data?.type === 'fixture-opaque' || event.data?.type === 'fixture-svg')
				window.fixtureEvents.push({ origin: event.origin, ...event.data });
		});
	});
	const panel = await openWorkspace(page, 'normal');
	const sidebarBefore = stylesheetSnapshot(normalCss);
	await panel.getByRole('button', { name: 'page.html' }).click();
	const frame = page.frameLocator('iframe[title="page.html"]');
	await expect(frame.locator('#proof')).toHaveText('null|blocked|blocked|blocked');
	await expect(frame.locator('#inline')).toHaveCSS('color', 'rgb(0, 128, 0)');
	await expect(frame.locator('#image')).toHaveJSProperty('naturalWidth', 1);
	await frame.locator('#run').click();
	await expect(frame.locator('#clicked')).toHaveText('clicked');
	await expect
		.poll(() => page.evaluate(() => window.fixtureEvents))
		.toContainEqual({
			origin: 'null',
			type: 'fixture-opaque',
			storage: 'blocked',
			parentAccess: 'blocked',
			cookie: 'blocked'
		});
	await expectDeniedStylesheet(normalCss, sidebarBefore);
	const generated = page.locator('iframe[title="page.html"]');
	await expect(generated).toHaveAttribute('sandbox', 'allow-scripts allow-forms');
	const sidebarDocument = fileResponses.find((item) =>
		item.url.includes(`/ocu/files/${context.chats.normal}/page.html`)
	);
	expect(sidebarDocument?.status).toBe(200);
	expect(sidebarDocument?.headers['content-security-policy']).toBe(
		'sandbox allow-scripts allow-forms'
	);
	expect(sidebarDocument?.headers['x-content-type-options']).toBe('nosniff');
	await page.screenshot({ path: `${evidence}/workspace-sidebar.png`, fullPage: true });
	await panel.getByRole('button', { name: 'diagram.svg' }).click();
	await expect(page.frameLocator('iframe[title="diagram.svg"]').locator('#proof')).toHaveText(
		'null|blocked|blocked|blocked'
	);
	await expect
		.poll(() => page.evaluate(() => window.fixtureEvents))
		.toContainEqual({
			origin: 'null',
			type: 'fixture-svg',
			storage: 'blocked',
			parentAccess: 'blocked',
			cookie: 'blocked'
		});
	const sidebarSvg = fileResponses.find((item) =>
		item.url.includes(`/ocu/files/${context.chats.normal}/diagram.svg?revision=`)
	);
	expect(sidebarSvg?.status).toBe(200);
	expect(sidebarSvg?.headers['content-security-policy']).toBe('sandbox allow-scripts allow-forms');
	expect(sidebarSvg?.headers['x-content-type-options']).toBe('nosniff');
	const token = await page.evaluate(() => localStorage.token);
	const settings = await page.request.get(`${context.origin}/api/v1/users/user/settings?raw=true`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	expect(settings.ok()).toBe(true);
	const previousSettings = await settings.json();
	expect(previousSettings?.ui).toBeTruthy();
	const update = await page.request.post(`${context.origin}/api/v1/users/user/settings/update`, {
		headers: { Authorization: `Bearer ${token}` },
		data: {
			...previousSettings,
			ui: { ...previousSettings.ui, iframeSandboxAllowSameOrigin: true }
		}
	});
	expect(update.ok()).toBe(true);
	await page.reload();
	await expect(page.locator('button[aria-label="Controls"]')).toBeVisible();
	await finishOnboarding(page);
	await openWorkspace(page, 'normal', false);
	await page
		.getByRole('region', { name: 'Workspace Files' })
		.getByRole('button', { name: 'page.html' })
		.click();
	await expect(page.locator('iframe[title="page.html"]')).toHaveAttribute(
		'sandbox',
		'allow-scripts allow-forms'
	);
	await expect(page.frameLocator('iframe[title="page.html"]').locator('#proof')).toHaveText(
		'null|blocked|blocked|blocked'
	);
	await page
		.getByRole('region', { name: 'Workspace Files' })
		.getByRole('button', { name: 'diagram.svg' })
		.click();
	await expect(page.locator('iframe[title="diagram.svg"]')).toHaveAttribute(
		'sandbox',
		'allow-scripts allow-forms'
	);
	await expect(page.frameLocator('iframe[title="diagram.svg"]').locator('#proof')).toHaveText(
		'null|blocked|blocked|blocked'
	);
	const denied = fs
		.readFileSync(context.record, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line))
		.filter((row) => row.target.includes('/style.css'));
	expect(denied).toEqual([]);
	expect(parent.errors).toEqual([]);

	const popupObservations = new Map<Page, { errors: string[] }>();
	browser.on('page', (popup) =>
		popupObservations.set(popup, observe(popup, undefined, expectedStyleDiagnostic))
	);
	await page.goto(`/c/${context.chats.link}`);
	const realLink = page.getByRole('link', { name: 'Open generated workspace file' });
	await expect(realLink).toBeVisible();
	const linkBefore = stylesheetSnapshot(linkCss);
	const [linked] = await Promise.all([
		browser.waitForEvent('page'),
		realLink.click({ modifiers: ['ControlOrMeta'] })
	]);
	await linked.bringToFront();
	const linkedObs = popupObservations.get(linked);
	expect(linkedObs, 'popup diagnostics must start before navigation').toBeDefined();
	await expect(linked.locator('#proof')).toHaveText('null|blocked|blocked|blocked');
	await expect
		.poll(() => linked.evaluate(() => window.fixtureEvents))
		.toContainEqual({
			origin: 'null',
			type: 'fixture-opaque',
			storage: 'blocked',
			parentAccess: 'blocked',
			cookie: 'blocked'
		});
	await expect(linked.locator('#inline')).toHaveCSS('color', 'rgb(0, 128, 0)');
	await expect(linked.locator('#image')).toHaveJSProperty('naturalWidth', 1);
	expect(new URL(linked.url()).origin).toBe(context.origin);
	const linkDocument = fileResponses.find((item) =>
		item.url.endsWith(`/ocu/files/${context.chats.link}/page.html`)
	);
	expect(linkDocument?.status).toBe(200);
	expect(linkDocument?.headers['content-security-policy']).toBe(
		'sandbox allow-scripts allow-forms'
	);
	expect(linkDocument?.headers['x-content-type-options']).toBe('nosniff');
	await expectDeniedStylesheet(linkCss, linkBefore);
	await linked.screenshot({ path: `${evidence}/workspace-message-link.png`, fullPage: true });
	expect(linkedObs!.errors).toEqual([]);
	await linked.close();
	const svgLink = page.getByRole('link', { name: 'Open scripted SVG' });
	await expect(svgLink).toBeVisible();
	const [linkedSvg] = await Promise.all([
		browser.waitForEvent('page'),
		svgLink.click({ modifiers: ['ControlOrMeta'] })
	]);
	await linkedSvg.bringToFront();
	await expect
		.poll(() => linkedSvg.evaluate(() => window.fixtureEvents))
		.toContainEqual({
			origin: 'null',
			type: 'fixture-svg',
			storage: 'blocked',
			parentAccess: 'blocked',
			cookie: 'blocked'
		});
	await expect(linkedSvg.locator('#proof')).toHaveText('null|blocked|blocked|blocked');
	expect(new URL(linkedSvg.url()).origin).toBe(context.origin);
	const messageSvg = fileResponses.find((item) =>
		item.url.endsWith(`/ocu/files/${context.chats.link}/diagram.svg`)
	);
	expect(messageSvg?.status).toBe(200);
	expect(messageSvg?.headers['content-security-policy']).toBe('sandbox allow-scripts allow-forms');
	expect(messageSvg?.headers['x-content-type-options']).toBe('nosniff');
	expect(popupObservations.get(linkedSvg)?.errors).toEqual([]);
	await linkedSvg.screenshot({ path: `${evidence}/workspace-message-svg.png` });
	await linkedSvg.close();

	const direct = await browser.newPage();
	const directObs = popupObservations.get(direct);
	const directBefore = stylesheetSnapshot(normalCss);
	const response = await direct.goto(
		`${context.origin}/ocu/files/${context.chats.normal}/page.html`
	);
	expect(response?.headers()['content-security-policy']).toBe('sandbox allow-scripts allow-forms');
	expect(response?.headers()['x-content-type-options']).toBe('nosniff');
	await expect(direct.locator('#proof')).toHaveText('null|blocked|blocked|blocked');
	await expect(direct.locator('#inline')).toHaveCSS('color', 'rgb(0, 128, 0)');
	await expectDeniedStylesheet(normalCss, directBefore);
	await direct.screenshot({ path: `${evidence}/workspace-direct-tab.png`, fullPage: true });
	await direct.goto(`${context.origin}/ocu/files/${context.chats.normal}/diagram.svg`);
	await expect(direct.locator('#proof')).toHaveText('null|blocked|blocked|blocked');
	const svgDocument = fileResponses.find((item) =>
		item.url.endsWith(`/ocu/files/${context.chats.normal}/diagram.svg`)
	);
	expect(svgDocument?.status).toBe(200);
	expect(svgDocument?.headers['content-security-policy']).toBe('sandbox allow-scripts allow-forms');
	expect(svgDocument?.headers['x-content-type-options']).toBe('nosniff');
	await expect
		.poll(() => direct.evaluate(() => window.fixtureEvents))
		.toContainEqual({
			origin: 'null',
			type: 'fixture-svg',
			storage: 'blocked',
			parentAccess: 'blocked',
			cookie: 'blocked'
		});
	await direct.screenshot({ path: `${evidence}/workspace-scripted-svg.png` });
	expect(directObs?.errors).toEqual([]);
	const upstreamStylesheets = fs
		.readFileSync(context.record, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line))
		.filter((row) => row.target.includes('/style.css'));
	expect(upstreamStylesheets).toEqual([]);
	expect(browserErrors.filter(({ url, text }) => !expectedStyleDiagnostic(url, text))).toEqual([]);
	await direct.close();
});

test('A-T10 empty, large, stopped, unavailable and coherent identity transitions', async ({
	page
}) => {
	const seen = observe(page, context.chats.partial);
	let panel = await openWorkspace(page, 'empty');
	await expect(panel.getByText('No workspace files yet.')).toBeVisible();
	await page.screenshot({ path: `${evidence}/workspace-empty.png`, fullPage: true });
	panel = await openWorkspace(page, 'large');
	await expect(panel.getByRole('button', { name: 'More files' })).toBeVisible();
	await expect(panel.locator('ul[aria-label="Workspace file list"] li')).toHaveCount(100);
	await expect(panel.getByRole('button', { name: 'item-099.txt' })).toHaveCount(0);
	await panel.getByRole('button', { name: 'More files' }).click();
	await expect(panel.getByRole('button', { name: 'item-099.txt' })).toBeVisible();
	await expect(panel.locator('ul[aria-label="Workspace file list"] li')).toHaveCount(101);
	await expect(panel.getByRole('button', { name: 'item-099.txt' })).toHaveCount(1);
	await page.screenshot({ path: `${evidence}/workspace-large.png`, fullPage: true });
	panel = await openWorkspace(page, 'stopped');
	await expect(
		panel.getByText('Workspace is stopped; saved files remain available.')
	).toBeVisible();
	await expect(panel.getByRole('button', { name: 'Launch' })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'page.html' })).toBeVisible();
	await page.screenshot({ path: `${evidence}/workspace-stopped.png`, fullPage: true });
	panel = await openWorkspace(page, 'unreachable');
	await expect(panel.getByText('Workspace service is unreachable.')).toBeVisible();
	await expect(panel.getByRole('button', { name: 'Reconnect' })).toBeVisible();
	await page.screenshot({ path: `${evidence}/workspace-unreachable.png`, fullPage: true });

	panel = await openWorkspace(page, 'deleted');
	await panel.getByRole('button', { name: 'report.html' }).click();
	await expect(panel.locator('iframe[title="report.html"]')).toBeVisible();
	setScenario('deleted', 'renamed');
	await panel.getByRole('button', { name: 'Refresh workspace files' }).click();
	await expect(panel.getByRole('button', { name: 'final.html' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.screenshot({ path: `${evidence}/workspace-renamed.png`, fullPage: true });
	setScenario('deleted', 'deleted_after');
	const cleared = page.waitForResponse(
		(response) =>
			response.url().endsWith('/prefs') &&
			response.request().postDataJSON()?.selected_file_id === null
	);
	await panel.getByRole('button', { name: 'Refresh workspace files' }).click();
	const preference = await cleared;
	expect(preference.ok()).toBe(true);
	expect((await preference.json()).prefs).toMatchObject({
		view: 'files',
		open: true,
		selected_file_id: null
	});
	await expect(panel.getByText('Selected file was removed')).toBeVisible();
	await expect(panel.locator('iframe[title="final.html"]')).toHaveCount(0);
	await page.screenshot({ path: `${evidence}/workspace-deleted.png`, fullPage: true });

	panel = await openWorkspace(page, 'partial');
	await panel.getByRole('button', { name: 'report.html' }).click();
	setScenario('partial', 'partial_after');
	await panel.getByRole('button', { name: 'Refresh workspace files' }).click();
	await expect(panel.getByText('Refresh failed; existing files remain available')).toBeVisible();
	await expect(panel.locator('iframe[title="report.html"]')).toBeVisible();
	expect(seen.expectedListing503.size).toBe(1);
	await page.screenshot({ path: `${evidence}/workspace-partial.png`, fullPage: true });
	expect(seen.errors).toEqual([]);
});

test('A-T10 real Office renderer succeeds and corrupt Office preserves parent download', async ({
	page
}) => {
	const seen = observe(page);
	let panel = await openWorkspace(page, 'valid');
	await panel.getByRole('button', { name: 'valid.docx' }).click();
	const office = page.frameLocator('iframe[title="Office preview: valid.docx"]');
	await expect(office.getByText('Verified Office document')).toBeVisible({ timeout: 30_000 });
	await expect(panel.locator('iframe[title="Office preview: valid.docx"]')).toHaveAttribute(
		'sandbox',
		'allow-scripts allow-same-origin allow-forms'
	);
	await page.screenshot({ path: `${evidence}/workspace-valid-office.png`, fullPage: true });
	panel = await openWorkspace(page, 'corrupt');
	await panel.getByRole('button', { name: 'corrupt.docx' }).click();
	await expect(panel.getByText('Office preview error')).toBeVisible({ timeout: 30_000 });
	const downloadLink = panel.getByRole('link', { name: 'Download corrupt.docx' });
	await expect(downloadLink).toHaveAttribute(
		'href',
		`/ocu/files/${context.chats.corrupt}/corrupt.docx?download=1`
	);
	const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
	expect(download.suggestedFilename()).toBe('corrupt.docx');
	const bytes: Buffer[] = [];
	const stream = await download.createReadStream();
	for await (const chunk of stream) bytes.push(Buffer.from(chunk));
	expect(Buffer.concat(bytes)).toEqual(Buffer.from('not a ZIP document'));
	await page.screenshot({ path: `${evidence}/workspace-corrupt-office.png`, fullPage: true });
	expect(seen.errors).toEqual([]);
});
