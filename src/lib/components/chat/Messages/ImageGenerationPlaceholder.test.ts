// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
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

async function render(attributes: Attributes, resolvable = false) {
	const component = mount(ToolCallDisplay, {
		target: document.body,
		props: { attributes, resolvable },
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

	it('is gone once the call is done', async () => {
		await render({ ...executing('generate_image'), done: 'true' });
		expect(placeholder()).toBeNull();
	});

	it('is not shown while the call waits for approval', async () => {
		await render({ ...executing('generate_image'), status: 'pending' }, true);
		expect(placeholder()).toBeNull();
	});

	it('is gone when the call was denied', async () => {
		await render({ ...executing('generate_image'), status: 'rejected' });
		expect(placeholder()).toBeNull();
	});

	it('is gone when the call failed', async () => {
		await render({ ...executing('generate_image'), status: 'failed' });
		expect(placeholder()).toBeNull();
	});

	it('disappears when a running call finishes', async () => {
		const component = await render(executing('generate_image'));
		expect(placeholder()).not.toBeNull();
		unmount(component);
		await render({ ...executing('generate_image'), done: 'true' });
		expect(placeholder()).toBeNull();
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
