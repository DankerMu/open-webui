import { writable } from 'svelte/store';
import type { WorkspaceFile } from '$lib/apis/ocu';

export const chat = 'owner-chat';
export const url = `/ocu/files/${chat}/`;
export const i18n = writable({
	t: (key: string, params?: Record<string, string>) =>
		key.replace(/\{\{(\w+)\}\}/g, (_match, name) => params?.[name] ?? name)
});
export const file = (name: string, id = name, revision = 1): WorkspaceFile => ({
	file_id: id,
	path: name,
	name,
	url: url + name,
	type: name.endsWith('.docx') ? 'docx' : 'html',
	mime: name.endsWith('.docx')
		? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		: 'text/html',
	revision,
	size: 10
});
export const describeBody = {
	chat_id: chat,
	status: 'running',
	reason: null,
	capabilities: ['refresh', 'prefs'],
	views: ['files'],
	base_url: '/ocu',
	revision: 1,
	prefs: {}
};
export const listing = (
	files: WorkspaceFile[],
	next_cursor: string | null = null,
	revision = 1,
	total = files.length + (next_cursor ? 1 : 0)
) => ({ chat_id: chat, revision, files, total, next_cursor });
export const json = (value: object, status = 200) =>
	new Response(JSON.stringify(value), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
