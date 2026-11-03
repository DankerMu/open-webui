// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mount, tick } from 'svelte';
import { i18n } from '../../../../../../test/ocu-workspace-fixtures';
import ConsecutiveDetailsGroup from './ConsecutiveDetailsGroup.svelte';

type Token = { summary?: string; text?: string; attributes?: Record<string, string> };

// A reasoning model's turn: a thinking block, then the tool call, grouped into one collapsed row.
const thinking: Token = { summary: 'Thought', text: 'hmm', attributes: { type: 'reasoning' } };
const call = (name: string, extra: Record<string, string> = {}): Token => ({
	summary: 'Executing...',
	attributes: {
		type: 'tool_calls',
		id: `call-${name}`,
		name,
		// Entity-encoded like the backend's <details> attribute.
		arguments:
			'{&quot;prompt&quot;: &quot;a cat&quot;, &quot;aspect_ratio&quot;: &quot;16:9&quot;}',
		done: 'false',
		status: 'completed',
		...extra
	}
});

async function render(tokens: Token[], props: Record<string, unknown> = {}) {
	mount(ConsecutiveDetailsGroup, {
		target: document.body,
		props: { tokens, messageDone: false, ...props },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await tick();
}

const placeholders = () => [
	...document.body.querySelectorAll<HTMLElement>('[data-cy="image-generation-placeholder"]')
];

describe('image generation placeholder in a collapsed details group', () => {
	// jsdom has no Web Animations API, which the group's slide transition calls when it opens.
	// An animation that never finishes leaves the opened content in place, which is all we read.
	beforeAll(() => {
		Element.prototype.animate = () =>
			({ cancel() {}, onfinish: null, effect: null }) as unknown as Animation;
	});
	afterAll(() => {
		delete (Element.prototype as Partial<Element>).animate;
	});

	afterEach(() => {
		document.body.replaceChildren();
	});

	it.each(['generate_image', 'edit_image'])(
		'shows the card under the collapsed group while %s runs',
		async (name) => {
			await render([thinking, call(name)]);
			expect(document.body.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe(
				'false'
			);
			expect(placeholders()).toHaveLength(1);
		}
	);

	it('shapes the card from the grouped call arguments', async () => {
		await render([thinking, call('generate_image')]);
		expect(placeholders()[0].getAttribute('style')).toContain('aspect-ratio: 16 / 9');
	});

	it('shows one card per running image call', async () => {
		await render([thinking, call('generate_image'), call('edit_image')]);
		expect(placeholders()).toHaveLength(2);
	});

	it.each([
		['done', { done: 'true' }],
		['failed', { status: 'failed' }],
		['rejected', { status: 'rejected' }],
		['waiting for approval', { status: 'pending' }]
	])('shows no card once the call is %s', async (_state, extra) => {
		await render([thinking, call('generate_image', extra)], { resolvable: true });
		expect(placeholders()).toHaveLength(0);
	});

	it('shows no card for another running tool', async () => {
		await render([thinking, call('web_search')]);
		expect(placeholders()).toHaveLength(0);
	});

	it('leaves the card to the tool row once the group is opened', async () => {
		await render([thinking, call('generate_image')]);
		expect(placeholders()).toHaveLength(1);
		document.body.querySelector<HTMLElement>('[aria-expanded]')?.click();
		await tick();
		expect(document.body.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe(
			'true'
		);
		// The open group renders its slot, whose ToolCallDisplay shows its own card; none from here.
		expect(placeholders()).toHaveLength(0);
	});
});
