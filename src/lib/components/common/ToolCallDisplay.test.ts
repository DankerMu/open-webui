// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcuUserSkill } from '$lib/apis/ocu/skills';

// One instance for every re-import: each test re-imports the row to start with an empty store.
const getUserSkills = vi.hoisted(() => vi.fn());
vi.mock('$lib/apis/ocu/skills', () => ({ getUserSkills }));

type Attributes = Record<string, string>;

let svelte: typeof import('svelte');
let stores: typeof import('$lib/stores');
let helper: typeof import('$lib/components/chat/ocu-skill-call');
let ToolCallDisplay: typeof import('./ToolCallDisplay.svelte').default;
let fixtures: typeof import('../../../../test/ocu-workspace-fixtures');

const SKILL_PATH = '/mnt/skills/user/invoice-builder/SKILL.md';
const DOCX_PATH = '/mnt/skills/public/docx/SKILL.md';
const skill = (display_name: string | null): OcuUserSkill => ({
	name: 'invoice-builder',
	description: 'Builds invoices',
	display_name,
	enabled: true
});
const view = (path: string, extra: Attributes = {}): Attributes => ({
	type: 'tool_calls',
	id: 'call-1',
	name: 'view',
	arguments: JSON.stringify({ description: 'd', path }),
	done: 'true',
	status: 'completed',
	result: '# SKILL',
	...extra
});
const skillRow = (extra: Attributes = {}) => view(SKILL_PATH, extra);
const setWorkspace = (enabled: boolean) =>
	stores.config.set({ features: { enable_ocu_workspace: enabled } } as never);

async function render(attributes: Attributes, props: Record<string, unknown> = {}) {
	svelte.mount(ToolCallDisplay, {
		target: document.body,
		props: { attributes, ...props },
		context: new Map<unknown, unknown>([['i18n', fixtures.i18n]])
	});
	await svelte.tick();
}

const fullLabel = () => document.body.querySelector('.\\@md\\:inline')?.textContent?.trim();
const shortLabel = () => document.body.querySelector('.\\@md\\:hidden')?.textContent?.trim();
const icon = () => document.body.querySelector('[role="button"] > div > div:first-child');

beforeEach(async () => {
	vi.resetModules();
	getUserSkills.mockReset();
	localStorage.token = 'session';
	[svelte, stores, helper, { default: ToolCallDisplay }, fixtures] = await Promise.all([
		import('svelte'),
		import('$lib/stores'),
		import('$lib/components/chat/ocu-skill-call'),
		import('./ToolCallDisplay.svelte'),
		import('../../../../test/ocu-workspace-fixtures')
	]);
	setWorkspace(true);
});

afterEach(() => {
	document.body.replaceChildren();
});

