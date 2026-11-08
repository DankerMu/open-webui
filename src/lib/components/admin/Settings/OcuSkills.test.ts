// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { toast } from 'svelte-sonner';
import { i18n } from '../../../../../test/ocu-workspace-fixtures';
import {
	deleteSkill,
	getAdminSkills,
	updateSkillAccess,
	uploadSkill,
	type OcuSkillGrant
} from '$lib/apis/ocu/skills';
import OcuSkills from './OcuSkills.svelte';

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('$lib/apis/ocu/skills', () => ({
	getAdminSkills: vi.fn(),
	uploadSkill: vi.fn(),
	updateSkillAccess: vi.fn(),
	deleteSkill: vi.fn()
}));
// The dialogs' real trap throws in jsdom: tabbable sees no client rects, so nothing is focusable.
vi.mock('focus-trap', () => ({
	createFocusTrap: () => {
		const trap = {
			activate: () => trap,
			deactivate: () => trap,
			pause: () => trap,
			unpause: () => trap
		};
		return trap;
	}
}));

const TOKEN = 'admin-session';
const groupGrant: OcuSkillGrant = {
	principal_type: 'group',
	principal_id: 'team-a',
	permission: 'read'
};
const userGrant: OcuSkillGrant = {
	principal_type: 'user',
	principal_id: 'user-7',
	permission: 'read'
};
const publicGrant: OcuSkillGrant = {
	principal_type: 'user',
	principal_id: '*',
	permission: 'read'
};

const skill = (name: string, access_grants: OcuSkillGrant[] = [publicGrant]) => ({
	name,
	description: `${name} description`,
	zip_sha256: 'abc',
	size: 12,
	created_by: 'admin-1',
	updated_at: 1700000000,
	access_grants
});

let component: ReturnType<typeof mount> | undefined;

// AccessControl resolves group and user names over the network on its own.
function stubPrincipalLookups() {
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
		const path = new URL(String(input), 'http://webui.test').pathname;
		if (path === '/api/v1/groups/') return Response.json([]);
		if (path === '/api/v1/groups/id/team-a/info') {
			return Response.json({ id: 'team-a', name: 'Team A', member_count: 3 });
		}
		if (path === '/api/v1/users/user-7/info') {
			return Response.json({ id: 'user-7', name: 'Ursula', email: 'ursula@example.com' });
		}
		throw new Error(`unexpected request ${path}`);
	});
}

