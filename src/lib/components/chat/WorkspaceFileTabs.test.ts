// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { file, i18n } from '../../../../test/ocu-workspace-fixtures';
import type { WorkspaceFile } from '$lib/apis/ocu';
import WorkspaceFileTabs from './WorkspaceFileTabs.svelte';

let component: Record<string, unknown> | undefined;

const files: WorkspaceFile[] = [
	{ ...file('reports/summary.docx', 'summary') },
	{ ...file('page.html', 'page') },
	{ ...file('src/index.py', 'index'), type: 'code', mime: 'text/x-python' }
];
const tabs = [
	{ file: files[0], name: 'summary.docx' },
	{ file: files[1], name: 'page.html' },
	{ file: files[2], name: 'index.py' }
];

function render(activeId: string | undefined, treeHidden = false) {
	const handlers = { onActivate: vi.fn(), onClose: vi.fn(), onToggleTree: vi.fn() };
	component = mount(WorkspaceFileTabs, {
		target: document.body,
		props: { tabs, activeId, treeHidden, treeId: 'tree-column', ...handlers },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	return handlers;
}

const tablist = () => document.querySelector('[role="tablist"]') as HTMLElement;
const tabElements = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const tab = (name: string) => tabElements().find((node) => node.textContent?.trim() === name)!;
const closeButtons = () =>
	[...document.querySelectorAll<HTMLButtonElement>('button')].filter(
		(node) => node.getAttribute('aria-label') === 'Close tab'
	);
const key = (node: HTMLElement, value: string) =>
	node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe('workspace file tabs', () => {
	it('holds only tab elements, none of them buttons, in a list named Open files', () => {
		render('page');
		expect(tablist().getAttribute('aria-label')).toBe('Open files');
		expect([...tablist().children].map((node) => node.getAttribute('role'))).toEqual([
			'tab',
			'tab',
			'tab'
		]);
		expect(tablist().querySelectorAll('button')).toHaveLength(0);
		for (const node of tabElements()) expect(node.tagName).toBe('DIV');
		expect(tabElements().map((node) => node.textContent?.trim())).toEqual([
			'summary.docx',
			'page.html',
			'index.py'
		]);
		expect(tab('summary.docx').getAttribute('title')).toBe('reports/summary.docx');
		expect(tab('index.py').querySelector('[data-file-kind="code"] svg')).not.toBeNull();
		expect(
			[...document.querySelectorAll('button')].some((node) =>
				/summary|page|index/.test(node.getAttribute('aria-label') ?? node.textContent ?? '')
			)
		).toBe(false);
	});

	it('marks the active tab selected and focusable and the others reachable by arrows', () => {
		render('page');
		expect(tabElements().map((node) => node.getAttribute('aria-selected'))).toEqual([
			'false',
			'true',
			'false'
		]);
		expect(tabElements().map((node) => node.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
		tab('page.html').focus();
		key(tab('page.html'), 'ArrowRight');
		expect(document.activeElement).toBe(tab('index.py'));
		key(tab('index.py'), 'ArrowRight');
		expect(document.activeElement).toBe(tab('summary.docx'));
		key(tab('summary.docx'), 'ArrowLeft');
		expect(document.activeElement).toBe(tab('index.py'));
	});

	it('keeps the first tab focusable when no tab is active', () => {
		render(undefined);
		expect(tabElements().map((node) => node.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
		expect(tabElements().every((node) => node.getAttribute('aria-selected') === 'false')).toBe(
			true
		);
	});

	it('activates an inactive tab by click, Enter or Space and never the active one', () => {
		const { onActivate } = render('page');
		tab('summary.docx').click();
		expect(onActivate).toHaveBeenLastCalledWith(files[0]);
		key(tab('index.py'), 'Enter');
		expect(onActivate).toHaveBeenLastCalledWith(files[2]);
		key(tab('summary.docx'), ' ');
		expect(onActivate).toHaveBeenCalledTimes(3);
		tab('page.html').click();
		key(tab('page.html'), 'Enter');
		key(tab('page.html'), ' ');
		expect(onActivate).toHaveBeenCalledTimes(3);
	});

	it('names each close control Close tab, describes it by its tab and keeps it in the DOM', () => {
		const { onClose, onActivate } = render('page');
		const buttons = closeButtons();
		expect(buttons).toHaveLength(3);
		for (const [index, button] of buttons.entries()) {
			const described = document.getElementById(button.getAttribute('aria-describedby')!);
			expect(described).toBe(tabElements()[index]);
			expect(button.textContent?.trim()).toBe('');
			expect(button.hidden).toBe(false);
			expect(tablist().contains(button)).toBe(false);
			expect(button.closest('[data-file-id]')?.getAttribute('data-file-id')).toBe(
				tabs[index].file.file_id
			);
		}
		expect(buttons[0].className).toMatch(/opacity-0/);
		expect(buttons[0].className).toMatch(/group-hover:opacity-100/);
		expect(buttons[0].className).toMatch(/focus-visible:opacity-100/);
		expect(buttons[1].className).toMatch(/opacity-100/);
		expect(buttons[1].className).not.toMatch(/(^|\s)opacity-0/);
		buttons[2].click();
		expect(onClose).toHaveBeenCalledWith('index');
		expect(onActivate).not.toHaveBeenCalled();
	});

	it('lets only a visible close control take pointer input and only the active one take Tab focus', async () => {
		render('page');
		const [hidden, active, last] = closeButtons();
		const touch = ['[@media(hover:none)]:opacity-100', '[@media(hover:none)]:pointer-events-auto'];
		for (const button of [hidden, last]) {
			expect(button.className).toMatch(/(^|\s)pointer-events-none(\s|$)/);
			expect(button.className).toMatch(/group-hover:pointer-events-auto/);
			expect(button.className).toMatch(/focus-visible:pointer-events-auto/);
			for (const name of touch) expect(button.className.split(/\s+/)).toContain(name);
		}
		expect(active.className).not.toMatch(/pointer-events-none/);
		expect(closeButtons().map((node) => node.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
		// Svelte attaches pointer listeners in a microtask after mount.
		await tick();
		tab('summary.docx').dispatchEvent(new Event('pointerenter'));
		await tick();
		expect(hidden.className).toMatch(/(^|\s)opacity-100(\s|$)/);
		expect(hidden.className).not.toMatch(/pointer-events-none/);
		expect(hidden.getAttribute('tabindex')).toBe('-1');
		tab('summary.docx').dispatchEvent(new Event('pointerleave'));
		await tick();
		expect(hidden.className).toMatch(/(^|\s)pointer-events-none(\s|$)/);
	});

	it('keeps every close control out of the Tab sequence while no tab is active', () => {
		render(undefined);
		expect(closeButtons().map((node) => node.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1']);
	});

	it('does not close a tab from the keyboard Delete key', () => {
		const { onClose } = render('page');
		key(tab('page.html'), 'Delete');
		expect(onClose).not.toHaveBeenCalled();
	});

	it('toggles the tree with a named control that reports visibility', async () => {
		const { onToggleTree } = render('page', false);
		const toggle = [...document.querySelectorAll('button')].find(
			(node) => node.getAttribute('aria-label') === 'Hide file tree'
		)!;
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(toggle.getAttribute('aria-controls')).toBe('tree-column');
		toggle.click();
		expect(onToggleTree).toHaveBeenCalledOnce();
		await unmount(component!);
		render('page', true);
		await tick();
		const shown = [...document.querySelectorAll('button')].find(
			(node) => node.getAttribute('aria-label') === 'Show file tree'
		)!;
		expect(shown.getAttribute('aria-expanded')).toBe('false');
		expect(shown.getAttribute('aria-controls')).toBe('tree-column');
	});
});
