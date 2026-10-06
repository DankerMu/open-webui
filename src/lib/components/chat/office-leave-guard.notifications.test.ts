// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { Toaster } from 'svelte-sonner';
import { chatId, showControls } from '$lib/stores';
import { chat } from '../../../../test/ocu-workspace-fixtures';
import { namedButton } from './workspace-artifact-office-test';
import { officeLeaveGuard } from './office-leave-guard';
import { createOfficeGuardTestHarness, deliver, status } from './office-leave-guard-test';

const { holdStatus, openDirty } = createOfficeGuardTestHarness();

beforeEach(() => {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {}
		}))
	);
});

function visibleNotifications(text: string) {
	return [
		...document.querySelectorAll<HTMLElement>(
			'[data-sonner-toast][data-visible="true"][data-removed="false"]'
		)
	].filter((node) => node.querySelector('[data-title]')?.textContent?.trim() === text);
}

describe('Office owner notifications', () => {
	it('keeps the confirmed saved outcome visible after replacing saving progress', async () => {
		await openDirty();
		const toaster = mount(Toaster, { target: document.body });
		try {
			await tick();
			const held = holdStatus();
			vi.useFakeTimers();
			namedButton('Close editor').click();
			await tick();
			expect(visibleNotifications('Saving Office changes: report.docx')).toHaveLength(1);
			expect(visibleNotifications('Office changes saved: report.docx')).toEqual([]);
			await deliver(held, status('closed'));
			await vi.advanceTimersByTimeAsync(1000);
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			expect(visibleNotifications('Saving Office changes: report.docx')).toEqual([]);
		} finally {
			await unmount(toaster);
		}
	});

	it('replays only the active owner after a rapid chat roundtrip and ignores an older presentation dismissal', async () => {
		const previousControls = get(showControls);
		showControls.set(true);
		const stopShell = officeLeaveGuard.mount();
		let toaster: Record<string, unknown> | undefined;
		try {
			await openDirty();
			toaster = mount(Toaster, { target: document.body });
			await tick();
			const held = holdStatus();
			vi.useFakeTimers();
			const stopPanel = officeLeaveGuard.mount();
			try {
				namedButton('Close editor').click();
				await deliver(held, status('closed'));
			} finally {
				stopPanel();
			}
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			chatId.set('chat-b');
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toEqual([]);
			chatId.set(chat);
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(1000);
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toHaveLength(1);
			chatId.set('chat-b');
			await tick();
			expect(visibleNotifications('Office changes saved: report.docx')).toEqual([]);
		} finally {
			stopShell();
			showControls.set(previousControls);
			if (toaster) await unmount(toaster);
		}
	});
});
