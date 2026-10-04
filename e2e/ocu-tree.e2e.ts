import { expect, type Page } from '@playwright/test';
import { openAuthenticatedPage, test } from './ocu-auth';
import { context, evidence } from './ocu-fixtures';

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

async function openWorkspace(page: Page) {
	await page.goto(`/c/${context.chats.nested}`);
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

test('nested Files tree shows headers, indentation, collapse and selection geometry', async ({
	page
}) => {
	const panel = await openWorkspace(page);
	const list = panel.locator('ul[aria-label="Workspace file list"]');
	const packages = panel.getByRole('button', { name: 'Folder packages/core/src' });
	const reports = panel.getByRole('button', { name: 'Folder reports' });
	await expect(packages).toHaveAttribute('aria-expanded', 'true');
	await expect(reports).toHaveAttribute('aria-expanded', 'true');
	await expect(panel.getByRole('button', { name: 'packages/core/src/index.py' })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'reports/summary.docx' })).toBeVisible();
	await expect(panel.getByRole('button', { name: 'page.html', exact: true })).toBeVisible();
	const nestedPad = await panel
		.getByRole('button', { name: 'packages/core/src/index.py' })
		.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
	const rootPad = await panel
		.getByRole('button', { name: 'page.html', exact: true })
		.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
	expect(nestedPad).toBeGreaterThan(rootPad);
	await expect(list.locator('> li')).toHaveCount(32);
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
	await expect(panel.getByRole('button', { name: 'packages/core/src/index.py' })).toBeHidden();
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
		await expect(themed.getByRole('button', { name: 'Folder packages/core/src' })).toBeVisible();
		await themed.screenshot({
			path: `${evidence}/workspace-tree-${theme}.png`,
			animations: 'disabled'
		});
	}
});
