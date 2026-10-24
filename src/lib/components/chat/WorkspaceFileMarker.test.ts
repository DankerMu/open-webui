// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import { file, i18n } from '../../../../test/ocu-workspace-fixtures';
import type { WorkspaceFile } from '$lib/apis/ocu';
import WorkspaceFileMarker from './WorkspaceFileMarker.svelte';

let component: Record<string, unknown> | undefined;

function render(entry: WorkspaceFile) {
	component = mount(WorkspaceFileMarker, {
		target: document.body,
		props: { file: entry },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
}

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe('workspace file row marker', () => {
	it('marks a too-large file as too large', () => {
		render({ ...file('big.html'), too_large: true, unsupported_name: false });
		expect(document.querySelector('[data-too-large]')?.textContent).toBe('Too large');
		expect(document.querySelector('[data-unsupported-name]')).toBeNull();
	});

	it('marks a file with an unsupported name', () => {
		render({ ...file('a\\b.html'), url: null, too_large: false, unsupported_name: true });
		expect(document.querySelector('[data-unsupported-name]')?.textContent).toBe('Unsupported name');
		expect(document.querySelector('[data-too-large]')).toBeNull();
	});

	it.each([
		['absent', file('page.html')],
		['false', { ...file('page.html'), too_large: false, unsupported_name: false }]
	] as const)('shows no marker when both flags are %s', (_label, entry) => {
		render(entry);
		expect(document.body.textContent).toBe('');
	});
});
