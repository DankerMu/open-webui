import { expect, type Page } from '@playwright/test';
import { openAuthenticatedPage, test } from './ocu-auth';
import { context, createScenarioChat, evidence, records, setScenario } from './ocu-fixtures';

const completionModelTests = new Set([
	'A-T07 Send-first holds Workspace disabled until an authenticated server id arrives',
	'A-T07 Workspace-first sends through its saved id with first-message title and tags',
	'A-T07 generated message pair joins an in-flight Workspace save without creating an orphan',
	'A-T07 Workspace joins an in-flight generated pair save without creating a second chat'
]);

type Diagnostic = { kind: 'console' | 'pageerror'; text: string; url: string; value?: unknown };
const consoleObservations = new WeakMap<
	Page,
	{
		diagnostics: Diagnostic[];
		pending: Promise<void>[];
		expectedFailedSaves: Set<string>;
	}
>();

test.beforeEach(async ({ page }) => {
	const record = {
		diagnostics: [] as Diagnostic[],
		pending: [] as Promise<void>[],
		expectedFailedSaves: new Set<string>()
	};
	consoleObservations.set(page, record);
	page.on('response', (response) => {
		if (
			new URL(response.url()).pathname === '/api/v1/chats/new' &&
			response.request().method() === 'POST' &&
			response.status() === 503
		)
			record.expectedFailedSaves.add(response.url());
	});
	page.on('pageerror', (error) =>
		record.diagnostics.push({
			kind: 'pageerror',
			text: String(error),
			url: ''
		})
	);
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const diagnostic: Diagnostic = {
			kind: 'console',
			text: message.text(),
			url: message.location().url
		};
		record.diagnostics.push(diagnostic);
		if (message.args().length)
			record.pending.push(
				message
					.args()[0]
					.jsonValue()
					.then((value) => {
						diagnostic.value = value;
					})
					.catch(() => {})
			);
	});
	const withModel = completionModelTests.has(test.info().title);
	if (withModel)
		await page.route('**/api/models*', (route) =>
			route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({
					data: [
						{ id: 'fixture-model', name: 'Fixture model', info: { meta: { capabilities: {} } } }
					]
				})
			})
		);
	await openAuthenticatedPage(page, withModel ? '/?model=fixture-model' : '/');
});

test.afterEach(async ({ page }) => {
	const record = consoleObservations.get(page)!;
	await Promise.all(record.pending);
	const expectedSaveFailure =
		test.info().title ===
		'A-T07 failed save stays in draft and explicitly retries without workspace requests';
	const unexpected = record.diagnostics.filter((diagnostic) => {
		if (
			!expectedSaveFailure ||
			diagnostic.kind !== 'console' ||
			record.expectedFailedSaves.size !== 1
		)
			return true;
		const failedResource =
			record.expectedFailedSaves.has(diagnostic.url) &&
			/^Failed to load resource: the server responded with a status of 503(?:\b|\s|\()/.test(
				diagnostic.text
			);
		const reportedFailure =
			diagnostic.value !== null &&
			typeof diagnostic.value === 'object' &&
			!Array.isArray(diagnostic.value) &&
			Object.keys(diagnostic.value).length === 1 &&
			'detail' in diagnostic.value &&
			diagnostic.value.detail === 'unavailable';
		return !(failedResource || reportedFailure);
	});
	expect(unexpected).toEqual([]);
});

async function openWorkspace(page: Page, chatId: string) {
	await page.goto(`/c/${chatId}`);
	await expect(page.locator('#chat-pane')).toBeVisible();
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	if (!(await panel.isVisible())) {
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
	}
	await expect(panel).toBeVisible();
	return panel;
}

async function prepareCompletionBoundary(page: Page) {
	await expect(page.locator('#chat-input')).toBeVisible();
	await expect(page.locator('#model-selector-model-button')).toHaveAttribute(
		'aria-label',
		'Selected model: Fixture model'
	);
}

async function gateFirstChatCreation(page: Page) {
	let count = 0;
	let id = '';
	let release = () => {};
	let notify = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		notify = resolve;
	});
	await page.route('**/api/v1/chats/new', async (route) => {
		count++;
		if (count > 1) return route.continue();
		const response = await route.fetch();
		const chat = await response.json();
		id = chat.id;
		setScenario(id, 'normal');
		notify();
		await gate;
		await route.fulfill({ response });
	});
	return {
		started,
		release: () => release(),
		get id() {
			return id;
		},
		get count() {
			return count;
		}
	};
}

