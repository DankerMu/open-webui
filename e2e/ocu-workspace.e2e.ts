import { expect, type BrowserContext, type Page, type Request } from '@playwright/test';
import { finishOnboarding, openAuthenticatedPage, test } from './ocu-auth';
import {
	FIXTURE_COLLECTOR_SOURCE,
	createScenarioChat,
	observeNativeOcuPopup,
	recordAnchorClicks,
	watchContextLifecycle,
	type OcuClickProbe
} from './ocu-fixtures';
import { sanitizedLocation, waitForGrantedFile, redactOcu, records } from './ocu-fixtures';
import {
	ResourceObserver,
	expectResources,
	writeOcuFailureEvidence
} from './ocu-resource-fixtures';

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

const cookieChecks = new WeakMap<Request, Promise<boolean>>();
function hasCookie(request: Request): Promise<boolean> {
	const previous = cookieChecks.get(request);
	if (previous) return previous;
	const check = request.allHeaders().then((headers) => Boolean(headers.cookie));
	cookieChecks.set(request, check);
	return check;
}

function observe(page: Page, partialChatId?: string) {
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
				text: redactOcu(message.text()),
				url: redactOcu(message.location().url)
			});
	});
	page.on('pageerror', (error) => diagnostics.push({ text: redactOcu(String(error)), url: '' }));
	return {
		expectedListing503,
		get errors() {
			return diagnostics
				.filter(({ text, url }) => !(expectedListing503.has(url) && text.includes('503')))
				.map(({ text }) => text);
		}
	};
}

type FileNetworkEvidence = {
	started: number;
	events: Array<{
		ms: number;
		kind:
			| 'page'
			| 'popup'
			| 'close'
			| 'crash'
			| 'download'
			| 'navigated'
			| 'request'
			| 'response'
			| 'requestfailed';
		path: string | null;
		resourceType?: string;
		status?: number;
		hasCookie?: boolean | null;
	}>;
	pending: Promise<void>[];
	active: Page;
	browser: BrowserContext;
	anchorPath: string | null;
	gestures: OcuClickProbe[];
};

let fileNetworkEvidence: FileNetworkEvidence | undefined;

