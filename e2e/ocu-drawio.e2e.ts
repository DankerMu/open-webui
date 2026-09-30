import { expect, type Page, type Request } from '@playwright/test';
import { openAuthenticatedPage, test } from './ocu-auth';
import { context, evidence } from './ocu-fixtures';

const CELLPHONE = '/ocu/static/drawio/img/telecommunication/Cellphone_128x128.png';
const AND_STENCIL = '/ocu/static/drawio/stencils/electrical/logic_gates.xml';
const VIEWER = '/ocu/static/drawio/js/viewer-static.min.js';
const MATH = '/ocu/static/drawio/math4/';

function openWorkspace(page: Page, scenario: string) {
	return page.goto(`/c/${context.chats[scenario]}`).then(async () => {
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
	});
}

test.beforeEach(async ({ page }) => {
	await openAuthenticatedPage(page);
});

test('authorized owner standalone Drawio renders local image, AND stencil and math', async ({
	page
}) => {
	test.setTimeout(90_000);
	const errors: string[] = [];
	const denied: string[] = [];
	const local: Array<{ path: string; status: number }> = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.route('**/*', (route) => {
		const url = route.request().url();
		if (/^https?:/.test(url) && !url.startsWith(`${context.origin}/`)) {
			denied.push(url);
			return route.abort();
		}
		return route.continue();
	});
	page.on('response', (response) => {
		const address = new URL(response.url());
		if (address.origin === context.origin && address.pathname.startsWith('/ocu/static/drawio/')) {
			local.push({ path: address.pathname, status: response.status() });
		}
	});
	const browserStatus = page.waitForResponse((response) => {
		const address = new URL(response.url());
		return (
			address.origin === context.origin &&
			address.pathname === `/ocu/browser/${context.chats.drawio}/status` &&
			response.ok()
		);
	});
	await page.goto(`${context.origin}/ocu/preview/${context.chats.drawio}`);
	const status = await (await browserStatus).json();
	expect(status.active).toBe(true);
	const browserTab = page.locator('.view-tab', { hasText: 'Browser' });
	await expect(browserTab).toHaveClass(/active/);
	await expect(browserTab.locator('.tab-dot')).toBeVisible();
	await page.locator('.view-tab', { hasText: 'Files' }).click();
	await expect(page.locator('.view-tab', { hasText: 'Files' })).toHaveClass(/active/);
	const selector = page.locator('.file-selector-btn');
	await expect(selector).toBeVisible();
	await expect(selector).toBeEnabled();
	await selector.click();
	await page
		.locator('.dropdown-menu.open .item-name')
		.getByText('diagram.drawio', { exact: true })
		.click();
	const host = page.locator('.drawio-host');
	const graph = host.locator(':scope > svg');
	await expect(graph).toBeVisible({ timeout: 30_000 });
	await expect(host.getByText('Page one', { exact: true })).toBeVisible();
	await expect(host.getByText('AND', { exact: true })).toBeVisible();

	const ordinary = await graph.evaluate((svg) => {
		const labels = [...svg.querySelectorAll('text, tspan, foreignObject')];
		const label = labels.find((node) => (node.textContent || '').includes('Page one'));
		let group = label?.closest('g');
		while (group && !group.querySelector('rect, path, ellipse')) {
			group = group.parentElement?.closest('g') ?? null;
		}
		const shape = group?.querySelector('rect, path, ellipse');
		if (!shape) return { kind: '', curved: true };
		const name = shape.tagName.toLowerCase();
		const d = shape.getAttribute('d') || '';
		return {
			kind: name,
			curved: name === 'path' ? /[AaCcQqSs]/.test(d) : name === 'ellipse'
		};
	});
	expect(ordinary.kind === 'rect' || (ordinary.kind === 'path' && !ordinary.curved)).toBe(true);

	const andGeometry = await graph.evaluate((svg) => {
		const labels = [...svg.querySelectorAll('text, tspan, foreignObject')];
		const label = labels.find((node) => (node.textContent || '').trim() === 'AND');
		let group = label?.closest('g');
		while (group && group.querySelectorAll('path').length < 2) {
			group = group.parentElement?.closest('g') ?? null;
		}
		const paths = [...(group?.querySelectorAll('path') ?? [])].map(
			(path) => path.getAttribute('d') || ''
		);
		return {
			curved: paths.some((d) => /[AaCcQqSs]/.test(d)),
			wired: paths.some((d) => d.includes('M') && d.includes('L') && !/[AaCcQqSs]/.test(d)),
			pathCount: paths.length
		};
	});
	expect(andGeometry.curved).toBe(true);
	expect(andGeometry.wired && andGeometry.pathCount >= 2).toBe(true);

	const image = graph.locator('image');
	await expect(image).toBeVisible();
	const href = await image.evaluate(
		(node) =>
			(node as SVGImageElement).href?.baseVal ||
			node.getAttribute('href') ||
			node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
			''
	);
	expect(href).toContain(CELLPHONE);
	const decoded = await page.evaluate(async (src) => {
		const img = new Image();
		img.src = src;
		await img.decode();
		return { width: img.naturalWidth, height: img.naturalHeight };
	}, href);
	expect(decoded.width).toBeGreaterThan(0);
	expect(decoded.height).toBeGreaterThan(0);

	await expect(host.locator('mjx-container, mjx-math, .MathJax')).toBeVisible();
	const math = await host.evaluate((node) => {
		const mjx = node.querySelector('mjx-container, mjx-math, .MathJax');
		return {
			hasMjx: Boolean(mjx),
			text: (mjx && mjx.textContent) || '',
			hasGlyph: Boolean(
				node.querySelector('mjx-mi, mjx-mo, mjx-mn, mjx-mrow, use[data-c], [data-mjx-texclass]')
			)
		};
	});
	expect(math.hasMjx).toBe(true);
	expect(math.hasGlyph || /E/.test(math.text)).toBe(true);

	expect(local.some((row) => row.path === VIEWER && row.status === 200)).toBe(true);
	expect(local.some((row) => row.path === AND_STENCIL && row.status === 200)).toBe(true);
	expect(local.some((row) => row.path === CELLPHONE && row.status === 200)).toBe(true);
	expect(local.some((row) => row.path.startsWith(MATH) && row.status === 200)).toBe(true);
	expect(denied).toEqual([]);
	expect(errors).toEqual([]);
	await page.screenshot({ path: `${evidence}/workspace-drawio-standalone.png`, fullPage: true });
});

