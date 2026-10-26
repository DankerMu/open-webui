import type { WorkspaceFile } from '$lib/apis/ocu';

export type WorkspaceFileRow =
	| { kind: 'folder'; path: string; name: string; depth: number }
	| { kind: 'file'; file: WorkspaceFile; name: string; depth: number; parent: string };

type FileRow = Extract<WorkspaceFileRow, { kind: 'file' }>;
type WorkspaceFileKind = 'web' | 'image' | 'document' | 'sheet' | 'slides' | 'code' | 'other';
// Map keys, not object keys: `constructor`/`__proto__` folder names must stay ordinary.
type Directory = { folders: Map<string, Directory>; files: FileRow[] };

// Code-unit order; host locale must not change the tree.
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildWorkspaceFileRows(files: readonly WorkspaceFile[]): WorkspaceFileRow[] {
	const root: Directory = { folders: new Map(), files: [] };
	for (const file of files) {
		// Display normalization only; original paths and file identities remain untouched.
		const segments = file.path.split('/').filter(Boolean);
		const name = segments.pop() ?? file.name;
		let directory = root;
		for (const segment of segments) {
			let child = directory.folders.get(segment);
			if (!child) {
				child = { folders: new Map(), files: [] };
				directory.folders.set(segment, child);
			}
			directory = child;
		}
		const parent = segments.join('/');
		directory.files.push({ kind: 'file', file, name, depth: segments.length, parent });
	}
	const rows: WorkspaceFileRow[] = [];
	const walk = (directory: Directory, prefix: string, depth: number) => {
		for (const name of [...directory.folders.keys()].sort(byCodeUnit)) {
			const path = prefix ? `${prefix}/${name}` : name;
			rows.push({ kind: 'folder', path, name, depth });
			walk(directory.folders.get(name)!, path, depth + 1);
		}
		rows.push(...directory.files.sort((a, b) => byCodeUnit(a.name, b.name)));
	};
	walk(root, '', 0);
	return rows;
}

// True when a proper ancestor folder (whole path segments) of the row is collapsed.
export function hiddenByCollapse(row: WorkspaceFileRow, collapsed: ReadonlySet<string>): boolean {
	const directory = row.kind === 'folder' ? row.path : row.parent;
	const segments = directory ? directory.split('/') : [];
	if (row.kind === 'folder') segments.pop();
	let prefix = '';
	for (const segment of segments) {
		prefix = prefix ? `${prefix}/${segment}` : segment;
		if (collapsed.has(prefix)) return true;
	}
	return false;
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
	spreadsheet: 'sheet',
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
	'text/tab-separated-values': 'sheet',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
	'application/json': 'code',
	'text/javascript': 'code',
	'application/javascript': 'code',
	'text/x-python': 'code',
	'application/x-sh': 'code',
	'text/x-c': 'code'
};

// OCU serves neither a too-large file's preview nor any URL for an unsupported name.
export function servable(file: WorkspaceFile): boolean {
	return !file.too_large && !file.unsupported_name;
}

// Recognized MIME wins over broker type; display kinds never grant preview/edit eligibility.
export function workspaceFileKind(file: WorkspaceFile): WorkspaceFileKind {
	const mime = file.mime.split(';', 1)[0].trim().toLowerCase();
	if (Object.hasOwn(mimeKinds, mime)) return mimeKinds[mime];
	if (mime.startsWith('image/')) return 'image';
	const type = file.type.toLowerCase();
	return Object.hasOwn(typeKinds, type) ? typeKinds[type] : 'other';
}
