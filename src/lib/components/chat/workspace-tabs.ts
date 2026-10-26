import type { WorkspaceFile } from '$lib/apis/ocu';

// Opened-file tabs are panel-lifetime display state keyed by file_id; the active tab is the
// persisted selection. Unchanged inputs return the same array so reactive rules settle.

export function withTab(ids: string[], id: string): string[] {
	return ids.includes(id) ? ids : [...ids, id];
}

export function pruneTabs(ids: string[], files: WorkspaceFile[]): string[] {
	const listed = new Set(files.map((file) => file.file_id));
	const kept = ids.filter((id) => listed.has(id));
	return kept.length === ids.length ? ids : kept;
}

export function tabAfterClose(ids: string[], id: string): string | undefined {
	const index = ids.indexOf(id);
	if (index < 0) return undefined;
	return ids[index + 1] ?? ids[index - 1];
}
