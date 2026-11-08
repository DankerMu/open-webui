// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { toast } from 'svelte-sonner';
import { i18n } from '../../../../../test/ocu-workspace-fixtures';
import { getUserSkills, toggleSkill, type OcuUserSkill } from '$lib/apis/ocu/skills';
import OcuSkillPreferences from './OcuSkillPreferences.svelte';

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('$lib/apis/ocu/skills', () => ({
	getUserSkills: vi.fn(),
	toggleSkill: vi.fn()
}));

const TOKEN = 'user-session';

const skill = (name: string, enabled = true): OcuUserSkill => ({
	name,
	description: `${name} description`,
	enabled
});

let component: ReturnType<typeof mount> | undefined;

async function render() {
	component = mount(OcuSkillPreferences, {
		target: document.body,
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await vi.waitFor(() => expect(getUserSkills).toHaveBeenCalled());
	await tick();
}

const byCy = (cy: string) => document.body.querySelector<HTMLElement>(`[data-cy="${cy}"]`);
const rowNames = () =>
	[...document.body.querySelectorAll('[data-cy^="ocu-skills-pref-row-"]')].map((row) =>
		row.getAttribute('data-cy')
	);
// The accessible name of each switch is its skill's name.
const switchFor = (name: string) => {
	const control = document.body.querySelector<HTMLButtonElement>(
		`[role="switch"][aria-label="${name}"]`
	);
	expect(control, name).not.toBeNull();
	expect(byCy(`ocu-skills-pref-switch-${name}`)?.contains(control)).toBe(true);
	return control!;
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('personal workspace skills tab', () => {
	beforeEach(() => {
		localStorage.token = TOKEN;
	});

	afterEach(() => {
		if (component) unmount(component);
		component = undefined;
		vi.clearAllMocks();
		document.body.replaceChildren();
	});

	it('lists every readable skill with a switch set to its enabled state', async () => {
		vi.mocked(getUserSkills).mockResolvedValue([skill('a'), skill('b', false)]);
		await render();
		expect(getUserSkills).toHaveBeenCalledTimes(1);
		expect(getUserSkills).toHaveBeenCalledWith(TOKEN);
		expect(rowNames()).toEqual(['ocu-skills-pref-row-a', 'ocu-skills-pref-row-b']);
		expect(byCy('ocu-skills-pref-row-a')?.textContent).toContain('a description');
		expect(byCy('ocu-skills-pref-row-b')?.textContent).toContain('b description');
		expect(switchFor('a').getAttribute('aria-checked')).toBe('true');
		expect(switchFor('b').getAttribute('aria-checked')).toBe('false');
		expect(byCy('ocu-skills-pref-empty')).toBeNull();
		expect(toggleSkill).not.toHaveBeenCalled();
	});

	it('turns a switch off through one toggle and keeps the server answer', async () => {
		vi.mocked(getUserSkills).mockResolvedValue([skill('a'), skill('b')]);
		vi.mocked(toggleSkill).mockResolvedValue(skill('a', false));
		await render();
		switchFor('a').click();
		await vi.waitFor(() => expect(toggleSkill).toHaveBeenCalledTimes(1));
		expect(toggleSkill).toHaveBeenCalledWith(expect.any(String), 'a', false);
		await vi.waitFor(() => expect(switchFor('a').matches(':disabled')).toBe(false));
		expect(switchFor('a').getAttribute('aria-checked')).toBe('false');
		expect(switchFor('b').getAttribute('aria-checked')).toBe('true');
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('takes the enabled state from the toggle response', async () => {
		vi.mocked(getUserSkills).mockResolvedValue([skill('a', false)]);
		// The server is the only writer: whatever it answers is what the row shows.
		vi.mocked(toggleSkill).mockResolvedValue(skill('a', false));
		await render();
		switchFor('a').click();
		await vi.waitFor(() => expect(toggleSkill).toHaveBeenCalledWith(TOKEN, 'a', true));
		await vi.waitFor(() => expect(switchFor('a').matches(':disabled')).toBe(false));
		expect(switchFor('a').getAttribute('aria-checked')).toBe('false');
		// Setting the row from the answer is not a user change and sends nothing more.
		await tick();
		expect(toggleSkill).toHaveBeenCalledTimes(1);
	});

	it('disables the switch while its toggle is in flight, so a second click sends nothing', async () => {
		vi.mocked(getUserSkills).mockResolvedValue([skill('a'), skill('b')]);
		const reply = deferred<OcuUserSkill>();
		vi.mocked(toggleSkill).mockReturnValue(reply.promise);
		await render();
		switchFor('a').click();
		await vi.waitFor(() => expect(toggleSkill).toHaveBeenCalledTimes(1));
		await tick();
		expect(switchFor('a').matches(':disabled')).toBe(true);
		// The other skill's switch is not held by this request.
		expect(switchFor('b').matches(':disabled')).toBe(false);

		switchFor('a').click();
		await tick();
		await tick();
		expect(toggleSkill).toHaveBeenCalledTimes(1);
		expect(switchFor('a').getAttribute('aria-checked')).toBe('false');
		expect(switchFor('a').matches(':disabled')).toBe(true);

		reply.resolve(skill('a', false));
		await vi.waitFor(() => expect(switchFor('a').matches(':disabled')).toBe(false));
		expect(switchFor('a').getAttribute('aria-checked')).toBe('false');
		expect(toggleSkill).toHaveBeenCalledTimes(1);
	});

	it('reverts a switch whose toggle is refused and shows the server reason', async () => {
		vi.mocked(getUserSkills).mockResolvedValue([skill('a')]);
		vi.mocked(toggleSkill).mockRejectedValue(
			new Error("We could not find what you're looking for :/")
		);
		await render();
		switchFor('a').click();
		await vi.waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith("We could not find what you're looking for :/")
		);
		expect(toggleSkill).toHaveBeenCalledWith(TOKEN, 'a', false);
		await vi.waitFor(() => expect(switchFor('a').getAttribute('aria-checked')).toBe('true'));
		expect(switchFor('a').matches(':disabled')).toBe(false);
		// The revert is not a user change and sends nothing more.
		await tick();
		expect(toggleSkill).toHaveBeenCalledTimes(1);
	});

	it('shows the empty state when no skill is readable', async () => {
		vi.mocked(getUserSkills).mockResolvedValue([]);
		await render();
		await vi.waitFor(() => expect(byCy('ocu-skills-pref-empty')).not.toBeNull());
		expect(rowNames()).toEqual([]);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('reports a failed listing and shows the empty state', async () => {
		vi.mocked(getUserSkills).mockRejectedValue(new Error('HTTP 500'));
		await render();
		await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('HTTP 500'));
		await vi.waitFor(() => expect(byCy('ocu-skills-pref-empty')).not.toBeNull());
		expect(rowNames()).toEqual([]);
	});
});
