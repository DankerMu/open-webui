import { writeFile } from 'node:fs/promises';
import { expect, type Locator } from '@playwright/test';

// Locale-independent: names are read back from aria-label, so zh-CN reuses these helpers.
export const visibleLabels = (panel: Locator) =>
	panel
		.locator('header nav button')
		.evaluateAll((buttons) =>
			buttons
				.filter((button) => button.querySelector('span')!.getClientRects().length > 0)
				.map((button) => button.getAttribute('aria-label'))
		);

export async function expectHeaderRow(panel: Locator, width: number) {
	const geometry = await panel.locator('header').evaluate((header) => {
		const nav = header.querySelector('nav')!.getBoundingClientRect();
		const refresh = header.lastElementChild!.querySelector('button')!.getBoundingClientRect();
		const centre = (box: DOMRect) => box.top + box.height / 2;
		return {
			panel: header.closest('section')!.getBoundingClientRect().width,
			rowDelta: Math.abs(centre(nav) - centre(refresh)),
			inside: [...header.querySelectorAll('nav button')].every((node) => {
				const box = node.getBoundingClientRect();
				return (
					box.left >= nav.left &&
					box.right <= nav.right &&
					box.top >= nav.top &&
					box.bottom <= nav.bottom
				);
			}),
			overflow: header.scrollWidth - header.clientWidth
		};
	});
	expect(Math.abs(geometry.panel - width)).toBeLessThanOrEqual(2);
	expect(geometry.rowDelta).toBeLessThanOrEqual(2);
	expect(geometry.inside).toBe(true);
	expect(geometry.overflow).toBeLessThanOrEqual(1);
}

// Measures the switch with all labels shown (run with Terminal active at a wide panel) under the
// default stack (-apple-system on macOS) and bundled Inter (the Windows/Linux fallback), and checks
// that the rendered container threshold is not below either width.
export async function measureHeaderThreshold(panel: Locator, path: string) {
	const nav = panel.locator('header nav');
	const threshold = Number(/@min-\[(\d+)px\]/.exec(await nav.innerHTML())?.[1]);
	const measured: Record<string, number> = {};
	for (const font of ['platform', 'Inter']) {
		measured[font] = await nav.evaluate(async (node, family) => {
			if (family !== 'platform') {
				document.documentElement.style.setProperty('--app-font-family', family);
				await document.fonts.load(`500 14px ${family}`);
			}
			const width = node.getBoundingClientRect().width;
			document.documentElement.style.removeProperty('--app-font-family');
			return width;
		}, font);
		expect(measured[font]).toBeLessThanOrEqual(threshold);
	}
	await writeFile(path, JSON.stringify({ threshold, measured }));
}
