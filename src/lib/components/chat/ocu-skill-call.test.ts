// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcuUserSkill } from '$lib/apis/ocu/skills';

// One instance for every re-import: the helper is re-imported per test to reset its page state.
const getUserSkills = vi.hoisted(() => vi.fn());
vi.mock('$lib/apis/ocu/skills', () => ({ getUserSkills }));

type Helper = typeof import('./ocu-skill-call');

let helper: Helper;
let get: typeof import('svelte/store').get;

const ON = { features: { enable_ocu_workspace: true } };
const skill = (display_name: string | null, enabled = true): OcuUserSkill => ({
	name: 'invoice-builder',
	description: 'Builds invoices',
	display_name,
	enabled
});
const deferred = () => {
	let resolveList!: (skills: OcuUserSkill[]) => void;
	let rejectList!: (error: Error) => void;
	const promise = new Promise<OcuUserSkill[]>((ok, fail) => {
		resolveList = ok;
		rejectList = fail;
	});
	return { promise, resolveList, rejectList };
};
const shown = (name = 'invoice-builder') =>
	helper.shownSkillName(get(helper.ocuSkillDisplayNames), name);
// The load settles on a later microtask than the test's own await of the same promise.
const settled = () => new Promise((done) => setTimeout(done, 0));

beforeEach(async () => {
	vi.resetModules();
	getUserSkills.mockReset();
	localStorage.token = 'session';
	[helper, { get }] = await Promise.all([import('./ocu-skill-call'), import('svelte/store')]);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('uploaded skill call matcher', () => {
	const PATH = '/mnt/skills/user/invoice-builder/SKILL.md';

	it.each([
		['raw JSON', `{"description":"d","path":"${PATH}"}`],
		[
			'entity-encoded JSON',
			`{&quot;description&quot;:&quot;d&quot;,&quot;path&quot;:&quot;${PATH}&quot;}`
		],
		[
			'JSON with an extra view_range key',
			`{"description":"d","path":"${PATH}","view_range":[1,5]}`
		],
		[
			// What the removed upstream serialize_output wrote into stored <details> content:
			// html.escape(json.dumps(arguments)) over the arguments string, so JSON inside JSON.
			'legacy <details> content (JSON-in-JSON, entity-encoded)',
			String.raw`&quot;{\&quot;description\&quot;: \&quot;d\&quot;, \&quot;path\&quot;: \&quot;/mnt/skills/user/invoice-builder/SKILL.md\&quot;}&quot;`
		]
	])('matches the skill name from %s', (_form, args) => {
		expect(helper.uploadedSkillName('view', args)).toBe('invoice-builder');
	});

	it.each([
		'/mnt/skills/public/docx/SKILL.md',
		'/mnt/skills/user/invoice-builder/scripts/run.py',
		'/mnt/skills/user/../SKILL.md',
		'/mnt/skills/user/Invoice/SKILL.md',
		'/mnt/skills/user/invoice-builder/SKILL.md/'
	])('does not match the path %s', (path) => {
		expect(helper.uploadedSkillName('view', JSON.stringify({ description: 'd', path }))).toBeNull();
	});

	it('does not match another tool on the skill path', () => {
		expect(helper.uploadedSkillName('bash_tool', JSON.stringify({ path: PATH }))).toBeNull();
	});

	it.each(['', '{"path":', '[]', '"x"', '{"path":5}'])(
		'does not match the arguments %j and does not throw',
		(args) => {
			expect(helper.uploadedSkillName('view', args)).toBeNull();
		}
	);

	it('does not match missing name or arguments', () => {
		expect(helper.uploadedSkillName(undefined, undefined)).toBeNull();
		expect(helper.uploadedSkillName('view', undefined)).toBeNull();
	});
});

describe('uploaded skill display-name store', () => {
	it('loads the list once per page, however often a row asks', async () => {
		const list = deferred();
		getUserSkills.mockReturnValue(list.promise);
		helper.loadOcuSkillDisplayNames(ON);
		helper.loadOcuSkillDisplayNames(ON);
		helper.loadOcuSkillDisplayNames(ON);
		list.resolveList([skill('发票生成')]);
		await settled();
		helper.loadOcuSkillDisplayNames(ON);
		helper.loadOcuSkillDisplayNames(ON);
		expect(getUserSkills).toHaveBeenCalledTimes(1);
		expect(getUserSkills).toHaveBeenCalledWith('session');
		expect(shown()).toBe('发票生成');
	});

	it('takes a slash-menu write as the new source', () => {
		helper.rememberOcuSkills([skill('发票生成')]);
		helper.rememberOcuSkills([skill('新名字')]);
		expect(shown()).toBe('新名字');
	});

	it('returns the written list, so the menu keeps its entries', () => {
		const list = [skill('发票生成')];
		expect(helper.rememberOcuSkills(list)).toBe(list);
	});

	it('makes no row load after a slash-menu write', () => {
		helper.rememberOcuSkills([skill('新名字')]);
		helper.loadOcuSkillDisplayNames(ON);
		expect(getUserSkills).not.toHaveBeenCalled();
		expect(shown()).toBe('新名字');
	});

	it.each([[{ features: { enable_ocu_workspace: false } }], [{}], [undefined]])(
		'requests nothing while the workspace feature is off (%j)',
		(config) => {
			helper.loadOcuSkillDisplayNames(config);
			expect(getUserSkills).not.toHaveBeenCalled();
			expect(shown()).toBe('invoice-builder');
		}
	);

	it('loads once when the feature turns on after a feature-off call', async () => {
		getUserSkills.mockResolvedValue([skill('发票生成')]);
		helper.loadOcuSkillDisplayNames({ features: { enable_ocu_workspace: false } });
		helper.loadOcuSkillDisplayNames(ON);
		helper.loadOcuSkillDisplayNames(ON);
		await settled();
		expect(getUserSkills).toHaveBeenCalledTimes(1);
		expect(shown()).toBe('发票生成');
	});

	it('keeps the display name of a disabled skill', async () => {
		getUserSkills.mockResolvedValue([skill('发票生成', false)]);
		helper.loadOcuSkillDisplayNames(ON);
		await settled();
		expect(shown()).toBe('发票生成');
	});

	it('falls back to the English name after a failed load, warns once and never retries', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error');
		getUserSkills.mockRejectedValue(new Error('HTTP 500'));
		helper.loadOcuSkillDisplayNames(ON);
		await settled();
		helper.loadOcuSkillDisplayNames(ON);
		await settled();
		expect(getUserSkills).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(error).not.toHaveBeenCalled();
		expect(shown()).toBe('invoice-builder');
	});

	it('keeps a map written while the failed load was in flight', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const list = deferred();
		getUserSkills.mockReturnValue(list.promise);
		helper.loadOcuSkillDisplayNames(ON);
		helper.rememberOcuSkills([skill('新名字')]);
		list.rejectList(new Error('HTTP 500'));
		await settled();
		expect(shown()).toBe('新名字');
	});

	it('shows the name itself for an unknown skill and for a null display name', () => {
		helper.rememberOcuSkills([skill(null)]);
		expect(shown()).toBe('invoice-builder');
		expect(shown('budget-planner')).toBe('budget-planner');
	});

	it('shows the name itself before anything was loaded', () => {
		expect(shown()).toBe('invoice-builder');
	});
});

describe('uploaded skill call labels in zh-CN', () => {
	it('translates the three row labels', () => {
		const zh = JSON.parse(
			readFileSync(resolve(__dirname, '../../i18n/locales/zh-CN/translation.json'), 'utf8')
		);
		expect(zh['Used skill: {{NAME}}']).toBe('使用技能：{{NAME}}');
		expect(zh['Reading skill: {{NAME}}...']).toBe('正在读取技能：{{NAME}}…');
		expect(zh['Skill read failed: {{NAME}}']).toBe('读取技能失败：{{NAME}}');
	});
});
