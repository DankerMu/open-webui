// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import { file, i18n, url } from '../../../../test/ocu-workspace-fixtures';
import DocumentPage from '$lib/components/icons/DocumentPage.svelte';
import WorkspaceDownloadFallback from './WorkspaceDownloadFallback.svelte';

let component: Record<string, unknown> | undefined;

function render(props: { file: ReturnType<typeof file>; href: string }) {
	component = mount(WorkspaceDownloadFallback, {
		target: document.body,
		props: { ...props, kind: 'other', icon: DocumentPage },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
}

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe('workspace download fallback', () => {
	it.each([
		[undefined, 'Preview not supported for this file type. Download the file to open it.'],
		[false, 'Preview not supported for this file type. Download the file to open it.'],
		[true, 'This file is larger than the 100 MiB preview limit.']
	] as const)('too_large %s shows its status, kind icon and download', (tooLarge, status) => {
		const entry = { ...file('notes.bin'), too_large: tooLarge };
		render({ file: entry, href: `${url}notes.bin?download=1` });
		expect(document.querySelector('[role="status"]')?.textContent?.trim()).toBe(status);
		expect(document.querySelector('[data-file-kind="other"] svg')).not.toBeNull();
		const links = [...document.querySelectorAll('a')];
		expect(links).toHaveLength(1);
		expect(links[0].textContent?.trim()).toBe('Download');
		expect(links[0].getAttribute('href')).toBe(`${url}notes.bin?download=1`);
		expect(links[0].getAttribute('download')).toBe('notes.bin');
	});
});