async function generatePair(page: Page) {
	await page.evaluate(async () => {
		// The Generate Message Pair shortcut dispatches this button's click.
		document.getElementById('generate-message-pair-button')?.click();
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
	});
}

async function expectPersistedPair(page: Page, id: string, token: string) {
	await expect
		.poll(
			async () => {
				const response = await page.request.get(`/api/v1/chats/${id}`, {
					headers: { Authorization: `Bearer ${token}` }
				});
				const chat = await response.json();
				return Object.keys(chat.chat?.history?.messages ?? {}).length;
			},
			{ timeout: 10_000 }
		)
		.toBe(2);
}

test('A-T07 Send-first holds Workspace disabled until an authenticated server id arrives', async ({
	page
}) => {
	await prepareCompletionBoundary(page);
	let release = () => {};
	let started = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const observed = new Promise<void>((resolve) => {
		started = resolve;
	});
	let createdId = '';
	let browserCreates = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/v1/chats/new') browserCreates++;
	});
	await page.route('**/api/chat/completions', async (route) => {
		// The model boundary is mocked; the chat id itself is issued by the authenticated backend.
		createdId = await createScenarioChat(page, 'empty');
		started();
		await gate;
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ chat_id: createdId })
		});
	});
	try {
		await page.locator('#chat-input').fill('First send owns creation');
		await page.locator('#send-message-button').click();
		await observed;
		const action = page.getByRole('button', { name: 'Workspace Files', exact: true });
		await expect(action).toBeVisible();
		await expect(action).toBeDisabled();
		await expect(page.getByText('Waiting for chat to save', { exact: true })).toBeVisible();
		expect(browserCreates).toBe(0);
		release();
		await expect(page).toHaveURL(`/c/${createdId}`);
		await expect(action).toBeEnabled();
		await action.click();
		await expect(page.getByRole('region', { name: 'Workspace Files' })).toBeVisible();
		expect(browserCreates).toBe(0);
		await page.screenshot({ path: `${evidence}/workspace-send-first.png`, fullPage: true });
	} finally {
		release();
	}
});

test('A-T07 Workspace-first sends through its saved id with first-message title and tags', async ({
	page
}) => {
	await prepareCompletionBoundary(page);
	const action = page.getByRole('button', { name: 'Workspace Files', exact: true });
	await action.click();
	await expect(page).toHaveURL(/\/c\/[^/]+$/);
	const id = page.url().split('/c/')[1];
	setScenario(id, 'empty');
	await expect(page.getByRole('region', { name: 'Workspace Files' })).toBeVisible();
	let completion: {
		chat_id?: string;
		background_tasks?: { title_generation?: boolean; tags_generation?: boolean };
	} | null = null;
	let creates = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/v1/chats/new') creates++;
	});
	await page.route('**/api/chat/completions', async (route) => {
		completion = route.request().postDataJSON();
		await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ chat_id: id }) });
	});
	await page.locator('#chat-input').fill('Workspace saved before first message');
	await page.locator('#send-message-button').click();
	await expect.poll(() => completion).not.toBeNull();
	expect(completion?.chat_id).toBe(id);
	expect(completion?.background_tasks).toMatchObject({
		title_generation: true,
		tags_generation: true
	});
	expect(creates).toBe(0);
	await page.screenshot({ path: `${evidence}/workspace-first-send.png`, fullPage: true });
});

