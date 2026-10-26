// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import { ocuWorkspaceEntry, type OcuWorkspaceEntry } from '$lib/stores/ocu';
import WorkspaceNavButton from './WorkspaceNavButton.svelte';

let component: Record<string, unknown> | undefined;

function render(entry: Partial<OcuWorkspaceEntry> | null) {
	const toggle = vi.fn();
	ocuWorkspaceEntry.set(
		entry && { shown: false, changed: false, waiting: false, disabled: false, toggle, ...entry }
	);
	component = mount(WorkspaceNavButton, {
		target: document.body,
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	flushSync();
	return toggle;
}

const entryButton = () =>
	document.querySelector<HTMLButtonElement>('button[aria-label="Workspace Files"]');
// The Tooltip wrapper owns the hover trigger, so a disabled button still reveals it.
async function tooltip() {
	entryButton()!.parentElement!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
	await tick();
	await vi.waitFor(() => expect(document.querySelector('.tippy-content')).not.toBeNull());
	return document.querySelector('.tippy-content')!.textContent;
}
const statuses = () =>
	[...document.querySelectorAll('[role="status"]')].map((node) => [
		node.textContent?.trim(),
		node.classList.contains('sr-only')
	]);

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	ocuWorkspaceEntry.set(null);
	document.body.replaceChildren();
});

describe('navbar workspace entry', () => {
	it('renders nothing while the workspace action is unavailable', () => {
		render(null);
		expect(document.body.querySelector('button')).toBeNull();
		expect(document.body.textContent?.trim()).toBe('');
	});

	it('is a named icon button with the Controls button treatment and no visible label', async () => {
		render({});
		const button = entryButton()!;
		expect(button).not.toBeNull();
		expect(button.type).toBe('button');
		expect(button.textContent?.trim()).toBe('');
		for (const cls of [
			'size-6',
			'rounded-lg',
			'text-gray-500',
			'hover:bg-gray-50/40',
			'dark:text-gray-400'
		])
			expect(button.classList.contains(cls)).toBe(true);
		const icon = button.querySelector('svg')!;
		expect(icon.getAttribute('aria-hidden')).toBe('true');
		expect(icon.getAttribute('class')).toBe('size-5');
		expect(icon.getAttribute('stroke-width')).toBe('1');
		expect(statuses()).toEqual([]);
		expect(await tooltip()).toBe('Workspace Files');
	});

	it.each([
		[false, 'false'],
		[true, 'true']
	])('reports shown=%s as aria-pressed=%s and toggles on click', (shown, pressed) => {
		const toggle = render({ shown });
		const button = entryButton()!;
		expect(button.getAttribute('aria-pressed')).toBe(pressed);
		expect(button.disabled).toBe(false);
		button.click();
		expect(toggle).toHaveBeenCalledTimes(1);
	});

	it('marks a workspace change with a dot and a visually hidden status', () => {
		render({ changed: true });
		const button = entryButton()!;
		expect(button.classList.contains('relative')).toBe(true);
		const dot = button.querySelector('[data-workspace-changed-dot]')!;
		expect(dot).not.toBeNull();
		expect(dot.getAttribute('aria-hidden')).toBe('true');
		expect(statuses()).toEqual([['Workspace changed', true]]);
		expect(button.textContent?.trim()).toBe('Workspace changed');
	});

	it('is disabled with the pending tooltip and status while the first send saves the chat', async () => {
		const toggle = render({ waiting: true, disabled: true });
		const button = entryButton()!;
		expect(button.disabled).toBe(true);
		expect(button.classList.contains('disabled:cursor-not-allowed')).toBe(true);
		expect(statuses()).toEqual([['Waiting for chat to save', true]]);
		expect(await tooltip()).toBe('Waiting for chat to save');
		button.click();
		expect(toggle).not.toHaveBeenCalled();
	});

	it('follows store updates and disappears when the entry is withdrawn', () => {
		render({});
		ocuWorkspaceEntry.update((entry) => entry && { ...entry, shown: true, changed: true });
		flushSync();
		expect(entryButton()!.getAttribute('aria-pressed')).toBe('true');
		expect(document.querySelector('[data-workspace-changed-dot]')).not.toBeNull();
		ocuWorkspaceEntry.set(null);
		flushSync();
		expect(entryButton()).toBeNull();
	});
});
