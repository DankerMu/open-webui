// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick } from 'svelte';
import { i18n } from '../../../../../../test/ocu-workspace-fixtures';
import type { OcuUserSkill } from '$lib/apis/ocu/skills';
import ConsecutiveDetailsGroup from './ConsecutiveDetailsGroup.svelte';

// One instance for every re-import: the skill cases re-import the group to start with an empty store.
const getUserSkills = vi.hoisted(() => vi.fn());
vi.mock('$lib/apis/ocu/skills', () => ({ getUserSkills }));

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
		vi.useRealTimers();
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
		['incomplete', { status: 'incomplete' }],
		['rejected', { status: 'rejected' }],
		['waiting for approval', { status: 'pending' }]
	])('shows no card once the call is %s', async (_state, extra) => {
		await render([thinking, call('generate_image', extra)], { resolvable: true });
		expect(placeholders()).toHaveLength(0);
	});

	it('shows no card once the message ended with the call still open', async () => {
		// Stopped by the user, or the backend died: the call never gets an output.
		await render([thinking, call('generate_image')], { messageDone: true });
		expect(placeholders()).toHaveLength(0);
	});

	it('shows no card for another running tool', async () => {
		await render([thinking, call('web_search')]);
		expect(placeholders()).toHaveLength(0);
	});

	it('keeps the same card and its count while the group is opened and closed', async () => {
		vi.useFakeTimers();
		await render([thinking, call('generate_image')]);
		const [card] = placeholders();
		const seconds = () =>
			placeholders()[0]?.querySelector('[data-cy="image-generation-seconds"]')?.textContent;
		const toggle = () => document.body.querySelector<HTMLElement>('div[role="button"]')!;
		vi.advanceTimersByTime(3000);
		await tick();
		expect(seconds()).toBe('3s');

		toggle().click();
		await tick();
		expect(toggle().getAttribute('aria-expanded')).toBe('true');
		// Open, the slot's tool rows leave the card to the group: this very node, not a fresh one at 0 s.
		expect(placeholders()).toHaveLength(1);
		expect(placeholders()[0]).toBe(card);
		expect(seconds()).toBe('3s');

		vi.advanceTimersByTime(2000);
		toggle().click();
		await tick();
		expect(toggle().getAttribute('aria-expanded')).toBe('false');
		expect(placeholders()).toHaveLength(1);
		expect(placeholders()[0]).toBe(card);
		expect(seconds()).toBe('5s');
	});
});

describe('uploaded skill reads in the collapsed group summary', () => {
	let svelte: typeof import('svelte');
	let stores: typeof import('$lib/stores');
	let helper: typeof import('$lib/components/chat/ocu-skill-call');
	let Group: typeof import('./ConsecutiveDetailsGroup.svelte').default;
	let fixtures: typeof import('../../../../../../test/ocu-workspace-fixtures');

	const invoice = (display_name: string | null): OcuUserSkill => ({
		name: 'invoice-builder',
		description: 'Builds invoices',
		display_name,
		enabled: true
	});
	// Entity-encoded like the backend's <details> attribute.
	const skillRead = (extra: Record<string, string> = {}): Token => ({
		summary: 'Tool Executed',
		text: '# SKILL',
		attributes: {
			type: 'tool_calls',
			id: 'call-skill',
			name: 'view',
			arguments:
				'{&quot;description&quot;:&quot;d&quot;,&quot;path&quot;:&quot;/mnt/skills/user/invoice-builder/SKILL.md&quot;}',
			done: 'true',
			status: 'completed',
			...extra
		}
	});
	const bash = (): Token => ({
		summary: 'Tool Executed',
		text: 'ok',
		attributes: {
			type: 'tool_calls',
			id: 'call-bash',
			name: 'bash_tool',
			arguments: '{&quot;command&quot;:&quot;ls&quot;}',
			done: 'true',
			status: 'completed'
		}
	});

	async function renderGroup(tokens: Token[]) {
		svelte.mount(Group, {
			target: document.body,
			props: { tokens, messageDone: true },
			context: new Map<unknown, unknown>([['i18n', fixtures.i18n]])
		});
		await svelte.tick();
	}

	const summary = () =>
		document.body.querySelector('.line-clamp-1 > span.text-gray-400')?.textContent;
	const prefix = () =>
		document.body.querySelector('.line-clamp-1 > span.text-gray-600')?.textContent;
	const toggle = () => document.body.querySelector('[aria-expanded]');
	const icon = () => document.body.querySelector('[role="button"] > div > div:first-child');

	beforeEach(async () => {
		vi.resetModules();
		getUserSkills.mockReset();
		localStorage.token = 'session';
		[svelte, stores, helper, { default: Group }, fixtures] = await Promise.all([
			import('svelte'),
			import('$lib/stores'),
			import('$lib/components/chat/ocu-skill-call'),
			import('./ConsecutiveDetailsGroup.svelte'),
			import('../../../../../../test/ocu-workspace-fixtures')
		]);
		stores.config.set({ features: { enable_ocu_workspace: true } } as never);
	});

	afterEach(() => {
		document.body.replaceChildren();
	});

	it('names the skill read before the bash call without opening the group', async () => {
		helper.rememberOcuSkills([invoice('发票生成')]);
		await renderGroup([skillRead(), bash()]);
		expect(summary()).toBe('Used skill: 发票生成, bash_tool');
		expect(prefix()).toBe('Explored');
		expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
	});

	it('counts two reads of one skill as one entry', async () => {
		helper.rememberOcuSkills([invoice('发票生成')]);
		await renderGroup([skillRead(), skillRead({ id: 'call-skill-2' }), bash()]);
		expect(summary()).toBe('2 Used skill: 发票生成, bash_tool');
	});

	it('still lists a failed read as used, under the upstream error icon', async () => {
		helper.rememberOcuSkills([invoice('发票生成')]);
		await renderGroup([skillRead({ status: 'failed' }), bash()]);
		expect(summary()).toBe('Used skill: 发票生成, bash_tool');
		expect(icon()?.className).toBe('text-red-500 dark:text-red-400');
	});

	it('re-labels the summary when the list arrives, with one request and no rows', async () => {
		let resolveList!: (skills: OcuUserSkill[]) => void;
		const list = new Promise<OcuUserSkill[]>((ok) => (resolveList = ok));
		getUserSkills.mockReturnValue(list);
		await renderGroup([skillRead(), bash()]);
		expect(summary()).toBe('Used skill: invoice-builder, bash_tool');
		resolveList([invoice('发票生成')]);
		await list;
		// The store write reaches the summary through the reactive chain over a few microtasks.
		await vi.waitFor(() => expect(summary()).toBe('Used skill: 发票生成, bash_tool'));
		// The slot wrapper renders only while the group is open.
		expect(document.body.querySelector('.mb-1')).toBeNull();
		expect(getUserSkills).toHaveBeenCalledTimes(1);
		expect(getUserSkills).toHaveBeenCalledWith('session');
	});

	it('keeps a group without a skill read as it was and requests nothing', async () => {
		await renderGroup([
			bash(),
			{ ...bash(), attributes: { ...bash().attributes, id: 'call-bash-2' } }
		]);
		expect(summary()).toBe('2 bash_tool');
		expect(getUserSkills).not.toHaveBeenCalled();
	});

	it('renders the display name as text, not markup', async () => {
		helper.rememberOcuSkills([invoice('A&amp;B "x"')]);
		await renderGroup([skillRead(), bash()]);
		expect(summary()).toBe('Used skill: A&amp;B "x", bash_tool');
	});
});
