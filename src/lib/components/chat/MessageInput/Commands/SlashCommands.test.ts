// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import { i18n } from '../../../../../../test/ocu-workspace-fixtures';
import { getPrompts } from '$lib/apis/prompts';
import { getSkillItems } from '$lib/apis/skills';
import { getUserSkills, type OcuUserSkill } from '$lib/apis/ocu/skills';
import { config } from '$lib/stores';
import SlashCommands from './SlashCommands.svelte';
import CommandSuggestionList from '../CommandSuggestionList.svelte';

vi.mock('$lib/apis/prompts', () => ({ getPrompts: vi.fn() }));
vi.mock('$lib/apis/skills', () => ({ getSkillItems: vi.fn() }));
vi.mock('$lib/apis/ocu/skills', () => ({ getUserSkills: vi.fn() }));

const GROUP = '[data-cy="ocu-skills-slash-group"]';
const NATIVE = { id: 'native-skill', name: 'Native skill', description: '' };
const invoice: OcuUserSkill = {
	name: 'invoice-builder',
	description: 'Builds invoices',
	display_name: null,
	enabled: true
};
const disabled: OcuUserSkill = {
	name: 'harness-smoke-skill',
	description: 'Harness smoke skill',
	display_name: null,
	enabled: false
};
const named = (name: string, display_name: string | null): OcuUserSkill => ({
	name,
	description: '',
	display_name,
	enabled: true
});
const invoiceNamed = named('invoice-builder', '发票生成');
const pdfTools = named('pdf-tools', null);

let component: ReturnType<typeof createClassComponent> | undefined;
let onSelect: ReturnType<typeof vi.fn>;

const setWorkspace = (enabled: boolean) =>
	config.set({ features: { enable_ocu_workspace: enabled } } as never);