test('A-T07 generated message pair joins an in-flight Workspace save without creating an orphan', async ({
	page
}) => {
	await prepareCompletionBoundary(page);
	const token = await page.evaluate(() => localStorage.token);
	const gate = await gateFirstChatCreation(page);
	try {
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
		await gate.started;
		await generatePair(page);
		expect(gate.count).toBe(1);
		gate.release();
		await expect(page).toHaveURL(`/c/${gate.id}`);
		await expectPersistedPair(page, gate.id, token);
		expect(gate.count).toBe(1);
		await page.screenshot({ path: `${evidence}/workspace-pair-single-save.png`, fullPage: true });
	} finally {
		gate.release();
	}
});

test('A-T07 Workspace joins an in-flight generated pair save without creating a second chat', async ({
	page
}) => {
	await prepareCompletionBoundary(page);
	const token = await page.evaluate(() => localStorage.token);
	const gate = await gateFirstChatCreation(page);
	try {
		await generatePair(page);
		await gate.started;
		const action = page.getByRole('button', { name: 'Workspace Files', exact: true });
		await action.click();
		await expect(action).toBeDisabled();
		expect(gate.count).toBe(1);
		gate.release();
		await expect(page).toHaveURL(`/c/${gate.id}`);
		await expect(page.getByRole('region', { name: 'Workspace Files' })).toBeVisible();
		await expectPersistedPair(page, gate.id, token);
		expect(gate.count).toBe(1);
		await page.screenshot({ path: `${evidence}/workspace-pair-first-joined.png`, fullPage: true });
	} finally {
		gate.release();
	}
});

test('A-T07 failed save stays in draft and explicitly retries without workspace requests', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.locator('#chat-input')).toBeVisible();
	const action = page.getByRole('button', { name: 'Workspace Files', exact: true });
	await page.locator('#chat-input').fill('Failed save keeps this draft');
	let creates = 0;
	const workspaceRequests: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.startsWith('/api/v1/ocu/workspaces/'))
			workspaceRequests.push(request.url());
	});
	await page.route('**/api/v1/chats/new', async (route) => {
		creates++;
		if (creates === 1)
			await route.fulfill({
				status: 503,
				body: '{"detail":"unavailable"}',
				contentType: 'application/json'
			});
		else await route.continue();
	});
	await action.click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Workspace chat could not be saved' })
	).toBeVisible();
	expect(creates).toBe(1);
	expect(workspaceRequests).toEqual([]);
	await expect(page.locator('#chat-input')).toHaveText('Failed save keeps this draft');
	await action.click();
	await expect(page).toHaveURL(/\/c\/[^/]+$/);
	await expect(page.getByRole('region', { name: 'Workspace Files' })).toBeVisible();
	expect(creates).toBe(2);
	await page.screenshot({ path: `${evidence}/workspace-save-retry.png`, fullPage: true });
});

test('A-T07 stale save after navigation never adopts old identity or opens workspace', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.locator('#chat-input')).toBeVisible();
	let release = () => {};
	let requested = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const observed = new Promise<void>((resolve) => {
		requested = resolve;
	});
	const requests: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.startsWith('/api/v1/ocu/workspaces/'))
			requests.push(request.url());
	});
	await page.route('**/api/v1/chats/new', async (route) => {
		const response = await route.fetch();
		requested();
		await gate;
		await route.fulfill({ response });
	});
	try {
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
		await observed;
		await page.goto(`/c/${context.chats.empty}`);
		await expect(page).toHaveURL(`/c/${context.chats.empty}`);
		release();
		await expect(page.getByRole('region', { name: 'Workspace Files' })).toHaveCount(0);
		expect(requests).toEqual([]);
		await page.screenshot({ path: `${evidence}/workspace-save-retired.png`, fullPage: true });
	} finally {
		release();
	}
});

