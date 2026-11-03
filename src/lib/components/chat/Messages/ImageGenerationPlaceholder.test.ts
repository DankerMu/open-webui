// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import { i18n } from '../../../../../test/ocu-workspace-fixtures';
import ToolCallDisplay from '$lib/components/common/ToolCallDisplay.svelte';

type Attributes = Record<string, string>;

// What the backend writes into the tool-call <details> tag: the arguments JSON, HTML-escaped.
const escaped = (value: unknown) =>
	JSON.stringify(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const executing = (name: string, args: string = escaped({ prompt: 'a cat' })): Attributes => ({
	type: 'tool_calls',
	id: 'call-1',
	name,
	arguments: args,
	done: 'false',
	status: 'completed'
});

async function render(attributes: Attributes, props: Record<string, unknown> = {}) {
	const component = mount(ToolCallDisplay, {
		target: document.body,
		props: { attributes, ...props },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await tick();
	return component;
}

const placeholder = () =>
	document.body.querySelector<HTMLElement>('[data-cy="image-generation-placeholder"]');
const seconds = () =>
	document.body.querySelector<HTMLElement>('[data-cy="image-generation-seconds"]')?.textContent;

describe('image generation placeholder in the tool row', () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	it.each(['generate_image', 'edit_image'])('shows while %s executes', async (name) => {
		await render(executing(name));
		expect(placeholder()).not.toBeNull();
		expect(placeholder()?.textContent).toContain('Creating image');
		expect(placeholder()?.getAttribute('aria-busy')).toBe('true');
	});

	it('shows while the model is still preparing the call', async () => {
		await render({ ...executing('generate_image'), status: 'in_progress' });
		expect(placeholder()).not.toBeNull();
	});

	it.each(['web_search', 'execute_code', 'generate_images'])(
		'does not show for another tool (%s)',
		async (name) => {
			await render(executing(name));
			expect(placeholder()).toBeNull();
		}
	);

	it.each([
		['done', { done: 'true' }, {}],
		['failed', { status: 'failed' }, {}],
		['incomplete', { status: 'incomplete' }, {}],
		['denied', { status: 'rejected' }, {}],
		['waiting for approval', { status: 'pending' }, { resolvable: true }],
		// Stopped by the user, or the backend died: the call never gets an output.
		['left without an output by a finished message', {}, { messageDone: true }]
	])('is not shown once the call is %s', async (_state, extra, props) => {
		await render({ ...executing('generate_image'), ...extra }, props);
		expect(placeholder()).toBeNull();
	});

	it('leaves the card to the group when the row sits in a details group', async () => {
		await render(executing('generate_image'), { grouped: true });
		expect(placeholder()).toBeNull();
	});

	it('disappears when the running call finishes', async () => {
		const row = createClassComponent({
			component: ToolCallDisplay,
			target: document.body,
			props: { attributes: executing('generate_image') },
			context: new Map<unknown, unknown>([['i18n', i18n]])
		});
		await tick();
		expect(placeholder()).not.toBeNull();
		row.$set({ attributes: { ...executing('generate_image'), done: 'true' } });
		await tick();
		expect(placeholder()).toBeNull();
		row.$destroy();
	});

	it('disappears when the message ends with the call still open', async () => {
		const row = createClassComponent({
			component: ToolCallDisplay,
			target: document.body,
			props: { attributes: executing('generate_image'), messageDone: false },
			context: new Map<unknown, unknown>([['i18n', i18n]])
		});
		await tick();
		expect(placeholder()).not.toBeNull();
		row.$set({ messageDone: true });
		await tick();
		expect(placeholder()).toBeNull();
		row.$destroy();
	});

	it.each([
		['16:9', '16 / 9'],
		['9:16', '9 / 16'],
		[' 3:2 ', '3 / 2']
	])('takes the shape of aspect_ratio %j', async (ratio, css) => {
		await render(executing('generate_image', escaped({ prompt: 'a cat', aspect_ratio: ratio })));
		expect(placeholder()?.getAttribute('style')).toContain(`aspect-ratio: ${css}`);
	});

	it.each([
		['missing', escaped({ prompt: 'a cat' })],
		['zero width', escaped({ prompt: 'a cat', aspect_ratio: '0:1' })],
		['zero height', escaped({ prompt: 'a cat', aspect_ratio: '4:0' })],
		['not a ratio', escaped({ prompt: 'a cat', aspect_ratio: 'abc' })],
		['a number', escaped({ prompt: 'a cat', aspect_ratio: 1.5 })],
		['partial JSON', '{&quot;prompt&quot;: &quot;a c'],
		['empty', '']
	])('falls back to a square when aspect_ratio is %s', async (_case, args) => {
		await render(executing('generate_image', args));
		expect(placeholder()?.getAttribute('style')).toContain('aspect-ratio: 1 / 1');
	});

	it.each([
		['16:9', '24rem'],
		['1:1', '24rem'],
		['9:16', '13.5rem'],
		['2:3', '16rem']
	])('fits a %s card in a 24rem box no wider than the message', async (ratio, width) => {
		await render(executing('generate_image', escaped({ prompt: 'p', aspect_ratio: ratio })));
		const style = placeholder()?.getAttribute('style');
		expect(style).toContain(`width: ${width}`);
		expect(style).toContain('max-width: 100%');
	});

	it('counts whole seconds since it appeared and stops counting when removed', async () => {
		vi.useFakeTimers();
		const component = await render(executing('generate_image'));
		expect(seconds()).toBe('0s');
		vi.advanceTimersByTime(1000);
		await tick();
		expect(seconds()).toBe('1s');
		vi.advanceTimersByTime(11_000);
		await tick();
		expect(seconds()).toBe('12s');
		expect(vi.getTimerCount()).toBe(1);
		unmount(component);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('announces the label but not every second', async () => {
		await render(executing('generate_image'));
		const live = placeholder()?.querySelectorAll('[role="status"], [aria-live]');
		expect([...(live ?? [])].map((node) => node.textContent?.trim())).toEqual(['Creating image']);
		// role="status" is itself a polite live region: no ancestor of the seconds may carry it.
		const counter = placeholder()?.querySelector('[data-cy="image-generation-seconds"]');
		expect(counter?.closest('[role="status"], [aria-live]')).toBeNull();
		expect(
			placeholder()?.querySelector('[data-cy="image-generation-dots"]')?.getAttribute('aria-hidden')
		).toBe('true');
	});

	it('never shows a percentage', async () => {
		vi.useFakeTimers();
		await render(executing('generate_image', escaped({ prompt: 'p', aspect_ratio: '16:9' })));
		vi.advanceTimersByTime(90_000);
		await tick();
		expect(seconds()).toBe('90s');
		expect(placeholder()?.textContent).not.toContain('%');
	});
});