// The suggestion renderer mounts this component through the same legacy wrapper and then only
// `$set`s `query` while the user types (RichTextInput/suggestions.ts).
async function render(query = '') {
	component = createClassComponent({
		component: SlashCommands,
		target: document.body,
		props: { query, onSelect },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await settle(query);
}

async function renderList(command: ReturnType<typeof vi.fn>) {
	component = createClassComponent({
		component: CommandSuggestionList,
		target: document.body,
		props: { char: '/', query: '', command, onSelect },
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await settle('');
}

// One native debounce round (200 ms) is the sync point: it runs after the mount-time OCU fetch.
async function settle(query: string) {
	await vi.waitFor(() => expect(getSkillItems).toHaveBeenLastCalledWith('session', query));
	await tick();
}

async function type(query: string) {
	component!.$set({ query });
	await settle(query);
}

const group = () => document.body.querySelector(GROUP);
const rows = () =>
	[...document.body.querySelectorAll(`${GROUP} [data-cy^="ocu-skills-slash-"]`)].map((row) =>
		row.getAttribute('data-cy')
	);
const nativeRow = () =>
	[...document.body.querySelectorAll('button')].find((button) =>
		button.textContent?.includes(NATIVE.name)
	);
const row = (name: string) =>
	document.body.querySelector<HTMLButtonElement>(`[data-cy="ocu-skills-slash-${name}"]`);

describe('slash menu workspace skills group', () => {
	beforeEach(() => {
		localStorage.token = 'session';
		onSelect = vi.fn();
		vi.mocked(getPrompts).mockResolvedValue([]);
		vi.mocked(getSkillItems).mockResolvedValue({ items: [NATIVE], total: 1 });
		vi.mocked(getUserSkills).mockResolvedValue([invoice, disabled]);
		setWorkspace(true);
	});

	afterEach(() => {
		component?.$destroy();
		component = undefined;
		document.body.replaceChildren();
		config.set(undefined);
		vi.clearAllMocks();
	});

	it('lists only the enabled skills under the Workspace Skills header', async () => {
		await render();
		expect(getUserSkills).toHaveBeenCalledWith('session');
		expect(group()?.textContent).toContain('Workspace Skills');
		expect(rows()).toEqual(['ocu-skills-slash-invoice-builder']);
		expect(row('invoice-builder')?.textContent).toContain('invoice-builder');
	});

	it('filters by query and fetches once across query changes', async () => {
		await render();
		await type('inv');
		expect(rows()).toEqual(['ocu-skills-slash-invoice-builder']);
		await type('INV');
		expect(rows()).toEqual(['ocu-skills-slash-invoice-builder']);
		await type('zzz');
		expect(group()).toBeNull();
		await type('');
		expect(rows()).toEqual(['ocu-skills-slash-invoice-builder']);
		expect(getUserSkills).toHaveBeenCalledTimes(1);
	});

	it('sorts the enabled entries by name', async () => {
		vi.mocked(getUserSkills).mockResolvedValue([
			invoice,
			disabled,
			{ name: 'budget-planner', description: '', display_name: null, enabled: true }
		]);
		await render();
		expect(rows()).toEqual(['ocu-skills-slash-budget-planner', 'ocu-skills-slash-invoice-builder']);
	});

	it('selects an entry by click without touching the native items', async () => {
		await render();
		row('invoice-builder')!.click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith({
			type: 'ocu_skill',
			data: expect.objectContaining({ name: 'invoice-builder' })
		});
	});

	it('appends the entries after the native skills for keyboard selection', async () => {
		await render();
		// Query '' with no optional commands: model, settings, the native skill, then the OCU entry.
		component!.selectDown();
		component!.selectDown();
		await tick();
		expect(nativeRow()?.getAttribute('data-selected')).toBe('true');
		component!.selectDown();
		await tick();
		expect(nativeRow()?.getAttribute('data-selected')).toBe('false');
		expect(row('invoice-builder')?.getAttribute('data-selected')).toBe('true');
		await component!.select();
		expect(onSelect).toHaveBeenCalledWith({
			type: 'ocu_skill',
			data: expect.objectContaining({ name: 'invoice-builder' })
		});
	});

	it('requests nothing and renders no group while the workspace is off', async () => {
		setWorkspace(false);
		await render();
		await type('inv');
		expect(getUserSkills).not.toHaveBeenCalled();
		expect(group()).toBeNull();
		expect(document.body.querySelector('[data-cy^="ocu-skills-slash-"]')).toBeNull();
	});

	it('gives an empty group when the skill list request fails', async () => {
		vi.mocked(getUserSkills).mockRejectedValue(new Error('HTTP 500'));
		await render();
		expect(getUserSkills).toHaveBeenCalledTimes(1);
		expect(group()).toBeNull();
		expect(nativeRow()).not.toBeNull();
	});

	it('inserts the `/` mention the editor writes as <$ocu--name|name>, with no onSelect', async () => {
		const command = vi.fn();
		await renderList(command);
		row('invoice-builder')!.click();
		expect(command).toHaveBeenCalledTimes(1);
		expect(command).toHaveBeenCalledWith({
			id: 'ocu--invoice-builder|invoice-builder',
			label: 'invoice-builder',
			mentionSuggestionChar: '/'
		});
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('keeps the native skill branch: its id, no trigger char, and onSelect', async () => {
		const command = vi.fn();
		await renderList(command);
		nativeRow()!.click();
		expect(command).toHaveBeenCalledWith({
			id: 'native-skill|Native skill',
			label: 'Native skill'
		});
		expect(onSelect).toHaveBeenCalledWith({ type: 'skill', data: NATIVE });
	});

	describe('display names', () => {
		const slug = (name: string) =>
			document.body.querySelector(`[data-cy="ocu-slash-skill-slug-${name}"]`);
		const invoiceMention = {
			id: 'ocu--invoice-builder|发票生成',
			label: '发票生成',
			mentionSuggestionChar: '/'
		};

		// After the outer set-up: no native skill, so at query 发票 the OCU entry is item 0.
		beforeEach(() => {
			vi.mocked(getSkillItems).mockResolvedValue({ items: [], total: 0 });
			vi.mocked(getUserSkills).mockResolvedValue([invoiceNamed, pdfTools]);
		});

		it.each([
			['发票', ['ocu-skills-slash-invoice-builder']],
			['invoice', ['ocu-skills-slash-invoice-builder']],
			['INVOICE', ['ocu-skills-slash-invoice-builder']],
			['pdf', ['ocu-skills-slash-pdf-tools']]
		])('query %s matches the display name or the English name', async (query, expected) => {
			await render();
			await type(query);
			expect(rows()).toEqual(expected);
		});

		it('shows the display name first and the English name as secondary text', async () => {
			await render();
			const shown = row('invoice-builder')!.querySelector('span')!;
			expect(shown.textContent?.trim()).toBe('发票生成');
			expect(slug('invoice-builder')?.textContent?.trim()).toBe('invoice-builder');
			expect(shown.compareDocumentPosition(slug('invoice-builder')!)).toBe(
				Node.DOCUMENT_POSITION_FOLLOWING
			);
			expect(row('pdf-tools')!.querySelector('span')!.textContent?.trim()).toBe('pdf-tools');
			expect(slug('pdf-tools')).toBeNull();
		});

		it('sorts by the shown name, not the English name', async () => {
			vi.mocked(getUserSkills).mockResolvedValue([
				named('beta-tool', null),
				named('zeta-tool', 'Alpha 工具')
			]);
			await render();
			expect(rows()).toEqual(['ocu-skills-slash-zeta-tool', 'ocu-skills-slash-beta-tool']);
		});

		it('hands the skill to onSelect by click and by Enter on the selected row', async () => {
			await render();
			row('invoice-builder')!.click();
			expect(onSelect).toHaveBeenLastCalledWith({ type: 'ocu_skill', data: invoiceNamed });
			await type('发票');
			expect(row('invoice-builder')?.getAttribute('data-selected')).toBe('true');
			await component!.select();
			expect(onSelect).toHaveBeenCalledTimes(2);
			expect(onSelect).toHaveBeenLastCalledWith({ type: 'ocu_skill', data: invoiceNamed });
		});

		it('inserts ocu--{name}|{shown name} with the shown name as label, by click and Enter', async () => {
			const command = vi.fn();
			await renderList(command);
			row('invoice-builder')!.click();
			expect(command).toHaveBeenLastCalledWith(invoiceMention);
			row('pdf-tools')!.click();
			expect(command).toHaveBeenLastCalledWith({
				id: 'ocu--pdf-tools|pdf-tools',
				label: 'pdf-tools',
				mentionSuggestionChar: '/'
			});
			await type('发票');
			expect(row('invoice-builder')?.getAttribute('data-selected')).toBe('true');
			component!._onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
			expect(command).toHaveBeenCalledTimes(3);
			expect(command).toHaveBeenLastCalledWith(invoiceMention);
			expect(onSelect).not.toHaveBeenCalled();
		});
	});
});
