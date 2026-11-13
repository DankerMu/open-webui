// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import RichTextInput from './RichTextInput.svelte';

type Input = { setText: (text: string) => void };

let component: ReturnType<typeof createClassComponent> | undefined;
let onChange: ReturnType<typeof vi.fn>;

// The Mention extension is registered only for a non-empty `suggestions` list, as MessageInput
// passes it; without it setText's spans would parse as plain text.
async function mount() {
	onChange = vi.fn();
	component = createClassComponent({
		component: RichTextInput,
		target: document.body,
		// `suggestions` is declared `= null` upstream, so its inferred type admits no list.
		props: {
			messageInput: true,
			onChange,
			suggestions: [{ char: '$', render: () => ({}) }] as never
		},
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	// onMount awaits before creating the editor, and setText returns early until it exists.
	await vi.waitFor(() => expect(document.querySelector('.ProseMirror')).not.toBeNull());
}

async function roundTrip(text: string): Promise<string> {
	onChange.mockClear();
	(component as unknown as Input).setText(text);
	await tick();
	expect(onChange).toHaveBeenCalled();
	return onChange.mock.lastCall![0].md;
}

const mention = () => document.querySelector('.ProseMirror [data-type="mention"]')!;

describe('RichTextInput setText round trip', () => {
	beforeEach(async () => {
		// jsdom has no layout: setText's focus() scrolls the selection into view through
		// Range rect methods, which jsdom lacks; empty and zero rects are what an unlaid page gives.
		Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
		Range.prototype.getBoundingClientRect = () => new DOMRect();
		await mount();
	});

	afterEach(() => {
		component?.$destroy();
		component = undefined;
		document.body.innerHTML = '';
	});

	it('keeps the label of an uploaded-skill mention and shows it in the chip', async () => {
		const text = '<$ocu--invoice-builder|发票生成> 做发票';
		expect(await roundTrip(text)).toBe(text);
		expect(mention().textContent).toBe('$发票生成');
	});

	it('keeps a label containing a double quote whole', async () => {
		const text = '<$ocu--invoice-builder|发票"生成>';
		expect(await roundTrip(text)).toBe(text);
		expect(mention().getAttribute('data-label')).toBe('发票"生成');
		expect(mention().textContent).toBe('$发票"生成');
	});

	it('keeps native labelled and unlabelled mentions unchanged', async () => {
		const text = '<$native-skill|Native skill> and <$plain-id>';
		expect(await roundTrip(text)).toBe(text);
		const chips = [...document.querySelectorAll('.ProseMirror [data-type="mention"]')];
		expect(chips.map((chip) => chip.textContent)).toEqual(['$Native skill', '$plain-id']);
	});

	it('rewrites the closing form to the dollar form with its label', async () => {
		expect(await roundTrip('</ocu--invoice-builder|发票生成>')).toBe(
			'<$ocu--invoice-builder|发票生成>'
		);
	});

	it('drops an empty label to the bare id', async () => {
		expect(await roundTrip('<$plain-id|>')).toBe('<$plain-id>');
	});

	it('keeps plain-text angle brackets and ampersands verbatim', async () => {
		const text = 'a < b & c';
		expect(await roundTrip(text)).toBe(text);
		expect(document.querySelector('.ProseMirror [data-type="mention"]')).toBeNull();
	});
});