test('A-T10 delayed A describe cannot replace B; empty runtime and explicit stopped Launch', async ({
	page
}) => {
	const a = await createScenarioChat(page, 'normal');
	const b = await createScenarioChat(page, 'empty');
	let release = () => {};
	let requested = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const observed = new Promise<void>((resolve) => {
		requested = resolve;
	});
	await page.route(`**/api/v1/ocu/workspaces/${a}`, async (route) => {
		const response = await route.fetch();
		requested();
		await gate;
		await route.fulfill({ response });
	});
	try {
		await page.goto(`/c/${a}`);
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
		await observed;
		const panel = await openWorkspace(page, b);
		release();
		await expect(panel.getByText('No workspace files yet.')).toBeVisible();
		await panel.getByRole('button', { name: 'Browser', exact: true }).click();
		const frame = panel.locator('iframe[title="Workspace Browser"]');
		await expect(frame).toHaveAttribute('src', `/ocu/preview/${b}?embed=browser`);
		await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
		await expect
			.poll(() => records().some((row) => row.target.startsWith(`/browser/${b}/status`)))
			.toBe(true);
		await page.screenshot({ path: `${evidence}/workspace-browser-empty.png`, fullPage: true });
		setScenario(b, 'stopped');
		await panel.getByRole('button', { name: 'Files', exact: true }).click();
		await panel.getByRole('button', { name: 'Refresh workspace files' }).click();
		await expect(panel.getByRole('button', { name: 'Launch' })).toBeVisible();
		await expect(panel.locator('iframe[title="Workspace Browser"]')).toHaveCount(0);
		const launch = page.waitForRequest(
			(request) =>
				request.method() === 'POST' &&
				new URL(request.url()).pathname === `/api/v1/ocu/workspaces/${b}/launch`
		);
		await panel.getByRole('button', { name: 'Launch' }).click();
		await launch;
		await page.screenshot({ path: `${evidence}/workspace-explicit-launch.png`, fullPage: true });
	} finally {
		release();
	}
});