describe('uploaded skill tool-call row', () => {
	beforeEach(() => {
		helper.rememberOcuSkills([skill('发票生成')]);
	});

	it.each([
		['preparing', { done: 'false', status: '' }, false, 'Reading skill: 发票生成...'],
		[
			'pending, not resolvable',
			{ done: 'false', status: 'pending' },
			false,
			'Reading skill: 发票生成...'
		],
		['executing', { done: 'false', status: 'completed' }, false, 'Reading skill: 发票生成...'],
		['done', { done: 'true', status: 'completed' }, false, 'Used skill: 发票生成'],
		['failed status', { done: 'false', status: 'failed' }, false, 'Skill read failed: 发票生成'],
		[
			'error result',
			{ done: 'true', result: 'Error: not found' },
			false,
			'Skill read failed: 发票生成'
		],
		['rejected', { status: 'rejected' }, false, 'Denied view'],
		['awaiting approval', { done: 'false', status: 'pending' }, true, 'Allow view?']
	])('labels the %s state', async (_state, extra, resolvable, label) => {
		await render(skillRow(extra), { resolvable });
		expect(fullLabel()).toBe(label);
		expect(shortLabel()).toBe('发票生成');
	});

	it('keeps the Allow and Deny buttons while awaiting approval', async () => {
		await render(skillRow({ done: 'false', status: 'pending' }), { resolvable: true });
		expect(document.body.querySelector('.tool-call-allow-button')).not.toBeNull();
		expect(document.body.querySelector('.tool-call-deny-button')).not.toBeNull();
	});

	it('keeps the upstream text of an ask_user row awaiting input', async () => {
		await render({ ...skillRow({ done: 'false', status: 'pending' }), name: 'ask_user' });
		expect(fullLabel()).toBe('Input needed');
		expect(shortLabel()).toBe('ask_user');
	});

	it('keeps the upstream label of a built-in skill read', async () => {
		await render(view(DOCX_PATH));
		expect(fullLabel()).toBe('View Result from view');
		expect(shortLabel()).toBe('view');
	});

	it('keeps the status icon and the expanded input and output of a built-in read', async () => {
		await render(skillRow(), { open: true });
		const skillIcon = icon()?.outerHTML;
		const skillBody = document.body.querySelector('.rounded-2xl')?.textContent?.replace(/\s+/g, '');
		document.body.replaceChildren();
		await render(view(DOCX_PATH), { open: true });
		expect(icon()?.className).toBe('text-emerald-500 dark:text-emerald-400');
		expect(skillIcon).toBe(icon()?.outerHTML);
		expect(skillBody).toBe(`Inputdescriptiondpath${SKILL_PATH}Output#SKILL`);
		expect(document.body.querySelector('.rounded-2xl')?.textContent?.replace(/\s+/g, '')).toBe(
			`Inputdescriptiondpath${DOCX_PATH}Output#SKILL`
		);
	});

	it.each([
		['failed status', { done: 'false', status: 'failed' }, 'text-red-500 dark:text-red-400'],
		['error result', { result: 'Error: not found' }, 'text-red-500 dark:text-red-400'],
		['rejected', { status: 'rejected' }, 'text-red-400 dark:text-red-500']
	])('keeps the upstream icon of the %s row', async (_state, extra, className) => {
		await render(skillRow(extra));
		expect(icon()?.className).toBe(className);
	});

	it('renders the display name as text, not markup', async () => {
		helper.rememberOcuSkills([skill('A&amp;B "x"')]);
		await render(skillRow());
		expect(document.body.querySelector('.\\@md\\:inline')?.textContent).toBe(
			'Used skill: A&amp;B "x"'
		);
	});

	it('requests nothing once the slash menu filled the store', async () => {
		await render(skillRow());
		expect(getUserSkills).not.toHaveBeenCalled();
	});
});

describe('uploaded skill tool-call row before the list is loaded', () => {
	it('re-labels the row when the list arrives', async () => {
		let resolveList!: (skills: OcuUserSkill[]) => void;
		const list = new Promise<OcuUserSkill[]>((ok) => (resolveList = ok));
		getUserSkills.mockReturnValue(list);
		await render(skillRow());
		expect(fullLabel()).toBe('Used skill: invoice-builder');
		expect(shortLabel()).toBe('invoice-builder');
		resolveList([skill('发票生成')]);
		await list;
		// The store write reaches the label through the row's reactive chain over a few microtasks.
		await vi.waitFor(() => expect(fullLabel()).toBe('Used skill: 发票生成'));
		expect(shortLabel()).toBe('发票生成');
		expect(getUserSkills).toHaveBeenCalledTimes(1);
		expect(getUserSkills).toHaveBeenCalledWith('session');
	});

	it('requests nothing and shows the English name with the workspace off', async () => {
		setWorkspace(false);
		await render(skillRow());
		expect(getUserSkills).not.toHaveBeenCalled();
		expect(fullLabel()).toBe('Used skill: invoice-builder');
	});

	it.each([
		['a bash_tool row', { ...view(SKILL_PATH), name: 'bash_tool' }],
		['a built-in skill read', view(DOCX_PATH)]
	])('requests nothing for %s', async (_row, attributes) => {
		await render(attributes);
		expect(getUserSkills).not.toHaveBeenCalled();
	});
});