function observeFileNetwork(browser: BrowserContext, active: Page): FileNetworkEvidence {
	const record: FileNetworkEvidence = {
		started: Date.now(),
		events: [],
		pending: [],
		active,
		browser,
		anchorPath: null,
		gestures: []
	};
	const add = (
		kind: 'request' | 'response' | 'requestfailed',
		request: Request,
		status?: number
	) => {
		const path = sanitizedLocation(request.url());
		if (!path?.startsWith('/ocu/files/') && !path?.startsWith('/ocu/f/')) return;
		const event: FileNetworkEvidence['events'][number] = {
			ms: Date.now() - record.started,
			kind,
			path,
			resourceType: request.resourceType(),
			...(status === undefined ? {} : { status })
		};
		record.events.push(event);
		if (kind === 'request') {
			record.pending.push(
				hasCookie(request)
					.then((present) => {
						event.hasCookie = present;
					})
					.catch(() => {
						event.hasCookie = null;
					})
			);
		}
	};
	watchContextLifecycle(browser, active, (kind, raw) =>
		record.events.push({
			ms: Date.now() - record.started,
			kind,
			path: sanitizedLocation(raw)?.split('?')[0] ?? null
		})
	);
	browser.on('request', (request) => add('request', request));
	browser.on('response', (response) => add('response', response.request(), response.status()));
	browser.on('requestfailed', (request) => add('requestfailed', request));
	return record;
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

test.beforeEach(async ({ page }) => {
	await openAuthenticatedPage(page);
});

test.afterEach(async () => {
	const record = fileNetworkEvidence;
	fileNetworkEvidence = undefined;
	if (!record) return;
	if (test.info().status !== test.info().expectedStatus)
		await writeOcuFailureEvidence(record, sanitizedLocation);
});

test('A-T07 unsaved Workspace persists before access and temporary chats stay excluded', async ({
	page
}) => {
	const seen = observe(page);
	const creates: Request[] = [];
	const workspaceRequests: Array<{ path: string; beforeSave: boolean }> = [];
	const order: string[] = [];
	let saveReleased = false;
	page.on('request', (request) => {
		const address = new URL(request.url());
		if (address.origin !== context.origin) return;
		if (address.pathname === '/api/v1/chats/new' && request.method() === 'POST') {
			creates.push(request);
		} else if (
			address.pathname.startsWith('/api/v1/ocu/workspaces/') ||
			address.pathname.startsWith('/ocu/api/outputs/') ||
			address.pathname.startsWith('/ocu/preview/')
		) {
			workspaceRequests.push({ path: address.pathname, beforeSave: !saveReleased });
			order.push('workspace');
		}
	});
	page.on('response', (response) => {
		if (
			new URL(response.url()).pathname === '/api/v1/chats/new' &&
			response.request().method() === 'POST' &&
			response.ok()
		)
			order.push('saved');
	});

	await page.goto('/?temporary-chat=true');
	await expect(page.locator('#chat-input')).toBeVisible();
	if (!(await page.locator('#controls-container').isVisible())) {
		await page.locator('button[aria-label="Controls"]').click();
	}
	await expect(page.locator('#controls-container')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Workspace Files', exact: true })).toHaveCount(0);
	expect(creates).toHaveLength(0);
	expect(workspaceRequests).toHaveLength(0);

	await page.goto('/');
	await expect(page.locator('#chat-input')).toBeVisible();
	const action = page.getByRole('button', { name: 'Workspace Files', exact: true });
	await expect(action).toBeVisible();
	const draft = 'Workspace save must preserve this draft';
	await page.locator('#chat-input').fill(draft);
	await expect(page.getByRole('region', { name: 'Workspace Files' })).toHaveCount(0);

	let releaseSave = () => {};
	const saveGate = new Promise<void>((resolve) => {
		releaseSave = resolve;
	});
	let savedId: string | null = null;
	const createRoute = '**/api/v1/chats/new';
	await page.route(createRoute, async (route) => {
		const response = await route.fetch();
		const saved = await response.json();
		savedId = saved.id;
		if (!savedId || !response.ok()) throw new Error('owner chat persistence failed');
		context.chats.unsaved = savedId;
		setScenario('unsaved', 'normal');
		await saveGate;
		await route.fulfill({ response });
	});
	try {
		await action.click();
		await expect.poll(() => savedId).not.toBeNull();
		expect(creates).toHaveLength(1);
		expect(workspaceRequests).toHaveLength(0);
		await expect(page.locator('#chat-input')).toHaveText(draft);
		saveReleased = true;
		releaseSave();
		await expect(page).toHaveURL(new RegExp(`/c/${savedId}$`));
		await expect(page.getByRole('region', { name: 'Workspace Files' })).toBeVisible();
		await expect.poll(() => workspaceRequests.length).toBeGreaterThan(0);
		expect(order.indexOf('saved')).toBeGreaterThanOrEqual(0);
		expect(order.indexOf('workspace')).toBeGreaterThan(order.indexOf('saved'));
		expect(
			workspaceRequests.every(({ path, beforeSave }) => !beforeSave && path.includes(`/${savedId}`))
		).toBe(true);
		await expect(page.locator('#chat-input')).toHaveText(draft);
		await page.screenshot({ path: `${evidence}/workspace-unsaved-persisted.png`, fullPage: true });
		expect(seen.errors).toEqual([]);
	} finally {
		releaseSave();
		await page.unroute(createRoute);
	}
});

test('A-T01 generated HTML keeps opaque origin in sidebar, message link and direct tab', async ({
	page,
	context: browser,
	playwright
}) => {
	const fileNetwork = observeFileNetwork(browser, page);
	fileNetworkEvidence = fileNetwork;
	const resources = new ResourceObserver(browser);
	let direct: Page | undefined;
	try {
		const anonymous = await playwright.request.newContext({
			storageState: { cookies: [], origins: [] }
		});
		try {
			for (const chat of [context.chats.normal, context.chats.link]) {
				expect(
					(await anonymous.get(`${context.origin}/ocu/files/${chat}/style.css`)).status()
				).toBe(401);
			}
		} finally {
			await anonymous.dispose();
		}
		const parent = observe(page);
		await browser.addInitScript(FIXTURE_COLLECTOR_SOURCE);
		const panel = await openWorkspace(page, 'normal');
		const sidebarOffset = records().length;
		await panel.getByRole('button', { name: 'page.html' }).click();
		const frame = page.frameLocator('iframe[title="page.html"]');
		const sidebarEvaluate = (expression: string) =>
			frame.locator('body').evaluate((_body, code) => eval(code), expression);
		await expectResources(sidebarEvaluate);
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
		const generated = page.locator('iframe[title="page.html"]');
		await expect(generated).toHaveAttribute('sandbox', 'allow-scripts allow-forms');
		await expect(generated).toHaveAttribute(
			'src',
			`/ocu/files/${context.chats.normal}/page.html?revision=1`
		);
		const sidebarDocument = await resources.document(
			`/ocu/files/${context.chats.normal}/page.html?revision=1`
		);
		await resources.resources(sidebarDocument, sidebarOffset);
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
		await resources.document(`/ocu/files/${context.chats.normal}/diagram.svg?revision=1`);
		const token = await page.evaluate(() => localStorage.token);
		const settings = await page.request.get(
			`${context.origin}/api/v1/users/user/settings?raw=true`,
			{
				headers: { Authorization: `Bearer ${token}` }
			}
		);
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
		expect(parent.errors).toEqual([]);

		await page.goto(`/c/${context.chats.link}`);
		const realLink = page.getByRole('link', { name: 'Open generated workspace file' });
		await expect(realLink).toBeVisible();
		await expect(realLink).toHaveAttribute('target', '_blank');
		const messagePanel = page.getByRole('region', { name: 'Workspace Files' });
		const beforeClickTabs = browser.pages().length;
		await realLink.click();
		await expect(messagePanel).toBeVisible();
		await expect(messagePanel.getByRole('button', { name: 'page.html' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.frameLocator('iframe[title="page.html"]').locator('#proof')).toHaveText(
			'null|blocked|blocked|blocked'
		);
		expect(browser.pages()).toHaveLength(beforeClickTabs);
		await page.screenshot({ path: `${evidence}/workspace-message-sidebar.png`, fullPage: true });
		fileNetwork.anchorPath =
			sanitizedLocation((await realLink.getAttribute('href')) ?? '')?.split('?')[0] ?? null;
		await recordAnchorClicks(page, (entry) => {
			fileNetwork.gestures.push(entry);
		});
		fileNetwork.active = page;
		const popupOffset = records().length;
		const linked = await observeNativeOcuPopup(
			browser,
			page,
			`/ocu/files/${context.chats.link}/page.html`,
			'html',
			() => realLink.click({ modifiers: ['ControlOrMeta'] }),
			`${evidence}/workspace-message-link.png`,
			async (popup) => {
				await expectResources(popup.evaluate);
				await resources.resources(popup.grant, popupOffset);
				await popup.screenshot(`${evidence}/workspace-message-link.png`);
			},
			resources.onNetwork
		);
		expect(linked.document).toMatchObject({
			path: `/ocu/f/[grant]/${context.chats.link}/page.html`,
			origin: context.origin,
			readyState: 'complete',
			proof: 'null|blocked|blocked|blocked',
			inlineColor: 'rgb(0, 128, 0)',
			imageNaturalWidth: 1,
			imageComplete: true
		});
		expect(linked.document.fixtureEvents).toContainEqual({
			origin: 'null',
			type: 'fixture-opaque',
			storage: 'blocked',
			parentAccess: 'blocked',
			cookie: 'blocked'
		});
		expect(linked.errors).toEqual([]);
		const svgLink = page.getByRole('link', { name: 'Open scripted SVG' });
		await expect(svgLink).toBeVisible();
		await expect(svgLink).toHaveAttribute('target', '_blank');
		fileNetwork.active = page;
		await svgLink.click();
		await expect(messagePanel.getByRole('button', { name: 'diagram.svg' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.frameLocator('iframe[title="diagram.svg"]').locator('#proof')).toHaveText(
			'null|blocked|blocked|blocked'
		);
		expect(browser.pages()).toHaveLength(beforeClickTabs);
		const linkedSvg = await observeNativeOcuPopup(
			browser,
			page,
			`/ocu/files/${context.chats.link}/diagram.svg`,
			'svg',
			() => svgLink.click({ modifiers: ['ControlOrMeta'] }),
			`${evidence}/workspace-message-svg.png`,
			undefined,
			resources.onNetwork
		);
		expect(linkedSvg.document).toMatchObject({
			path: `/ocu/f/[grant]/${context.chats.link}/diagram.svg`,
			origin: context.origin,
			readyState: 'complete',
			proof: 'null|blocked|blocked|blocked',
			inlineColor: null,
			imageNaturalWidth: null,
			imageComplete: null
		});
		expect(linkedSvg.document.fixtureEvents).toContainEqual({
			origin: 'null',
			type: 'fixture-svg',
			storage: 'blocked',
			parentAccess: 'blocked',
			cookie: 'blocked'
		});
		expect(linkedSvg.errors).toEqual([]);

		direct = await browser.newPage();
		fileNetwork.active = direct;
		const directObs = observe(direct);
		const directOffset = records().length;
		const response = await direct.goto(
			`${context.origin}/ocu/files/${context.chats.normal}/page.html`
		);
		expect(response?.headers()['content-security-policy']).toBe(
			'sandbox allow-scripts allow-forms'
		);
		expect(response?.headers()['x-content-type-options']).toBe('nosniff');
		await expect(direct.locator('#proof')).toHaveText('null|blocked|blocked|blocked');
		await expect(direct.locator('#inline')).toHaveCSS('color', 'rgb(0, 128, 0)');
		await expectResources((expression) => direct!.evaluate((code) => eval(code), expression));
		const directDocument = await resources.document(`/ocu/files/${context.chats.normal}/page.html`);
		await resources.resources(directDocument, directOffset);
		await direct.screenshot({ path: `${evidence}/workspace-direct-tab.png`, fullPage: true });
		await direct.goto(`${context.origin}/ocu/files/${context.chats.normal}/diagram.svg`);
		await expect(direct.locator('#proof')).toHaveText('null|blocked|blocked|blocked');
		await resources.document(`/ocu/files/${context.chats.normal}/diagram.svg`);
		await expect
			.poll(() => direct!.evaluate(() => window.fixtureEvents))
			.toContainEqual({
				origin: 'null',
				type: 'fixture-svg',
				storage: 'blocked',
				parentAccess: 'blocked',
				cookie: 'blocked'
			});
		await direct.screenshot({ path: `${evidence}/workspace-scripted-svg.png` });
		expect(directObs?.errors).toEqual([]);
		resources.assertErrors();
	} finally {
		const retired = await Promise.allSettled([resources.close(), direct?.close()]);
		expect(
			retired.every((result) => result.status === 'fulfilled'),
			'A-T01 resource and tab observers retired'
		).toBe(true);
	}
});

test('A-T10 empty, large, stopped, unavailable and coherent identity transitions', async ({
	page
}) => {
	// Repeated runs on one stack must start from the provisioned rows and empty preferences.
	setScenario('deleted', 'deleted');
	setScenario('partial', 'partial');
	for (const chatId of [context.chats.deleted, context.chats.partial]) {
		const response = await page.request.put(`/api/v1/ocu/workspaces/${chatId}/prefs`, {
			headers: { 'X-Requested-With': 'ocu-workspace' },
			data: {}
		});
		expect(response.status()).toBe(200);
	}
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
	const initialReport = waitForGrantedFile(
		page,
		`/ocu/files/${context.chats.deleted}/report.html?revision=1`
	);
	await panel.getByRole('button', { name: 'report.html' }).click();
	await expect(panel.locator('iframe[title="report.html"]')).toBeVisible();
	expect((await initialReport).status()).toBe(200);
	await expect(
		page.frameLocator('iframe[title="report.html"]').getByText('ocu-stub report')
	).toBeVisible();
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
	const retainedReport = waitForGrantedFile(
		page,
		`/ocu/files/${context.chats.partial}/report.html?revision=1`
	);
	await panel.getByRole('button', { name: 'report.html' }).click();
	expect((await retainedReport).status()).toBe(200);
	await expect(
		page.frameLocator('iframe[title="report.html"]').getByText('ocu-stub report')
	).toBeVisible();
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

test('oversized files list as too-large rows that offer only download', async ({ page }) => {
	const seen = observe(page);
	const chatId = await createScenarioChat(page, 'oversized');
	context.chats.oversized = chatId;
	const fetched: string[] = [];
	page.context().on('request', (request) => {
		const address = new URL(request.url());
		if (address.pathname.startsWith('/ocu/')) fetched.push(address.pathname + address.search);
	});
	const panel = await openWorkspace(page, 'oversized');
	const list = panel.locator('ul[aria-label="Workspace file list"]');
	await expect(list.locator('> li')).toHaveCount(4);
	const row = (name: string) => panel.getByRole('button', { name, exact: true });
	for (const name of ['big.html', 'big.docx']) {
		await expect(row(name).locator('[data-too-large]')).toHaveText('Too large');
		await expect(row(name).locator('[data-file-size]')).toHaveText('100.0 MB');
	}
	for (const name of ['page.html', 'diagram.svg'])
		await expect(row(name).locator('[data-too-large]')).toHaveCount(0);
	await row('page.html').click();
	await expect(panel.locator('iframe[title="page.html"]')).toBeVisible();

	const preview = panel.locator('[data-selected-preview]');
	for (const [name, body] of [
		['big.html', 'oversized html stand-in\n'],
		['big.docx', 'oversized docx stand-in\n']
	] as const) {
		await row(name).click();
		await expect(row(name)).toHaveAttribute('aria-pressed', 'true');
		await expect(preview.getByRole('status')).toHaveText(
			'This file is larger than the 100 MiB preview limit.'
		);
		await expect(panel.locator('iframe')).toHaveCount(0);
		await expect(panel.getByText('Connecting Office preview')).toHaveCount(0);
		const bar = panel.locator('[data-selected-bar]');
		await expect(bar.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
		await expect(bar.getByRole('button', { name: 'Version history' })).toHaveCount(0);
		const href = `/ocu/files/${chatId}/${name}?download=1`;
		await expect(panel.getByRole('link', { name: `Download ${name}` })).toHaveAttribute(
			'href',
			href
		);
		const fallback = preview.getByRole('link', { name: 'Download', exact: true });
		await expect(fallback).toHaveAttribute('href', href);
		const [download] = await Promise.all([page.waitForEvent('download'), fallback.click()]);
		expect(download.suggestedFilename()).toBe(name);
		const bytes: Buffer[] = [];
		for await (const chunk of await download.createReadStream()) bytes.push(Buffer.from(chunk));
		expect(Buffer.concat(bytes).toString()).toBe(body);
		await page.screenshot({
			path: `${evidence}/workspace-oversized-${name.replace('.', '-')}.png`,
			fullPage: true
		});
	}
	// The observer sees frame loads (positive control); no big file is fetched except by download.
	expect(fetched).toContain(`/ocu/files/${chatId}/page.html?revision=1`);
	const big = fetched.filter((target) => /\/big\.(html|docx)/.test(target));
	expect(big.filter((target) => !target.endsWith('?download=1'))).toEqual([]);
	expect(fetched.filter((target) => target.startsWith('/ocu/api/office/'))).toEqual([]);
	expect(fetched.filter((target) => target.includes('embed=files'))).toEqual([]);
	expect(seen.errors).toEqual([]);
});

test('B0 owner upload through the gateway appears in Files', async ({ page }) => {
	const seen = observe(page);
	const chatId = await createScenarioChat(page, 'empty');
	context.chats.upload = chatId;
	const panel = await openWorkspace(page, 'upload');
	const name = 'gateway-upload.html';
	await expect(panel.getByRole('button', { name, exact: true })).toHaveCount(0);
	const uploaded = await page.evaluate(
		async ({ chatId, name }) => {
			const body = new FormData();
			body.append('file', new File(['Gateway upload'], name));
			const response = await fetch(`/ocu/api/uploads/${chatId}/${encodeURIComponent(name)}`, {
				method: 'POST',
				headers: { 'X-Requested-With': 'ocu-workspace' },
				body
			});
			return { status: response.status, filename: (await response.json()).filename };
		},
		{ chatId, name }
	);
	expect(uploaded.status).toBe(200);
	expect(uploaded.filename).toBe(name);
	await expect(panel.getByRole('button', { name: uploaded.filename, exact: true })).toBeVisible();
	await page.screenshot({ path: `${evidence}/workspace-upload.png`, fullPage: true });
	expect(seen.errors).toEqual([]);
});