test('workspace Files keeps Drawio as opaque XML without fetching the viewer', async ({ page }) => {
	const viewerFetches: Request[] = [];
	page.on('request', (request) => {
		const address = new URL(request.url());
		if (address.pathname.startsWith('/ocu/static/drawio/')) viewerFetches.push(request);
		if (
			address.pathname.startsWith('/ocu/preview/') &&
			address.searchParams.get('embed') === 'files'
		) {
			viewerFetches.push(request);
		}
	});
	const panel = await openWorkspace(page, 'drawio_embedded');
	const loaded = page.waitForResponse(
		(response) =>
			response.url().includes(`/ocu/files/${context.chats.drawio_embedded}/diagram.drawio`) &&
			response.status() === 200
	);
	await panel.getByRole('button', { name: 'diagram.drawio' }).click();
	expect((await loaded).status()).toBe(200);
	const frame = panel.locator('iframe[title="diagram.drawio"]');
	await expect(frame).toBeVisible();
	await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms');
	await expect(frame).toHaveAttribute(
		'src',
		`/ocu/files/${context.chats.drawio_embedded}/diagram.drawio?revision=1`
	);
	await expect(panel.getByRole('link', { name: 'Download diagram.drawio' })).toHaveAttribute(
		'href',
		`/ocu/files/${context.chats.drawio_embedded}/diagram.drawio?download=1`
	);
	await expect(panel.locator('iframe[title="Office preview: diagram.drawio"]')).toHaveCount(0);
	await expect(panel.getByText('Preview not supported for this file type')).toHaveCount(0);
	expect(viewerFetches).toEqual([]);
});
