// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import type { Token } from 'marked';
import { i18n } from '../../../../../../../test/ocu-workspace-fixtures';
import { mentionExtension } from '$lib/utils/marked/mention-extension';
import MentionToken from './MentionToken.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

let mounted: ReturnType<typeof mount> | undefined;

// The message renderer's `$` tokenizer splits `<$id|label>`, so the token is built the same way.
function render(source: string) {
	const token = mentionExtension({ triggerChar: '$' }).tokenizer(source);
	expect(token).toBeDefined();
	mounted = mount(MentionToken, {
		target: document.body,
		props: { token: token as unknown as Token },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	return document.body.querySelector('.mention')?.textContent?.trim();
}

describe('MentionToken `$` mention', () => {
	afterEach(() => {
		if (mounted) unmount(mounted);
		mounted = undefined;
		document.body.replaceChildren();
	});

	it('shows an uploaded skill mention by its label', () => {
		expect(render('<$ocu--invoice-builder|发票生成>')).toBe('$发票生成');
	});

	it('shows a native skill mention by its label', () => {
		expect(render('<$harness-native-skill|Harness native skill>')).toBe('$Harness native skill');
	});

	it('shows a mention without a label by its id', () => {
		expect(render('<$invoice-builder>')).toBe('$invoice-builder');
	});
});
