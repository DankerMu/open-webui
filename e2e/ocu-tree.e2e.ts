import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { openAuthenticatedPage, test } from './ocu-auth';
import { context, createScenarioChat, evidence, setScenario } from './ocu-fixtures';
import type { WorkspaceListing } from '../src/lib/apis/ocu';

type Diagnostic = { kind: 'console' | 'pageerror'; text: string; url: string; value?: unknown };

const consoleObservations = new WeakMap<
	Page,
	{ diagnostics: Diagnostic[]; pending: Promise<void>[] }
>();

test.beforeEach(async ({ page }) => {
	const record = { diagnostics: [] as Diagnostic[], pending: [] as Promise<void>[] };
	consoleObservations.set(page, record);
	page.on('pageerror', (error) =>
		record.diagnostics.push({ kind: 'pageerror', text: String(error), url: '' })
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
	await openAuthenticatedPage(page);
});

test.afterEach(async ({ page }) => {
	const record = consoleObservations.get(page)!;
	await Promise.all(record.pending);
	expect(record.diagnostics).toEqual([]);
});

async function openWorkspace(page: Page, chatId = context.chats.nested) {
	await page.goto(`/c/${chatId}`);
	await expect(page.locator('#chat-pane')).toBeVisible();
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	if (!(await panel.isVisible())) {
		if (!(await page.locator('#controls-container').isVisible())) {
			await page.locator('button[aria-label="Controls"]').click();
		}
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
	}
	await expect(panel).toBeVisible();
	return panel;
}

async function selectedPreviewFit(panel: Locator) {
	return panel.evaluate(() => {
		const selected = document.querySelector(
			'[aria-label="Selected workspace file"]'
		) as HTMLElement | null;
		const bar = selected?.querySelector('[data-selected-bar]') as HTMLElement | null;
		const surface = selected?.querySelector('[data-selected-preview]') as HTMLElement | null;
		const section = selected?.closest('section') as HTMLElement | null;
		if (!selected || !bar || !surface || !section) return null;
		const selectedBox = selected.getBoundingClientRect();
		const barBox = bar.getBoundingClientRect();
		const surfaceBox = surface.getBoundingClientRect();
		const panelBox = section.getBoundingClientRect();
		return {
			barVisible: barBox.height > 0 && barBox.width > 0,
			fits: selectedBox.right <= panelBox.right + 1 && selectedBox.left >= panelBox.left - 1,
			overflow: selected.scrollWidth > selected.clientWidth + 1,
			remaining: surfaceBox.height,
			belowBar: surfaceBox.top >= barBox.bottom - 1
		};
	});
}

test('nested Files tree shows folders, indentation, collapse and selection geometry', async ({
	page
}) => {
	const panel = await openWorkspace(page);
	const list = panel.locator('ul[aria-label="Workspace file list"]');
	const folder = (path: string) =>
		panel.getByRole('button', { name: `Folder ${path}`, exact: true });
	const packages = folder('packages/core');
	for (const path of ['packages', 'packages/core', 'packages/core/src', 'reports'])
		await expect(folder(path)).toHaveAttribute('aria-expanded', 'true');
	const folderPads = await Promise.all(
		['packages', 'packages/core', 'packages/core/src'].map((path) =>
			folder(path).evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft))
		)
	);
	expect(folderPads[1]).toBeGreaterThan(folderPads[0]);
	expect(folderPads[2]).toBeGreaterThan(folderPads[1]);
	await expect(panel.getByRole('button', { name: 'packages/core/src/index.py' })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'reports/summary.docx' })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'page.html', exact: true })).toBeVisible();
	const nestedPad = await panel
		.getByRole('button', { name: 'packages/core/src/index.py' })
		.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
	const rootPad = await panel
		.getByRole('button', { name: 'page.html', exact: true })
		.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
	expect(nestedPad).toBeGreaterThan(folderPads[2]);
	expect(folderPads[0]).toBe(rootPad);
	await expect(list.locator('> li')).toHaveCount(34);
	await expect(list.getByRole('button', { name: 'More files' })).toHaveCount(0);

	const unselected = await list.evaluate((node) => {
		const bounds = node.getBoundingClientRect();
		const panelBounds = node.closest('section')!.getBoundingClientRect();
		return {
			overflow: node.scrollHeight > node.clientHeight + 1,
			ratio: bounds.height / panelBounds.height
		};
	});
	expect(unselected.overflow).toBe(true);
	expect(unselected.ratio).toBeGreaterThan(0.4);

	await panel.getByRole('button', { name: 'page.html', exact: true }).click();
	await expect(panel.getByRole('button', { name: 'page.html', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const selectedStyle = await panel
		.getByRole('button', { name: 'page.html', exact: true })
		.evaluate((node) => {
			const style = getComputedStyle(node);
			return { weight: style.fontWeight, background: style.backgroundColor };
		});
	expect(Number(selectedStyle.weight)).toBeGreaterThanOrEqual(500);
	expect(selectedStyle.background).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
	const selected = await list.evaluate((node) => {
		const bounds = node.getBoundingClientRect();
		const panelBounds = node.closest('section')!.getBoundingClientRect();
		const preview = node
			.closest('section')!
			.querySelector('[aria-label="Selected workspace file"]')
			?.getBoundingClientRect();
		return {
			ratio: bounds.height / panelBounds.height,
			previewHeight: preview?.height ?? 0
		};
	});
	expect(selected.ratio).toBeLessThanOrEqual(0.42);
	expect(selected.previewHeight).toBeGreaterThan(40);

	const listingCalls: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.includes('/api/outputs/')) listingCalls.push(request.url());
	});
	await packages.click();
	await expect(packages).toHaveAttribute('aria-expanded', 'false');
	await expect(packages).toBeVisible();
	await expect(folder('packages/core/src')).toBeHidden();
	await expect(panel.getByRole('button', { name: 'packages/core/src/index.py' })).toBeHidden();
	await expect(folder('packages')).toBeVisible();
	await expect(panel.getByRole('button', { name: 'page.html', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await packages.click();
	await expect(packages).toHaveAttribute('aria-expanded', 'true');
	await expect(panel.getByRole('button', { name: 'packages/core/src/index.py' })).toBeVisible();
	expect(listingCalls).toEqual([]);

	for (const theme of ['light', 'dark']) {
		await page.evaluate((value) => localStorage.setItem('theme', value), theme);
		await page.reload();
		await expect(page.locator('html')).toHaveClass(new RegExp(theme));
		const themed = await openWorkspace(page);
		const themedFolder = (path: string) =>
			themed.getByRole('button', { name: `Folder ${path}`, exact: true });
		const topHeader = themedFolder('packages');
		const packagesHeader = themedFolder('packages/core');
		const reportsHeader = themedFolder('reports');
		const selectedRow = themed.getByRole('button', { name: 'page.html', exact: true });
		await expect(packagesHeader).toHaveAttribute('aria-expanded', 'true');
		await expect(reportsHeader).toHaveAttribute('aria-expanded', 'true');
		await selectedRow.click();
		await expect(selectedRow).toHaveAttribute('aria-pressed', 'true');
		await packagesHeader.click();
		await expect(packagesHeader).toHaveAttribute('aria-expanded', 'false');
		await expect(themedFolder('packages/core/src')).toBeHidden();
		const framed = themed.locator('ul[aria-label="Workspace file list"]');
		const rootRows = [
			themed.getByRole('button', { name: 'notes.bin', exact: true }),
			themed.getByRole('button', { name: 'page.html', exact: true }),
			themed.getByRole('button', { name: 'photo.png', exact: true })
		];
		const targets = [topHeader, packagesHeader, reportsHeader, ...rootRows];
		for (const target of targets) {
			await expect(target).toBeVisible();
		}
		const inView = await framed.evaluate(
			(list, names) => {
				const listBox = list.getBoundingClientRect();
				const viewport = { width: window.innerWidth, height: window.innerHeight };
				return names.map((name) => {
					const button = [...list.querySelectorAll('button')].find(
						(node) => node.getAttribute('aria-label') === name
					);
					if (!button) return { name, present: false };
					const box = button.getBoundingClientRect();
					return {
						name,
						present: true,
						inList:
							box.top >= listBox.top - 0.5 &&
							box.bottom <= listBox.bottom + 0.5 &&
							box.left >= listBox.left - 0.5 &&
							box.right <= listBox.right + 0.5,
						inViewport:
							box.top >= 0 &&
							box.left >= 0 &&
							box.bottom <= viewport.height &&
							box.right <= viewport.width
					};
				});
			},
			[
				'Folder packages',
				'Folder packages/core',
				'Folder reports',
				'notes.bin',
				'page.html',
				'photo.png'
			]
		);
		for (const row of inView) {
			expect(row.present, row.name).toBe(true);
			expect(row.inList, row.name).toBe(true);
			expect(row.inViewport, row.name).toBe(true);
		}
		const selectedProof = await selectedRow.evaluate((node) => {
			const style = getComputedStyle(node);
			return { weight: style.fontWeight, background: style.backgroundColor };
		});
		expect(Number(selectedProof.weight)).toBeGreaterThanOrEqual(500);
		expect(selectedProof.background).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
		const htmlFit = await selectedPreviewFit(themed);
		expect(htmlFit).not.toBeNull();
		expect(htmlFit!.barVisible).toBe(true);
		expect(htmlFit!.fits).toBe(true);
		expect(htmlFit!.overflow).toBe(false);
		expect(htmlFit!.remaining).toBeGreaterThan(40);
		expect(htmlFit!.belowBar).toBe(true);
		await themed.screenshot({
			path: `${evidence}/workspace-tree-${theme}.png`,
			animations: 'disabled'
		});
		await themed.screenshot({
			path: `${evidence}/workspace-selected-html-${theme}.png`,
			animations: 'disabled'
		});
		await themed.getByRole('button', { name: 'notes.bin', exact: true }).click();
		await expect(themed.getByRole('button', { name: 'notes.bin', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(themed.getByText('Preview not supported for this file type')).toBeVisible();
		const unsupportedFit = await selectedPreviewFit(themed);
		expect(unsupportedFit).not.toBeNull();
		expect(unsupportedFit!.barVisible).toBe(true);
		expect(unsupportedFit!.fits).toBe(true);
		expect(unsupportedFit!.overflow).toBe(false);
		expect(unsupportedFit!.remaining).toBeGreaterThan(40);
		expect(unsupportedFit!.belowBar).toBe(true);
		await themed.screenshot({
			path: `${evidence}/workspace-selected-unsupported-${theme}.png`,
			animations: 'disabled'
		});
	}
});

test('refresh updates the selected file row glyph without replacing its selectable identity', async ({
	page
}) => {
	const chatId = await createScenarioChat(page, 'deleted');
	const listingPath = `/ocu/api/outputs/${chatId}`;
	const listingRoute = (url: URL) => url.pathname === listingPath;
	const injectTargetKind = async (route: Route) => {
		const response = await route.fetch();
		if (response.status() !== 200) {
			await route.fulfill({ response });
			return;
		}
		const listing: WorkspaceListing = await response.json();
		await route.fulfill({
			response,
			json: {
				...listing,
				files: listing.files.map((file) =>
					file.path === 'report.html'
						? { ...file, type: 'text', mime: 'text/plain' }
						: file.path === 'final.html'
							? { ...file, type: 'html', mime: 'text/html' }
							: file
				)
			}
		});
	};
	await page.route(listingRoute, injectTargetKind);
	try {
		const initialListingResponse = page.waitForResponse(
			(response) => new URL(response.url()).pathname === listingPath && response.status() === 200
		);
		const panel = await openWorkspace(page, chatId);
		const initialResponse = await initialListingResponse;
		const initialListing: WorkspaceListing = await initialResponse.json();
		expect(initialListing.revision).toBe(1);
		const initialTarget = initialListing.files.find((file) => file.path === 'report.html');
		expect(initialTarget).toMatchObject({
			file_id: 'fixture-report',
			name: 'report.html',
			url: `/ocu/files/${chatId}/report.html`,
			revision: 1,
			type: 'text',
			mime: 'text/plain',
			size: 128
		});
		const initialEtag = initialResponse.headers()['etag'];
		expect(initialEtag).toBeDefined();
		const list = panel.locator('ul[aria-label="Workspace file list"]');
		const target = list.getByRole('button', { name: 'report.html', exact: true });
		const control = list.getByRole('button', { name: 'page.html', exact: true });
		const savedSelection = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === `/api/v1/ocu/workspaces/${chatId}/prefs` &&
				response.request().method() === 'PUT' &&
				response.request().postDataJSON()?.selected_file_id === 'fixture-report'
		);
		await target.click();
		const preference = await savedSelection;
		expect(preference.ok()).toBe(true);
		expect((await preference.json()).prefs).toMatchObject({
			selected_file_id: 'fixture-report'
		});
		await expect(target).toHaveAttribute('aria-pressed', 'true');
		await expect(target.locator('[data-file-kind]')).toHaveAttribute('data-file-kind', 'document');
		await expect(control.locator('[data-file-kind]')).toHaveAttribute('data-file-kind', 'web');
		const initialRow = await target.elementHandle();
		expect(initialRow).not.toBeNull();
		await expect(target.locator('[data-file-kind] svg')).toBeVisible();
		await expect(control.locator('[data-file-kind] svg')).toBeVisible();
		const initialGlyph = await target
			.locator('[data-file-kind] svg')
			.evaluate((svg) => svg.innerHTML);
		const controlGlyph = await control
			.locator('[data-file-kind] svg')
			.evaluate((svg) => svg.innerHTML);
		expect(initialGlyph).not.toBe(controlGlyph);

		const refreshedListingResponse = page.waitForResponse(async (response) => {
			if (new URL(response.url()).pathname !== listingPath || response.status() !== 200)
				return false;
			const listing: WorkspaceListing = await response.json();
			return (
				listing.revision > initialListing.revision &&
				listing.files.some((file) => file.path === 'final.html')
			);
		});
		setScenario(chatId, 'renamed');
		await panel.getByRole('button', { name: 'Refresh workspace files', exact: true }).click();
		const refreshedResponse = await refreshedListingResponse;
		const refreshedListing: WorkspaceListing = await refreshedResponse.json();
		expect(refreshedListing.revision).toBe(2);
		expect(refreshedResponse.headers()['etag']).toBeDefined();
		expect(refreshedResponse.headers()['etag']).not.toBe(initialEtag);
		expect(refreshedListing.files.find((file) => file.path === 'final.html')).toMatchObject({
			file_id: initialTarget!.file_id,
			name: 'final.html',
			url: `/ocu/files/${chatId}/final.html`,
			revision: 2,
			type: 'html',
			mime: 'text/html',
			size: initialTarget!.size
		});
		const refreshed = list.getByRole('button', { name: 'final.html', exact: true });
		await expect(refreshed).toBeVisible();
		await expect(refreshed).toHaveAttribute('aria-label', 'final.html');
		await expect(refreshed.locator('[data-file-kind]')).toHaveAttribute('data-file-kind', 'web');
		await expect(refreshed).toHaveAttribute('aria-pressed', 'true');
		expect(await refreshed.evaluate((node, previous) => node === previous, initialRow!)).toBe(true);
		await expect(control.locator('[data-file-kind]')).toHaveAttribute('data-file-kind', 'web');
		await expect(refreshed.locator('[data-file-kind] svg')).toBeVisible();
		await expect(control.locator('[data-file-kind] svg')).toBeVisible();
		const unchangedControlGlyph = await control
			.locator('[data-file-kind] svg')
			.evaluate((svg) => svg.innerHTML);
		expect(unchangedControlGlyph).toBe(controlGlyph);
		await panel.screenshot({
			path: `${evidence}/workspace-tree-kind-transition.png`,
			animations: 'disabled'
		});
		const refreshedGlyph = await refreshed
			.locator('[data-file-kind] svg')
			.evaluate((svg) => svg.innerHTML);
		expect(refreshedGlyph).toBe(unchangedControlGlyph);
		expect(refreshedGlyph).not.toBe(initialGlyph);
	} finally {
		await page.unroute(listingRoute, injectTargetKind);
	}
});

test('broker TSV metadata shows sheet icons without granting Office capabilities', async ({
	page
}) => {
	const chatId = context.chats.nested;
	const listingRoute = `**/ocu/api/outputs/${chatId}`;
	const injectTsv = async (route: Route) => {
		const response = await route.fetch();
		if (response.status() !== 200) {
			await route.fulfill({ response });
			return;
		}
		const listing: WorkspaceListing = await response.json();
		await route.fulfill({
			response,
			json: {
				...listing,
				files: listing.files.map((file) =>
					file.file_id === 'fixture-notes.bin'
						? { ...file, type: 'spreadsheet', mime: 'text/tab-separated-values' }
						: file
				)
			}
		});
	};
	await page.route(listingRoute, injectTsv);
	try {
		const initialListing = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === `/ocu/api/outputs/${chatId}` &&
				response.status() === 200 &&
				response.request().headers()['if-none-match'] === undefined,
			{ timeout: 10_000 }
		);
		const pollRequest = page.waitForRequest(
			(request) =>
				new URL(request.url()).pathname === `/ocu/api/outputs/${chatId}` &&
				request.headers()['if-none-match'] !== undefined,
			{ timeout: 10_000 }
		);
		const pollResponse = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === `/ocu/api/outputs/${chatId}` &&
				response.request().headers()['if-none-match'] !== undefined,
			{ timeout: 10_000 }
		);
		const panel = await openWorkspace(page);
		const initialEtag = (await initialListing).headers()['etag'];
		const row = panel.getByRole('button', { name: 'notes.bin', exact: true });

		const savedSelection = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === `/api/v1/ocu/workspaces/${chatId}/prefs` &&
				response.request().method() === 'PUT' &&
				response.request().postDataJSON()?.selected_file_id === 'fixture-notes.bin',
			{ timeout: 10_000 }
		);
		await row.click();
		const preference = await savedSelection;
		expect(preference.ok()).toBe(true);
		expect((await preference.json()).prefs).toMatchObject({
			selected_file_id: 'fixture-notes.bin'
		});
		const conditionalRequest = await pollRequest;
		expect(conditionalRequest.headers()['if-none-match']).toBe(initialEtag);
		const conditionalResponse = await pollResponse;
		expect(conditionalResponse.status()).toBe(304);
		expect(conditionalResponse.headers()['etag']).toBe(initialEtag);
		await expect(row.locator('[data-file-kind]')).toHaveAttribute('data-file-kind', 'sheet');
		await expect(row.locator('[data-file-kind] svg')).toBeVisible();
		await expect(row).toHaveAttribute('aria-pressed', 'true');

		const selected = panel.locator('[aria-label="Selected workspace file"]');
		const bar = selected.locator('[data-selected-bar]');
		await expect(bar.locator('[data-file-kind]')).toHaveAttribute('data-file-kind', 'sheet');
		await expect(bar.locator('[data-file-kind] svg')).toBeVisible();
		await expect(bar.locator('[data-selected-name]')).toHaveText('notes.bin');
		await expect(selected.getByText('Preview not supported for this file type')).toBeVisible();
		await expect(selected.locator('[data-selected-preview] iframe')).toHaveCount(0);
		await expect(bar.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
		await expect(bar.getByRole('button', { name: 'Version history', exact: true })).toHaveCount(0);

		const downloadUrl = `/ocu/files/${chatId}/notes.bin?download=1`;
		const downloadLink = bar.getByRole('link', { name: 'Download notes.bin', exact: true });
		await expect(downloadLink).toHaveAttribute('href', downloadUrl);
		await expect(downloadLink).toHaveAttribute('download', 'notes.bin');
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 10_000 }),
			downloadLink.click()
		]);
		expect(download.url()).toBe(new URL(downloadUrl, context.origin).href);
		expect(download.suggestedFilename()).toBe('notes.bin');
		await panel.screenshot({
			path: `${evidence}/workspace-tsv-kind.png`,
			animations: 'disabled'
		});
	} finally {
		await page.unroute(listingRoute, injectTsv);
	}
});

