// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import WorkspaceNotice from './WorkspaceNotice.svelte';

let component: Record<string, unknown> | undefined;

function render(notice: string, onDismiss = vi.fn()) {
	component = mount(WorkspaceNotice, {
		target: document.body,
		props: { notice, onDismiss },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	return onDismiss;
}

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe('WorkspaceNotice', () => {
	it('shows exactly the notice as an alert with an icon-only dismiss button', () => {
		const onDismiss = render('Selected file was removed');
		const alert = document.querySelector('[role="alert"]')!;
		expect(alert.textContent?.replace(/\s+/g, ' ').trim()).toBe('Selected file was removed');
		const buttons = alert.querySelectorAll('button');
		expect(buttons).toHaveLength(1);
		expect(buttons[0].getAttribute('type')).toBe('button');
		expect(buttons[0].getAttribute('aria-label')).toBe('Dismiss notice');
		expect(buttons[0].textContent?.trim()).toBe('');
		expect(onDismiss).not.toHaveBeenCalled();
		buttons[0].click();
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});
});