async function render() {
	component = mount(OcuSkills, {
		target: document.body,
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await vi.waitFor(() => expect(getAdminSkills).toHaveBeenCalled());
	await tick();
}

const byCy = (cy: string) => document.body.querySelector<HTMLElement>(`[data-cy="${cy}"]`);
const rowNames = () =>
	[...document.body.querySelectorAll('[data-cy^="ocu-skills-row-"]')].map((row) =>
		row.getAttribute('data-cy')
	);
const dialogButton = (label: string) =>
	[...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
		(button) => button.textContent?.trim() === label
	);

async function choose(file: File) {
	const input = byCy('ocu-skills-upload') as HTMLInputElement;
	Object.defineProperty(input, 'files', { value: [file], configurable: true });
	input.dispatchEvent(new Event('change', { bubbles: true }));
	return input;
}

describe('admin workspace skills tab', () => {
	// jsdom has no Web Animations API, which the dialogs' intro transitions call when they open.
	// Both dialogs only animate in, so an animation that never finishes changes nothing we read.
	beforeAll(() => {
		Element.prototype.animate = () =>
			({ cancel() {}, onfinish: null, effect: null }) as unknown as Animation;
	});
	afterAll(() => {
		delete (Element.prototype as Partial<Element>).animate;
	});

	beforeEach(() => {
		localStorage.token = TOKEN;
		stubPrincipalLookups();
	});

	afterEach(() => {
		if (component) unmount(component);
		component = undefined;
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		document.body.replaceChildren();
	});

	it('lists every uploaded skill with its description from the admin listing', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([skill('invoice-builder'), skill('pdf-tools')]);
		await render();
		expect(getAdminSkills).toHaveBeenCalledTimes(1);
		expect(getAdminSkills).toHaveBeenCalledWith(TOKEN);
		expect(rowNames()).toEqual(['ocu-skills-row-invoice-builder', 'ocu-skills-row-pdf-tools']);
		expect(byCy('ocu-skills-row-invoice-builder')?.textContent).toContain(
			'invoice-builder description'
		);
	});

	it('states both effect timings', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([]);
		await render();
		expect(byCy('ocu-skills-notice-revocation')?.textContent).toContain('rebuilt');
		expect(byCy('ocu-skills-notice-replacement')?.textContent).toContain('60–420 s');
	});

	it('accepts only ZIP files in the upload picker', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([]);
		await render();
		const input = byCy('ocu-skills-upload') as HTMLInputElement;
		expect(input.type).toBe('file');
		expect(input.accept).toBe('.zip,application/zip');
	});

	it('shows the rejection reason verbatim and keeps the list', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([skill('invoice-builder')]);
		vi.mocked(uploadSkill).mockRejectedValue(new Error('SKILL.md frontmatter has no name'));
		await render();
		const zip = new File(['bad'], 'bad.zip', { type: 'application/zip' });
		const input = await choose(zip);
		await vi.waitFor(() =>
			expect(byCy('ocu-skills-upload-error')?.textContent?.trim()).toBe(
				'SKILL.md frontmatter has no name'
			)
		);
		expect(uploadSkill).toHaveBeenCalledWith(TOKEN, zip);
		expect(getAdminSkills).toHaveBeenCalledTimes(1);
		expect(rowNames()).toEqual(['ocu-skills-row-invoice-builder']);
		expect(input.value).toBe('');
	});

	it('re-fetches the list after a successful upload and clears the previous error', async () => {
		vi.mocked(getAdminSkills)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([skill('invoice-builder')]);
		vi.mocked(uploadSkill)
			.mockRejectedValueOnce(new Error('skill ZIP exceeds 50 MB'))
			.mockResolvedValueOnce({
				name: 'invoice-builder',
				description: 'invoice-builder description',
				zip_sha256: 'abc',
				size: 12
			});
		await render();
		const zip = new File(['zip'], 'skill.zip', { type: 'application/zip' });
		await choose(zip);
		await vi.waitFor(() => expect(byCy('ocu-skills-upload-error')).not.toBeNull());
		const input = await choose(zip);
		await vi.waitFor(() => expect(rowNames()).toEqual(['ocu-skills-row-invoice-builder']));
		expect(getAdminSkills).toHaveBeenCalledTimes(2);
		expect(byCy('ocu-skills-upload-error')).toBeNull();
		expect(input.value).toBe('');
	});

	it('sends no delete when the confirmation is cancelled', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([skill('invoice-builder')]);
		await render();
		byCy('ocu-skills-delete-invoice-builder')!.click();
		await tick();
		expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
			'invoice-builder'
		);
		dialogButton('Cancel')!.click();
		await tick();
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		expect(deleteSkill).not.toHaveBeenCalled();
		expect(rowNames()).toEqual(['ocu-skills-row-invoice-builder']);
	});

	it('deletes once after confirmation and removes the row', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([skill('invoice-builder'), skill('pdf-tools')]);
		vi.mocked(deleteSkill).mockResolvedValue(true);
		await render();
		byCy('ocu-skills-delete-invoice-builder')!.click();
		await tick();
		dialogButton('Delete')!.click();
		await vi.waitFor(() => expect(rowNames()).toEqual(['ocu-skills-row-pdf-tools']));
		expect(deleteSkill).toHaveBeenCalledTimes(1);
		expect(deleteSkill).toHaveBeenCalledWith(TOKEN, 'invoice-builder');
	});

	it('keeps the row and reports a failed delete', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([skill('invoice-builder')]);
		vi.mocked(deleteSkill).mockRejectedValue(new Error('Not found'));
		await render();
		byCy('ocu-skills-delete-invoice-builder')!.click();
		await tick();
		dialogButton('Delete')!.click();
		await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not found'));
		expect(rowNames()).toEqual(['ocu-skills-row-invoice-builder']);
	});

	it('opens the access editor with the stored grants and saves a change as three-key grants', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([
			skill('invoice-builder', [groupGrant, userGrant])
		]);
		vi.mocked(updateSkillAccess).mockResolvedValue(skill('invoice-builder', [publicGrant]));
		await render();
		byCy('ocu-skills-access-invoice-builder')!.click();
		const dialog = () => document.body.querySelector<HTMLElement>('.modal');
		await vi.waitFor(() => expect(dialog()?.textContent).toContain('Team A'));
		await vi.waitFor(() => expect(dialog()?.textContent).toContain('Ursula'));
		// Opening the editor is not a change.
		expect(updateSkillAccess).not.toHaveBeenCalled();
		const visibility = dialog()!.querySelector('select') as HTMLSelectElement;
		expect(visibility.value).toBe('private');
		// No write role and no "anyone" link grant can be produced here.
		expect([...visibility.options].map((option) => option.value)).toEqual(['private', 'public']);
		expect(dialog()!.querySelectorAll('select')).toHaveLength(1);

		visibility.value = 'public';
		visibility.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(updateSkillAccess).toHaveBeenCalledTimes(1));
		expect(updateSkillAccess).toHaveBeenCalledWith(TOKEN, 'invoice-builder', [
			groupGrant,
			userGrant,
			publicGrant
		]);

		// The row now holds the grants the server answered with.
		(dialog()!.querySelector('button') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(dialog()).toBeNull());
		byCy('ocu-skills-access-invoice-builder')!.click();
		await vi.waitFor(() => expect(dialog()).not.toBeNull());
		expect((dialog()!.querySelector('select') as HTMLSelectElement).value).toBe('public');
		expect(dialog()!.textContent).not.toContain('Team A');
	});

	it('reports a failed access change and re-fetches the list', async () => {
		vi.mocked(getAdminSkills).mockResolvedValue([skill('invoice-builder', [userGrant])]);
		vi.mocked(updateSkillAccess).mockRejectedValue(new Error('HTTP 422'));
		await render();
		byCy('ocu-skills-access-invoice-builder')!.click();
		const dialog = () => document.body.querySelector<HTMLElement>('.modal');
		await vi.waitFor(() => expect(dialog()?.querySelector('select')).not.toBeNull());
		const visibility = dialog()!.querySelector('select') as HTMLSelectElement;
		visibility.value = 'public';
		visibility.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('HTTP 422'));
		await vi.waitFor(() => expect(getAdminSkills).toHaveBeenCalledTimes(2));
		// The editor falls back to what the server still holds.
		await vi.waitFor(() => expect(visibility.value).toBe('private'));
	});

	it('reports a failed listing', async () => {
		vi.mocked(getAdminSkills).mockRejectedValue(new Error('HTTP 500'));
		await render();
		await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('HTTP 500'));
		expect(rowNames()).toEqual([]);
	});
});