test('unsupported-name files list with a marker and offer no action', async ({ page }) => {
	const chatId = await createScenarioChat(page, 'unsupported_name');
	const fetched: string[] = [];
	page.context().on('request', (request) => {
		const address = new URL(request.url());
		if (address.pathname.startsWith('/ocu/')) fetched.push(address.pathname + address.search);
	});
	const panel = await openWorkspace(page, chatId);
	await expect(panel.locator('ul[aria-label="Workspace file list"] > li')).toHaveCount(4);
	const row = (name: string) => panel.getByRole('button', { name, exact: true });
	// OCU display forms: b'\xb1\xa8\xb8\xe6.docx' decoded with backslashreplace, and a backslash name.
	const unsupported = ['\\xb1\\xa8\\xb8\\xe6.docx', 'a\\b.html'];
	for (const name of unsupported)
		await expect(row(name).locator('[data-unsupported-name]')).toHaveText('Unsupported name');
	for (const name of ['page.html', 'diagram.svg'])
		await expect(row(name).locator('[data-unsupported-name]')).toHaveCount(0);
	await row('page.html').click();
	await expect(panel.locator('iframe[title="page.html"]')).toBeVisible();

	const selected = panel.locator('[aria-label="Selected workspace file"]');
	const bar = selected.locator('[data-selected-bar]');
	for (const [index, name] of unsupported.entries()) {
		await row(name).click();
		await expect(row(name)).toHaveAttribute('aria-pressed', 'true');
		await expect(bar.locator('[data-selected-name]')).toHaveText(name);
		await expect(selected.locator('[data-selected-preview]').getByRole('status')).toHaveText(
			'This file name cannot be opened here. Rename it in the terminal to open or download it.'
		);
		await expect(panel.locator('iframe')).toHaveCount(0);
		await expect(panel.getByText('Connecting Office preview')).toHaveCount(0);
		await expect(selected.locator('a')).toHaveCount(0);
		await expect(bar.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
		await expect(bar.getByRole('button', { name: 'Version history', exact: true })).toHaveCount(0);
		await page.screenshot({
			path: `${evidence}/workspace-unsupported-name-${index + 1}.png`,
			fullPage: true
		});
	}
	// The observer sees frame loads (positive control); no file request is made for the unsupported rows.
	expect(fetched).toContain(`/ocu/files/${chatId}/page.html?revision=1`);
	const files = fetched.filter((target) => target.startsWith(`/ocu/files/${chatId}/`));
	expect(files.filter((target) => !target.startsWith(`/ocu/files/${chatId}/page.html`))).toEqual(
		[]
	);
	expect(fetched.filter((target) => target.startsWith('/ocu/api/office/'))).toEqual([]);
	expect(fetched.filter((target) => target.includes('embed=files'))).toEqual([]);
});
