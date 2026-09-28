import { WEBUI_API_BASE_URL } from '$lib/constants';

export type WorkspacePrefs = {
	view?: 'files' | 'browser' | 'terminal';
	selected_file_id?: string | null;
	open?: boolean;
};

export type WorkspaceFile = {
	file_id: string;
	path: string;
	name: string;
	url: string;
	type: string;
	mime: string;
	revision: number;
	size: number;
};

export type WorkspaceListing = {
	chat_id: string;
	revision: number;
	files: WorkspaceFile[];
	next_cursor: string | null;
	total: number;
};

// This flag is served only in the authenticated config payload.
export const workspaceFilesEnabled = (config: unknown): boolean =>
	typeof config === 'object' &&
	config !== null &&
	'features' in config &&
	typeof config.features === 'object' &&
	config.features !== null &&
	'enable_ocu_workspace' in config.features &&
	config.features.enable_ocu_workspace === true;

const workspaceBase = (baseUrl: string): string => {
	if (baseUrl !== '/ocu') throw new WorkspaceRequestError(0, 'invalid_response');
	return baseUrl;
};

export const workspaceRuntimeUrl = (
	baseUrl: string,
	chatId: string,
	view: 'browser' | 'terminal'
): string => `${workspaceBase(baseUrl)}/preview/${encodeURIComponent(chatId)}?embed=${view}`;

export const workspaceFileUrl = (baseUrl: string, chatId: string, file: WorkspaceFile): string => {
	const base = `${workspaceBase(baseUrl)}/files/${encodeURIComponent(chatId)}/`;
	if (
		typeof file.path !== 'string' ||
		!file.path ||
		file.path
			.split('/')
			.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))
	) {
		throw new WorkspaceRequestError(0, 'invalid_response');
	}
	const path = file.path
		.split('/')
		.map((segment) =>
			encodeURIComponent(segment).replace(
				/[!'()*]/g,
				(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
			)
		)
		.join('/');
	const expected = base + path;
	if (file.url !== expected) throw new WorkspaceRequestError(0, 'invalid_response');
	return expected;
};

const validListingEnvelope = (body: WorkspaceListing, chatId: string): boolean =>
	body?.chat_id === chatId &&
	Number.isSafeInteger(body.revision) &&
	body.revision >= 0 &&
	Array.isArray(body.files) &&
	(body.next_cursor === null ||
		(typeof body.next_cursor === 'string' && body.next_cursor.length > 0)) &&
	Number.isSafeInteger(body.total) &&
	body.total >= 0;

const validWorkspaceFile = (file: WorkspaceFile): boolean =>
	!!file &&
	typeof file.file_id === 'string' &&
	!!file.file_id &&
	Number.isSafeInteger(file.revision) &&
	file.revision >= 0 &&
	typeof file.name === 'string' &&
	typeof file.type === 'string' &&
	typeof file.mime === 'string' &&
	Number.isSafeInteger(file.size) &&
	file.size >= 0;

export const listWorkspaceFiles = async (
	baseUrl: string,
	chatId: string,
	cursor?: string
): Promise<WorkspaceListing> => {
	const url = `${workspaceBase(baseUrl)}/api/outputs/${encodeURIComponent(chatId)}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`;
	let response: Response;
	try {
		response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
	} catch {
		throw new WorkspaceRequestError(0, 'request_failed');
	}
	if (!response.ok) throw new WorkspaceRequestError(response.status, 'request_failed');
	let body: WorkspaceListing;
	try {
		body = await response.json();
	} catch {
		throw new WorkspaceRequestError(response.status, 'invalid_response');
	}
	if (!validListingEnvelope(body, chatId))
		throw new WorkspaceRequestError(response.status, 'invalid_response');
	for (const file of body.files) {
		if (!validWorkspaceFile(file))
			throw new WorkspaceRequestError(response.status, 'invalid_response');
		workspaceFileUrl(baseUrl, chatId, file);
	}
	return body;
};

export class WorkspaceRequestError extends Error {
	constructor(
		readonly status: number,
		readonly reason: string
	) {
		super(reason);
		this.name = 'WorkspaceRequestError';
	}
}

const failureReason = (status: number, body: unknown): string => {
	if (status === 401) return 'unauthorized';
	if (status === 403) return 'forbidden';
	if (status === 404) return 'not_found';

	const reason =
		body !== null && typeof body === 'object' && 'reason' in body ? body.reason : undefined;
	return reason === 'never_created' ||
		reason === 'ocu_upstream_error' ||
		reason === 'ocu_unreachable'
		? reason
		: 'request_failed';
};

const requestWorkspace = async (
	token: string,
	chatId: string,
	method: string,
	suffix = '',
	body?: object
) => {
	let response: Response;
	try {
		response = await fetch(`${WEBUI_API_BASE_URL}/ocu/workspaces/${chatId}${suffix}`, {
			method,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				'X-Requested-With': 'ocu-workspace'
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {})
		});
	} catch {
		throw new WorkspaceRequestError(0, 'request_failed');
	}

	if (!response.ok) {
		if (response.status === 401 || response.status === 403 || response.status === 404) {
			throw new WorkspaceRequestError(response.status, failureReason(response.status, undefined));
		}
		let failure: unknown;
		try {
			failure = await response.json();
		} catch {
			// Non-JSON or empty error bodies contain no trusted reason.
		}
		throw new WorkspaceRequestError(response.status, failureReason(response.status, failure));
	}

	try {
		return await response.json();
	} catch {
		throw new WorkspaceRequestError(response.status, 'invalid_response');
	}
};

export const getWorkspace = (token: string, chatId: string) =>
	requestWorkspace(token, chatId, 'GET');

export const launchWorkspace = (token: string, chatId: string) =>
	requestWorkspace(token, chatId, 'POST', '/launch');

export const refreshWorkspace = (token: string, chatId: string) =>
	requestWorkspace(token, chatId, 'POST', '/refresh');

export const putWorkspacePrefs = (token: string, chatId: string, prefs: WorkspacePrefs) =>
	requestWorkspace(token, chatId, 'PUT', '/prefs', prefs);
