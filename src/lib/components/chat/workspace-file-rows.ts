import type { WorkspaceFile } from '$lib/apis/ocu';

export type WorkspaceFileRow =
	| { kind: 'folder'; path: string; count: number }
	| { kind: 'file'; file: WorkspaceFile; name: string; nested: boolean };

type FileRow = Extract<WorkspaceFileRow, { kind: 'file' }>;
type WorkspaceFileKind = 'web' | 'image' | 'document' | 'sheet' | 'slides' | 'code' | 'other';

export function buildWorkspaceFileRows(files: readonly WorkspaceFile[]): WorkspaceFileRow[] {
	const folders = new Map<string, FileRow[]>();
	const roots: FileRow[] = [];
	for (const file of files) {
		// Display normalization only; original paths and file identities remain untouched.
		const segments = file.path.split('/').filter(Boolean);
		const name = segments.pop() ?? file.name;
		const path = segments.join('/');
		const row: FileRow = { kind: 'file', file, name, nested: path !== '' };
		if (path) {
			let group = folders.get(path);
			if (!group) {
				group = [];
				folders.set(path, group);
			}
			group.push(row);
		} else {
			roots.push(row);
		}
	}
	const byName = (a: FileRow, b: FileRow) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	const rows: WorkspaceFileRow[] = [];
	for (const path of [...folders.keys()].sort()) {
		const group = folders.get(path)!;
		rows.push({ kind: 'folder', path, count: group.length }, ...group.sort(byName));
	}
	rows.push(...roots.sort(byName));
	return rows;
}

const typeKinds: Record<string, WorkspaceFileKind> = {
	html: 'web',
	svg: 'web',
	xml: 'web',
	image: 'image',
	docx: 'document',
	pdf: 'document',
	text: 'document',
	markdown: 'document',
	xlsx: 'sheet',
	csv: 'sheet',
	pptx: 'slides',
	json: 'code',
	code: 'code'
};

const mimeKinds: Record<string, WorkspaceFileKind> = {
	'text/html': 'web',
	'image/svg+xml': 'web',
	'application/xhtml+xml': 'web',
	'application/xml': 'web',
	'text/xml': 'web',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
	'application/pdf': 'document',
	'text/plain': 'document',
	'text/markdown': 'document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
	'text/csv': 'sheet',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
	'application/json': 'code',
	'text/javascript': 'code',
	'application/javascript': 'code',
	'text/x-python': 'code',
	'application/x-sh': 'code',
	'text/x-c': 'code'
};

// Recognized MIME wins over broker type; display kinds never grant preview/edit eligibility.
export function workspaceFileKind(file: WorkspaceFile): WorkspaceFileKind {
	const mime = file.mime.split(';', 1)[0].trim().toLowerCase();
	if (Object.hasOwn(mimeKinds, mime)) return mimeKinds[mime];
	if (mime.startsWith('image/')) return 'image';
	const type = file.type.toLowerCase();
	return Object.hasOwn(typeKinds, type) ? typeKinds[type] : 'other';
}
