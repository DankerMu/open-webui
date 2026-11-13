import { WEBUI_API_BASE_URL } from '$lib/constants';

// The shape GET /admin returns and POST /{name}/access accepts (read-only, never "anyone");
// AccessControl adds an optional id.
export type OcuSkillGrant = {
	principal_type: 'user' | 'group';
	principal_id: string;
	permission: 'read';
};

export type OcuAdminSkill = {
	name: string;
	description: string;
	// The administrator's label; null shows the English name.
	display_name: string | null;
	zip_sha256: string;
	size: number;
	created_by: string;
	updated_at: number;
	access_grants: OcuSkillGrant[];
};

// The shape GET / and POST /{name}/toggle return: a readable skill and the caller's switch.
export type OcuUserSkill = Pick<OcuAdminSkill, 'name' | 'description' | 'display_name'> & {
	enabled: boolean;
};

type OcuUploadedSkill = Pick<OcuAdminSkill, 'name' | 'description' | 'zip_sha256' | 'size'>;

const requestSkills = async (
	token: string,
	method: 'GET' | 'POST' | 'DELETE',
	path: string,
	body?: { type: string; data: BodyInit }
) => {
	const response = await fetch(`${WEBUI_API_BASE_URL}/ocu/skills${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			...(body ? { 'Content-Type': body.type } : {})
		},
		...(body ? { body: body.data } : {})
	});
	if (!response.ok) {
		let detail: unknown;
		try {
			detail = (await response.json())?.detail;
		} catch {
			// A non-JSON error body (a proxy page, an empty reply) carries no server reason.
		}
		// A string detail is the server's reason (400, 409, 413); a validation list (422) is not.
		throw new Error(typeof detail === 'string' ? detail : `HTTP ${response.status}`);
	}
	return response.json();
};

export const getAdminSkills = (token: string): Promise<OcuAdminSkill[]> =>
	requestSkills(token, 'GET', '/admin');

// The route reads the raw request stream with a running size cap, so the body is the ZIP itself.
export const uploadSkill = (token: string, file: Blob): Promise<OcuUploadedSkill> =>
	requestSkills(token, 'POST', '/upload', { type: 'application/zip', data: file });

export const updateSkillAccess = (
	token: string,
	name: string,
	accessGrants: OcuSkillGrant[]
): Promise<OcuAdminSkill> =>
	requestSkills(token, 'POST', `/${encodeURIComponent(name)}/access`, {
		type: 'application/json',
		data: JSON.stringify({
			access_grants: accessGrants.map(({ principal_type, principal_id, permission }) => ({
				principal_type,
				principal_id,
				permission
			}))
		})
	});

// The server trims the value; an empty string or null clears the display name.
export const updateSkillDisplayName = (
	token: string,
	name: string,
	displayName: string | null
): Promise<OcuAdminSkill> =>
	requestSkills(token, 'POST', `/${encodeURIComponent(name)}/display-name`, {
		type: 'application/json',
		data: JSON.stringify({ display_name: displayName })
	});

export const deleteSkill = (token: string, name: string): Promise<boolean> =>
	requestSkills(token, 'DELETE', `/${encodeURIComponent(name)}`);

// The listing route is `/` itself, so the URL keeps its trailing slash.
export const getUserSkills = (token: string): Promise<OcuUserSkill[]> =>
	requestSkills(token, 'GET', '/');

export const toggleSkill = (token: string, name: string, enabled: boolean): Promise<OcuUserSkill> =>
	requestSkills(token, 'POST', `/${encodeURIComponent(name)}/toggle`, {
		type: 'application/json',
		data: JSON.stringify({ enabled })
	});
