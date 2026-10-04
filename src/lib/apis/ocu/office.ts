import { WorkspaceRequestError } from './index';

export type OfficeSessionState =
	| 'opening'
	| 'editing'
	| 'saving'
	| 'closing'
	| 'closed'
	| 'conflict'
	| 'error'
	| 'orphaned';

export type OfficeSavedAs = {
	file_id: string;
	path: string;
};

export type OfficeSessionStatus = {
	session_id: string;
	file_id: string;
	document_key: string;
	state: OfficeSessionState;
	reason: string | null;
	save_seq: number;
	last_committed_seq: number;
	last_published_seq: number;
	workspace_changed: boolean;
	saved_as: OfficeSavedAs | null;
};

export type OfficeOpenSession = {
	session_id: string;
	state: OfficeSessionState;
	reason: string | null;
	editor_ended: boolean;
};

export type OfficeVersion = {
	number: number;
	parent: number | null;
	source: 'workspace' | 'save' | 'autosave' | 'close' | 'restore' | 'conflict';
	sha256: string;
	size: number;
	created_at: string;
	published: boolean;
};

export type OfficeVersions = {
	file_id: string;
	published_version: number | null;
	open_session: OfficeOpenSession | null;
	versions: OfficeVersion[];
};

export type OfficeRestoreResult = {
	file_id: string;
	number: number;
	published: boolean;
};

export type OfficeResolveAction = 'save_as' | 'overwrite';

export type OfficeResolveResult = {
	session_id: string;
	state: OfficeSessionState;
	file_id: string;
	path: string;
};

const officeBase = (baseUrl: string): string => {
	if (baseUrl !== '/ocu') throw new WorkspaceRequestError(0, 'invalid_response');
	return baseUrl;
};

const failureReason = (body: unknown): string => {
	const reason =
		body !== null && typeof body === 'object' && 'reason' in body ? body.reason : undefined;
	return typeof reason === 'string' ? reason : 'request_failed';
};

const requestOffice = async (
	baseUrl: string,
	method: 'GET' | 'POST',
	path: string,
	body?: object
) => {
	const url = `${officeBase(baseUrl)}${path}`;
	let response: Response;
	try {
		response = await fetch(url, {
			method,
			credentials: 'same-origin',
			cache: 'no-store',
			...(body !== undefined
				? {
						headers: {
							'Content-Type': 'application/json',
							'X-Requested-With': 'ocu-workspace'
						},
						body: JSON.stringify(body)
					}
				: {})
		});
	} catch {
		throw new WorkspaceRequestError(0, 'request_failed');
	}

	if (!response.ok) {
		let failure: unknown;
		try {
			failure = await response.json();
		} catch {
			// Non-JSON or empty error bodies contain no trusted reason.
		}
		throw new WorkspaceRequestError(response.status, failureReason(failure));
	}

	try {
		return await response.json();
	} catch {
		throw new WorkspaceRequestError(response.status, 'invalid_response');
	}
};

export const getOfficeSessionStatus = (
	baseUrl: string,
	chatId: string,
	sessionId: string
): Promise<OfficeSessionStatus> =>
	requestOffice(
		baseUrl,
		'GET',
		`/api/office/${encodeURIComponent(chatId)}/sessions/${encodeURIComponent(sessionId)}`
	);

export const listOfficeVersions = (
	baseUrl: string,
	chatId: string,
	fileId: string
): Promise<OfficeVersions> =>
	requestOffice(
		baseUrl,
		'GET',
		`/api/office/${encodeURIComponent(chatId)}/documents/${encodeURIComponent(fileId)}/versions`
	);

export const restoreOfficeVersion = (
	baseUrl: string,
	chatId: string,
	fileId: string,
	number: number
): Promise<OfficeRestoreResult> =>
	requestOffice(
		baseUrl,
		'POST',
		`/api/office/${encodeURIComponent(chatId)}/documents/${encodeURIComponent(fileId)}/restore`,
		{ number }
	);

export const resolveOfficeConflict = (
	baseUrl: string,
	chatId: string,
	sessionId: string,
	action: OfficeResolveAction
): Promise<OfficeResolveResult> =>
	requestOffice(
		baseUrl,
		'POST',
		`/api/office/${encodeURIComponent(chatId)}/sessions/${encodeURIComponent(sessionId)}/resolve`,
		{ action }
	);
