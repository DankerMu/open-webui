import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	deleteSkill,
	getAdminSkills,
	updateSkillAccess,
	uploadSkill,
	type OcuSkillGrant
} from './skills';

const TOKEN = 'session-token';

const adminListing = [
	{
		name: 'invoice-builder',
		description: 'Builds invoices.',
		zip_sha256: 'abc',
		size: 12,
		created_by: 'admin-1',
		updated_at: 1700000000,
		access_grants: [{ principal_type: 'user', principal_id: '*', permission: 'read' }]
	}
];

const uploaded = {
	name: 'invoice-builder',
	description: 'Builds invoices.',
	zip_sha256: 'abc',
	size: 12
};

type Call = { url: string; init: RequestInit };

const stubFetch = (response: () => Response) => {
	const calls: Call[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push({ url: String(input), init: init ?? {} });
			return response();
		})
	);
	return calls;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Every admin route, called once, so each error case runs against all four.
const routes: [string, () => Promise<unknown>][] = [
	['getAdminSkills', () => getAdminSkills(TOKEN)],
	['uploadSkill', () => uploadSkill(TOKEN, new Blob(['zip']))],
	['updateSkillAccess', () => updateSkillAccess(TOKEN, 'invoice-builder', [])],
	['deleteSkill', () => deleteSkill(TOKEN, 'invoice-builder')]
];

describe('ocu skills admin client', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('lists the uploaded skills with their grants through an authorized GET', async () => {
		const calls = stubFetch(() => json(adminListing));
		await expect(getAdminSkills(TOKEN)).resolves.toEqual(adminListing);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('/api/v1/ocu/skills/admin');
		expect(calls[0].init.method).toBe('GET');
		expect(new Headers(calls[0].init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
		expect(calls[0].init.body).toBeUndefined();
	});

	it('uploads the raw ZIP bytes as the request body, not multipart', async () => {
		const calls = stubFetch(() => json(uploaded));
		const zip = new Blob(['PK\u0003\u0004'], { type: 'application/zip' });
		await expect(uploadSkill(TOKEN, zip)).resolves.toEqual(uploaded);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('/api/v1/ocu/skills/upload');
		expect(calls[0].init.method).toBe('POST');
		const headers = new Headers(calls[0].init.headers);
		expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
		expect(headers.get('Content-Type')).toBe('application/zip');
		expect(calls[0].init.body).toBe(zip);
	});

	it('replaces the read grants with three-key entries, dropping an AccessControl id', async () => {
		const updated = { ...adminListing[0], access_grants: [] };
		const calls = stubFetch(() => json(updated));
		const grants: (OcuSkillGrant & { id?: string })[] = [
			{ id: 'grant-1', principal_type: 'group', principal_id: 'team-a', permission: 'read' },
			{ principal_type: 'user', principal_id: 'user-7', permission: 'read' }
		];
		await expect(updateSkillAccess(TOKEN, 'a b/c', grants)).resolves.toEqual(updated);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('/api/v1/ocu/skills/a%20b%2Fc/access');
		expect(calls[0].init.method).toBe('POST');
		const headers = new Headers(calls[0].init.headers);
		expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
		expect(headers.get('Content-Type')).toBe('application/json');
		expect(calls[0].init.body).toBe(
			'{"access_grants":[' +
				'{"principal_type":"group","principal_id":"team-a","permission":"read"},' +
				'{"principal_type":"user","principal_id":"user-7","permission":"read"}]}'
		);
	});

	it('deletes a skill by its encoded name', async () => {
		const calls = stubFetch(() => json(true));
		await expect(deleteSkill(TOKEN, 'a b/c')).resolves.toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('/api/v1/ocu/skills/a%20b%2Fc');
		expect(calls[0].init.method).toBe('DELETE');
		expect(new Headers(calls[0].init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
		expect(calls[0].init.body).toBeUndefined();
	});

	it.each(routes)('%s surfaces the server reason of a string detail', async (_name, call) => {
		stubFetch(() => json({ detail: 'SKILL.md is missing' }, 400));
		await expect(call()).rejects.toThrow(new Error('SKILL.md is missing'));
	});

	it.each(routes)('%s reports the status for a list detail (422)', async (_name, call) => {
		stubFetch(() => json({ detail: [{ loc: ['body'], msg: 'field required' }] }, 422));
		await expect(call()).rejects.toThrow(new Error('HTTP 422'));
	});

	it.each(routes)('%s reports the status for a non-JSON error body', async (_name, call) => {
		stubFetch(() => new Response('<html>Bad Gateway</html>', { status: 502 }));
		await expect(call()).rejects.toThrow(new Error('HTTP 502'));
	});

	it('keeps the size and conflict reasons verbatim', async () => {
		stubFetch(() => json({ detail: 'skill ZIP exceeds 50 MB' }, 413));
		await expect(uploadSkill(TOKEN, new Blob(['x']))).rejects.toThrow('skill ZIP exceeds 50 MB');
		stubFetch(() => json({ detail: "skill 'invoice-builder' already exists" }, 409));
		await expect(uploadSkill(TOKEN, new Blob(['x']))).rejects.toThrow(
			"skill 'invoice-builder' already exists"
		);
	});
});
