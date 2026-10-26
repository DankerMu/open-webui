// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import type { OcuWorkspaceState } from '$lib/stores/ocu';
import WorkspaceViewSwitch from './WorkspaceViewSwitch.svelte';

let component: Record<string, unknown> | undefined;

function state(patch: Partial<OcuWorkspaceState>) {
	return {
		status: 'running',
		baseUrl: '/ocu',
		view: 'files',
		views: ['files'],
		...patch
	} as OcuWorkspaceState;
}

function render(workspace: OcuWorkspaceState) {
	const onSelect = vi.fn();
	const bound: { filesButton?: HTMLButtonElement } = {};
	component = mount(WorkspaceViewSwitch, {
		target: document.body,
		props: {
			workspace,
			onSelect,
			get filesButton() {
				return bound.filesButton;
			},
			set filesButton(value: HTMLButtonElement | undefined) {
				bound.filesButton = value;
			}
		},
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	flushSync();
	return { onSelect, bound };
}

const nav = () => document.querySelector('nav[aria-label="Workspace views"]') as HTMLElement;
const segment = (name: string) =>
	[...nav().querySelectorAll('button')].find((node) => node.textContent?.trim() === name);

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe('workspace view switch', () => {
	it.each([[['files']], [['files', 'browser', 'terminal']]])(
		'sizes segments to their content for views %j',
		(views) => {
			render(state({ views }));
			expect(nav().className).toMatch(/(^|\s)inline-flex(\s|$)/);
			expect(nav().className).toMatch(/self-start/);
			expect(nav().className).not.toMatch(/(^|\s)flex-1(\s|$)/);
			const buttons = [...nav().querySelectorAll('button')];
			expect(buttons).toHaveLength(views.length);
			for (const button of buttons) {
				expect(button.className).not.toMatch(/(^|\s)flex-1(\s|$)/);
				expect(button.className).toMatch(/px-3/);
				expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
			}
		}
	);

	it('keeps pressed state, disabled runtime views, absence and the existing action', () => {
		const { onSelect, bound } = render(state({ views: ['files', 'browser'], status: 'stopped' }));
		expect(segment('Files')?.getAttribute('aria-pressed')).toBe('true');
		expect(segment('Files')?.className).toMatch(/bg-white/);
		expect(segment('Browser')?.getAttribute('aria-pressed')).toBe('false');
		expect(segment('Browser')?.disabled).toBe(true);
		expect(segment('Terminal')).toBeUndefined();
		expect(bound.filesButton).toBe(segment('Files'));
		segment('Files')!.click();
		expect(onSelect).toHaveBeenCalledWith('files');
	});

	it('selects an available runtime view and marks it pressed', async () => {
		const first = render(state({ views: ['files', 'browser', 'terminal'] }));
		segment('Terminal')!.click();
		expect(first.onSelect).toHaveBeenCalledWith('terminal');
		segment('Browser')!.click();
		expect(first.onSelect).toHaveBeenCalledWith('browser');
		await unmount(component!);
		render(state({ views: ['files', 'browser', 'terminal'], view: 'terminal' }));
		expect(segment('Terminal')?.getAttribute('aria-pressed')).toBe('true');
		expect(segment('Files')?.getAttribute('aria-pressed')).toBe('false');
		expect(segment('Browser')?.disabled).toBe(false);
	});

	it('disables runtime views outside the gateway base URL', () => {
		render(state({ views: ['files', 'terminal'], baseUrl: '/elsewhere' }));
		expect(segment('Terminal')?.disabled).toBe(true);
		expect(segment('Files')?.disabled).toBe(false);
	});
});
