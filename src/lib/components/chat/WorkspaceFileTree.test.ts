// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { file, i18n } from '../../../../test/ocu-workspace-fixtures';
import type { WorkspaceFile } from '$lib/apis/ocu';
import { buildWorkspaceFileRows } from './workspace-file-rows';
import WorkspaceFileTree, { FILE_KIND_ICONS } from './WorkspaceFileTree.svelte';

let component: Record<string, unknown> | undefined;

const files: WorkspaceFile[] = [
	{ ...file('packages/core/src/index.py'), type: 'code', mime: 'text/x-python', size: 2048 },
	{ ...file('packages/core-extra/a.py'), type: 'code', mime: 'text/x-python', size: 10 },
	{ ...file('reports/big.docx'), too_large: true, size: 100 * 1024 * 1024 },
	{ ...file('page.html'), size: 256 },
	{ ...file('', 'fallback-id'), name: 'fallback.txt', type: 'text', mime: 'text/plain' }
];

function render(selectedFileId = '', onSelect = vi.fn(), listClass = 'flex-1') {
	component = mount(WorkspaceFileTree, {
		target: document.body,
		props: { rows: buildWorkspaceFileRows(files), selectedFileId, listClass, onSelect },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	return onSelect;
}

const list = () => document.querySelector('ul[aria-label="Workspace file list"]') as HTMLElement;
const button = (label: string) => {
	const found = [...list().querySelectorAll('button')].find(
		(item) => item.getAttribute('aria-label') === label
	);
	expect(found, label).toBeDefined();
	return found as HTMLButtonElement;
};
const hidden = (label: string) => button(label).closest('li')!.hidden;

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe('workspace file tree', () => {
	it('renders the named list with the parent height classes and explorer rows', () => {
		render('', vi.fn(), 'max-h-[40%] shrink-0');
		expect(list().className).toMatch(/min-h-0/);
		expect(list().className).toMatch(/overflow-y-auto/);
		expect(list().className).toMatch(/max-h-\[40%\] shrink-0/);
		expect(
			[...list().querySelectorAll('button')].map((item) => item.getAttribute('aria-label'))
		).toEqual([
			'Folder packages',
			'Folder packages/core',
			'Folder packages/core/src',
			'packages/core/src/index.py',
			'Folder packages/core-extra',
			'packages/core-extra/a.py',
			'Folder reports',
			'reports/big.docx',
			'fallback.txt',
			'page.html'
		]);
		for (const item of list().querySelectorAll('button')) {
			expect(item.className).toMatch(/h-7/);
			expect(item.className).toMatch(/rounded-md/);
			expect(item.className).toMatch(/focus-visible:ring-2/);
		}
	});

	it('renders folder rows with chevron, folder icon, segment name, depth padding and guides', () => {
		render();
		const core = button('Folder packages/core');
		expect(core.getAttribute('aria-expanded')).toBe('true');
		expect(core.textContent?.trim()).toBe('core');
		expect(core.style.paddingLeft).toBe('20px');
		expect(core.querySelectorAll('svg')).toHaveLength(2);
		for (const svg of core.querySelectorAll('svg'))
			expect(svg.getAttribute('aria-hidden')).toBe('true');
		expect(core.closest('li')!.querySelectorAll('[data-indent-guide]')).toHaveLength(1);
		expect(
			button('Folder packages').closest('li')!.querySelectorAll('[data-indent-guide]')
		).toHaveLength(0);
		expect(
			button('Folder packages/core/src').closest('li')!.querySelectorAll('[data-indent-guide]')
		).toHaveLength(2);
	});

	it('renders file rows with an empty chevron slot, kind icon, name and full-path tooltip', () => {
		render();
		const deep = button('packages/core/src/index.py');
		expect(deep.style.paddingLeft).toBe('44px');
		expect(deep.closest('li')!.querySelectorAll('[data-indent-guide]')).toHaveLength(3);
		expect(deep.querySelector('[data-chevron-slot]')?.children).toHaveLength(0);
		expect(deep.querySelectorAll('svg')).toHaveLength(1);
		expect(deep.querySelector('[data-file-kind="code"] > svg')?.getAttribute('aria-hidden')).toBe(
			'true'
		);
		expect(deep.textContent?.trim()).toBe('index.py');
		expect(deep.getAttribute('title')).toBe('packages/core/src/index.py');
		expect(deep.querySelector('[data-file-size]')).toBeNull();
		const fallback = button('fallback.txt');
		expect(fallback.style.paddingLeft).toBe('8px');
		expect(fallback.getAttribute('title')).toBe('fallback.txt');
		expect(fallback.querySelector('[data-file-kind="document"]')).not.toBeNull();
	});

	it('keeps the size beside the marker only on a too_large row', () => {
		render();
		const big = button('reports/big.docx');
		const marker = big.querySelector('[data-too-large]');
		const size = big.querySelector('[data-file-size]');
		expect(marker?.textContent).toBe('Too large');
		expect(size?.textContent).toBe('100.0 MB');
		expect(size?.getAttribute('aria-hidden')).toBe('true');
		expect(marker?.nextElementSibling).toBe(size);
		expect(list().querySelectorAll('[data-file-size]')).toHaveLength(1);
	});

	it('marks the selected row and reports clicks through the selection callback', () => {
		const onSelect = render('page.html');
		const selected = button('page.html');
		expect(selected.getAttribute('aria-pressed')).toBe('true');
		expect(selected.className).toMatch(/font-medium/);
		expect(selected.className).toMatch(/bg-gray-100/);
		expect(button('fallback.txt').getAttribute('aria-pressed')).toBe('false');
		expect(button('fallback.txt').className).not.toMatch(/font-medium/);
		button('fallback.txt').click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(files[4]);
		button('Folder reports').click();
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it('collapses by ancestry and expands again without calling the selection callback', async () => {
		const onSelect = render('page.html');
		const packages = button('Folder packages/core');
		packages.click();
		await tick();
		expect(packages.getAttribute('aria-expanded')).toBe('false');
		expect(hidden('Folder packages/core')).toBe(false);
		expect(hidden('Folder packages/core/src')).toBe(true);
		expect(hidden('packages/core/src/index.py')).toBe(true);
		expect(hidden('Folder packages/core-extra')).toBe(false);
		expect(hidden('packages/core-extra/a.py')).toBe(false);
		button('Folder packages').click();
		await tick();
		expect(hidden('Folder packages/core')).toBe(true);
		expect(hidden('Folder packages/core-extra')).toBe(true);
		expect(hidden('reports/big.docx')).toBe(false);
		button('Folder packages').click();
		button('Folder packages/core').click();
		await tick();
		expect(hidden('packages/core/src/index.py')).toBe(false);
		expect(onSelect).not.toHaveBeenCalled();
		expect(button('page.html').getAttribute('aria-pressed')).toBe('true');
	});

	it('exports one icon per display kind', () => {
		expect(Object.keys(FILE_KIND_ICONS).sort()).toEqual(
			['code', 'document', 'image', 'other', 'sheet', 'slides', 'web'].sort()
		);
	});
});