test('A-T10 stopped runtime automatically returns to Files and re-arms the selected Office preview', async ({
	page
}) => {
	const id = await createScenarioChat(page, 'valid');
	const panel = await openWorkspace(page, id);
	await panel.getByRole('button', { name: 'valid.docx' }).click();
	const office = page.frameLocator('iframe[title="Office preview: valid.docx"]');
	await expect(office.getByText('Verified Office document')).toBeVisible({ timeout: 30_000 });
	let stopped = false;
	await page.route(`**/api/v1/ocu/workspaces/${id}`, async (route) => {
		if (!stopped) return route.continue();
		const response = await route.fetch();
		const body = await response.json();
		await route.fulfill({
			response,
			json: { ...body, status: 'stopped', views: ['files'] }
		});
	});
	await panel.getByRole('button', { name: 'Browser', exact: true }).click();
	await expect(panel.locator('iframe[title="Workspace Browser"]')).toBeVisible();
	stopped = true;
	await panel.getByRole('button', { name: 'Refresh workspace files' }).click();
	await expect(panel.getByRole('button', { name: 'Files', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(panel.locator('iframe[title="Workspace Browser"]')).toHaveCount(0);
	await expect(panel.locator('iframe[title="Office preview: valid.docx"]')).toBeVisible();
	await expect(office.getByText('Verified Office document')).toBeVisible({ timeout: 8_000 });
	await page.screenshot({ path: `${evidence}/workspace-office-forced-files.png`, fullPage: true });
});

test('A-T10 runtime iframe identity, selected Files, native Artifacts, and twenty transport teardowns', async ({
	page
}) => {
	test.setTimeout(120_000);
	const id = await createScenarioChat(page, 'normal', true);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	const panel = await openWorkspace(page, id);
	await panel.getByRole('button', { name: 'page.html' }).click();
	await panel.getByRole('button', { name: 'Browser', exact: true }).click();
	const frame = panel.locator('iframe[title="Workspace Browser"]');
	await expect(frame).toBeVisible();
	const sameFrame = await frame.elementHandle();
	await page.locator('#chat-input').fill('Changing a draft must not reset the browser');
	await expect(frame).toBeVisible();
	expect(
		await page.evaluate(
			(node) => node === document.querySelector('iframe[title="Workspace Browser"]'),
			sameFrame
		)
	).toBe(true);
	await panel.getByRole('button', { name: 'Terminal', exact: true }).click();
	await expect(frame).toHaveCount(0);
	await expect(panel.locator('iframe[title="Workspace Terminal"]')).toHaveAttribute(
		'src',
		`/ocu/preview/${id}?embed=terminal`
	);
	await expect
		.poll(() => records().some((row) => row.target.startsWith(`/terminal/${id}/sessions`)))
		.toBe(true);
	await panel.getByRole('button', { name: 'Files', exact: true }).click();
	await expect(panel.getByRole('button', { name: 'page.html' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(panel.locator('iframe[title="Workspace Terminal"]')).toHaveCount(0);
	await page.locator('#chat-context-menu-button').click();
	await expect(page.locator('#chat-artifacts-button')).toBeVisible();
	await page.locator('#chat-artifacts-button').click();
	await expect(panel).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Workspace Files', exact: true })).toBeVisible();
	await page.screenshot({
		path: `${evidence}/workspace-native-artifacts-return.png`,
		fullPage: true
	});
	await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
	await expect(panel).toBeVisible();
	const start = records().filter(
		(row) => row.ws_event === 'open' && row.target.includes(`/browser/${id}/`)
	).length;
	for (let cycle = 0; cycle < 20; cycle++) {
		await panel.getByRole('button', { name: 'Browser', exact: true }).click();
		await expect(panel.locator('iframe[title="Workspace Browser"]')).toBeVisible();
		await expect
			.poll(
				() =>
					records().filter(
						(row) => row.ws_event === 'open' && row.target.includes(`/browser/${id}/`)
					).length
			)
			.toBeGreaterThan(start + cycle);
		await panel.getByRole('button', { name: 'Close workspace' }).click();
		await expect(panel).toHaveCount(0);
		await expect
			.poll(() => {
				const rows = records().filter(
					(row) => row.target.includes(`/browser/${id}/`) && row.ws_event
				);
				return (
					rows.filter((row) => row.ws_event === 'open').length -
					rows.filter((row) => row.ws_event === 'close').length
				);
			})
			.toBe(0);
		if (cycle < 19) {
			await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
			await expect(panel).toBeVisible();
		}
	}
	expect(errors).toEqual([]);
	await page.screenshot({
		path: `${evidence}/workspace-twenty-runtime-teardowns.png`,
		fullPage: true
	});
});

test('A-T07 narrow Workspace entry stays reachable with Controls closed and in the mobile drawer', async ({
	page
}) => {
	const id = await createScenarioChat(page, 'empty');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`/c/${id}`);
	await expect(page.locator('#chat-input')).toBeVisible();
	const action = page.getByRole('button', { name: 'Workspace Files', exact: true });
	const controls = page.locator('button[aria-label="Controls"]');
	await expect(action).toBeVisible();
	const chip = await action.boundingBox();
	const trigger = await controls.boundingBox();
	expect(chip).not.toBeNull();
	expect(chip!.x).toBeGreaterThanOrEqual(0);
	expect(chip!.x + chip!.width).toBeLessThanOrEqual(390);
	expect(trigger).not.toBeNull();
	expect(
		chip!.x >= trigger!.x + trigger!.width ||
			trigger!.x >= chip!.x + chip!.width ||
			chip!.y >= trigger!.y + trigger!.height ||
			trigger!.y >= chip!.y + chip!.height
	).toBe(true);
	await page.screenshot({ path: `${evidence}/workspace-narrow-closed.png`, fullPage: true });
	await controls.click();
	await expect(action).toBeVisible();
	await action.click();
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	await expect(panel).toBeVisible();
	await page.screenshot({ path: `${evidence}/workspace-narrow-open.png`, fullPage: true });
});

test('A-T01 positive control confirms credentials are observable on owner documents', async ({
	page
}) => {
	const id = context.chats.normal;
	const documents: boolean[] = [];
	page.on('request', (request) => {
		if (
			request.isNavigationRequest() &&
			request.resourceType() === 'document' &&
			new URL(request.url()).pathname === `/c/${id}`
		) {
			void request.allHeaders().then((headers) => documents.push(Boolean(headers.cookie)));
		}
	});
	await page.goto(`/c/${id}`);
	await expect(page.locator('#chat-pane')).toBeVisible();
	await expect.poll(() => documents).toContain(true);
});
