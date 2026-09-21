import { WEBUI_API_BASE_URL } from '$lib/constants';

export type WorkspacePrefs = {
	view?: 'files' | 'browser' | 'terminal';
	selected_file_id?: string;
	open?: boolean;
};

const requestWorkspace = async (
	token: string,
	chatId: string,
	method: string,
	suffix = '',
	body?: object
) => {
	let error = null;

	const res = await fetch(
		`${WEBUI_API_BASE_URL}/ocu/workspaces/${chatId}${suffix}`,
		{
			method,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				authorization: `Bearer ${token}`,
				'X-Requested-With': 'ocu-workspace'
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {})
		}
	)
		.then(async (response) => {
			if (!response.ok) throw await response.json();
			return response.json();
		})
		.catch((err) => {
			error = err.detail;
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getWorkspace = (token: string, chatId: string) =>
	requestWorkspace(token, chatId, 'GET');

export const launchWorkspace = (token: string, chatId: string) =>
	requestWorkspace(token, chatId, 'POST', '/launch');

export const refreshWorkspace = (token: string, chatId: string) =>
	requestWorkspace(token, chatId, 'POST', '/refresh');

export const putWorkspacePrefs = (token: string, chatId: string, prefs: WorkspacePrefs) =>
	requestWorkspace(token, chatId, 'PUT', '/prefs', prefs);
