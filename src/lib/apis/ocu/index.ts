import { WEBUI_API_BASE_URL } from '$lib/constants';

export type WorkspacePrefs = {
	view?: 'files' | 'browser' | 'terminal';
	selected_file_id?: string;
	open?: boolean;
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
