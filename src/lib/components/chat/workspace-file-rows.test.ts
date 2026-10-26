import { describe, expect, it } from 'vitest';
import type { WorkspaceFile } from '$lib/apis/ocu';
import {
	buildWorkspaceFileRows,
	hiddenByCollapse,
	servable,
	workspaceFileKind,
	type WorkspaceFileRow
} from './workspace-file-rows';

const file = (path: string, name = 'broker name', fileId = path): WorkspaceFile =>
	Object.freeze({
		file_id: fileId,
		path,
		name,
		type: '',
		mime: '',
		url: '',
		revision: 1,
		size: 10
	});

type Row = WorkspaceFileRow;
const folder = (path: string): Row => {
	const segments = path.split('/');
	return { kind: 'folder', path, name: segments.at(-1)!, depth: segments.length - 1 };
};
const fileRow = (source: WorkspaceFile, name: string, parent = ''): Row => ({
	kind: 'file',
	file: source,
	name,
	depth: parent ? parent.split('/').length : 0,
	parent
});

describe('loaded workspace file rows', () => {
	it('returns no rows for no loaded files', () => {
		expect(buildWorkspaceFileRows([])).toEqual([]);
	});

	it('lists root-only files as depth-zero rows ordered by code unit', () => {
		const lower = file('a.txt');
		const upper = file('Z.txt');
		const fallback = file('', 'empty-path.txt', 'empty');
		const input = Object.freeze([fallback, lower, upper]);
		expect(buildWorkspaceFileRows(input)).toEqual([
			fileRow(upper, 'Z.txt'),
			fileRow(lower, 'a.txt'),
			fileRow(fallback, 'empty-path.txt')
		]);
		expect(input).toEqual([fallback, lower, upper]);
	});

	it('builds one folder row per segment of a three-level path', () => {
		const deep = file('packages/core/src/index.py');
		expect(buildWorkspaceFileRows([deep])).toEqual([
			{ kind: 'folder', path: 'packages', name: 'packages', depth: 0 },
			{ kind: 'folder', path: 'packages/core', name: 'core', depth: 1 },
			{ kind: 'folder', path: 'packages/core/src', name: 'src', depth: 2 },
			{ kind: 'file', file: deep, name: 'index.py', depth: 3, parent: 'packages/core/src' }
		]);
	});

	it('puts folders before files at every level, roots after root folders', () => {
		const deep = file('packages/core/src/index.ts', 'ignored', 'deep');
		const shallow = file('packages/readme.md', 'ignored', 'shallow');
		const sibling = file('packages/core/a.ts', 'ignored', 'sibling');
		const other = file('docs/index.ts', 'ignored', 'other');
		const root = file('index.ts', 'ignored', 'root');
		const input = Object.freeze([root, shallow, deep, sibling, other]);
		expect(buildWorkspaceFileRows(input)).toEqual([
			folder('docs'),
			fileRow(other, 'index.ts', 'docs'),
			folder('packages'),
			folder('packages/core'),
			folder('packages/core/src'),
			fileRow(deep, 'index.ts', 'packages/core/src'),
			fileRow(sibling, 'a.ts', 'packages/core'),
			fileRow(shallow, 'readme.md', 'packages'),
			fileRow(root, 'index.ts')
		]);
		expect(input).toEqual([root, shallow, deep, sibling, other]);
	});

	it('orders folder and file names by code unit, uppercase first, independent of locale', () => {
		const z = file('b/z.txt');
		const a = file('b/a.txt');
		const upper = file('b/B.txt');
		const accented = file('b/\u00e9.txt');
		const input = [z, accented, a, upper, file('a/x.txt'), file('B/x.txt'), file('_/x.txt')];
		const rows = buildWorkspaceFileRows(input);
		expect(rows.map((row) => (row.kind === 'folder' ? `${row.path}/` : row.file.path))).toEqual([
			'B/',
			'B/x.txt',
			'_/',
			'_/x.txt',
			'a/',
			'a/x.txt',
			'b/',
			'b/B.txt',
			'b/a.txt',
			'b/z.txt',
			'b/\u00e9.txt'
		]);
	});

	it('keeps same basenames in separate folders with their own identities and parents', () => {
		const z = file('reports/z.txt');
		const a = file('reports/a.txt');
		const twin = file('archive/a.txt');
		const input = Object.freeze([z, a, twin]);
		const expected: Row[] = [
			folder('archive'),
			fileRow(twin, 'a.txt', 'archive'),
			folder('reports'),
			fileRow(a, 'a.txt', 'reports'),
			fileRow(z, 'z.txt', 'reports')
		];
		const rows = buildWorkspaceFileRows(input);
		expect(rows).toEqual(expected);
		expect(buildWorkspaceFileRows(input)).toEqual(expected);
		expect(rows[1].kind === 'file' && rows[1].file).toBe(twin);
		expect(rows[3].kind === 'file' && rows[3].file).toBe(a);
		expect(rows[4].kind === 'file' && rows[4].file).toBe(z);
		expect(rows.some((row) => 'count' in row)).toBe(false);
		expect(input).toEqual([z, a, twin]);
	});

	it('drops empty segments from leading or doubled slashes and keeps case-distinct folders', () => {
		const lower = file('/a//reports/z.txt');
		const upper = file('//Z/reports/a.txt');
		const distinct = file('A/reports/a.txt');
		const same = file('a/reports/a.txt');
		const root = file('/root.txt');
		const rows = buildWorkspaceFileRows([lower, upper, root, distinct, same]);
		expect(rows).toEqual([
			folder('A'),
			folder('A/reports'),
			fileRow(distinct, 'a.txt', 'A/reports'),
			folder('Z'),
			folder('Z/reports'),
			fileRow(upper, 'a.txt', 'Z/reports'),
			folder('a'),
			folder('a/reports'),
			fileRow(same, 'a.txt', 'a/reports'),
			fileRow(lower, 'z.txt', 'a/reports'),
			fileRow(root, 'root.txt')
		]);
		expect(rows.every((row) => row.kind === 'file' || !row.path.split('/').includes(''))).toBe(
			true
		);
		expect(lower.path).toBe('/a//reports/z.txt');
	});

	it('retains loaded identities, names and parents when another page changes ordering', () => {
		const earlier = file('reports/z.txt');
		const root = file('root.txt');
		const first = Object.freeze([earlier, root]);
		expect(buildWorkspaceFileRows(first)).toEqual([
			folder('reports'),
			fileRow(earlier, 'z.txt', 'reports'),
			fileRow(root, 'root.txt')
		]);
		const added = file('reports/a.txt');
		const newFolder = file('archive/old/log.txt');
		const rows = buildWorkspaceFileRows([...first, added, newFolder]);
		expect(rows).toEqual([
			folder('archive'),
			folder('archive/old'),
			fileRow(newFolder, 'log.txt', 'archive/old'),
			folder('reports'),
			fileRow(added, 'a.txt', 'reports'),
			fileRow(earlier, 'z.txt', 'reports'),
			fileRow(root, 'root.txt')
		]);
		expect(rows.filter((row) => row.kind === 'folder' && row.path === 'reports')).toHaveLength(1);
		for (const original of first) {
			const row = rows.find((row) => row.kind === 'file' && row.file.file_id === original.file_id);
			expect(row?.kind === 'file' && row.file).toBe(original);
		}
	});
});

describe('collapse by ancestry', () => {
	const rows = buildWorkspaceFileRows([
		file('a/b/c/deep.txt'),
		file('a/b/mid.txt'),
		file('a/top.txt'),
		file('ab/sibling.txt'),
		file('root.txt')
	]);
	const visible = (collapsed: string[]) =>
		rows
			.filter((row) => !hiddenByCollapse(row, new Set(collapsed)))
			.map((row) => (row.kind === 'folder' ? `${row.path}/` : row.file.path));

	it('hides nothing when no folder is collapsed', () => {
		expect(visible([])).toEqual([
			'a/',
			'a/b/',
			'a/b/c/',
			'a/b/c/deep.txt',
			'a/b/mid.txt',
			'a/top.txt',
			'ab/',
			'ab/sibling.txt',
			'root.txt'
		]);
	});

	it('hides every deeper folder and file under a collapsed intermediate folder', () => {
		expect(visible(['a/b'])).toEqual([
			'a/',
			'a/b/',
			'a/top.txt',
			'ab/',
			'ab/sibling.txt',
			'root.txt'
		]);
	});

	it('hides all descendants of a collapsed top folder but not a sibling it prefixes', () => {
		expect(visible(['a'])).toEqual(['a/', 'ab/', 'ab/sibling.txt', 'root.txt']);
	});

	it('keeps the collapsed row itself visible and ignores unrelated or partial paths', () => {
		expect(visible(['a/b/c', 'a/b/c/deep.txt', 'b', 'a/'])).toEqual([
			'a/',
			'a/b/',
			'a/b/c/',
			'a/b/mid.txt',
			'a/top.txt',
			'ab/',
			'ab/sibling.txt',
			'root.txt'
		]);
	});
});

describe('workspace display kinds', () => {
	it('classifies broker TSV metadata as sheet despite a document filename', () => {
		const tsv = {
			...file('reports/summary.txt', 'summary.txt'),
			type: 'spreadsheet',
			mime: 'text/tab-separated-values'
		};
		expect(workspaceFileKind(tsv)).toBe('sheet');
	});

	it.each([
		['HTML', 'web'],
		['svg', 'web'],
		['xml', 'web'],
		['image', 'image'],
		['DOCX', 'document'],
		['pdf', 'document'],
		['text', 'document'],
		['markdown', 'document'],
		['XLSX', 'sheet'],
		['csv', 'sheet'],
		['SPREADSHEET', 'sheet'],
		['PPTX', 'slides'],
		['json', 'code'],
		['code', 'code'],
		['', 'other'],
		['unknown', 'other'],
		['constructor', 'other']
	])('classifies broker type %s as %s', (type, expected) => {
		expect(workspaceFileKind({ ...file('misleading.html'), type })).toBe(expected);
	});

	it.each([
		['text/html; charset=utf-8', 'web'],
		['IMAGE/SVG+XML', 'web'],
		['application/xhtml+xml', 'web'],
		['application/xml', 'web'],
		['text/xml', 'web'],
		['IMAGE/PNG', 'image'],
		['image/jpeg', 'image'],
		['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
		['APPLICATION/PDF', 'document'],
		['text/plain', 'document'],
		['text/markdown', 'document'],
		['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet'],
		['text/csv', 'sheet'],
		[' Text/Tab-Separated-Values ; charset=UTF-8 ', 'sheet'],
		['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'slides'],
		['application/json', 'code'],
		['text/javascript', 'code'],
		['application/javascript', 'code'],
		['text/x-python', 'code'],
		['application/x-sh', 'code'],
		['text/x-c', 'code'],
		['application/octet-stream', 'other'],
		['text/unknown', 'other'],
		['', 'other']
	])('classifies media type %s as %s', (mime, expected) => {
		expect(workspaceFileKind({ ...file('misleading.docx'), mime })).toBe(expected);
	});

	it.each([
		['code', ' Application/XML ; charset=UTF-8 ', 'web'],
		['docx', 'text/html', 'web'],
		['code', 'image/svg+xml', 'web'],
		['html', 'image/png', 'image'],
		['xlsx', 'application/octet-stream', 'sheet'],
		['unknown', 'text/csv', 'sheet'],
		['unknown', 'text/tab-separated-values', 'sheet'],
		['spreadsheet', 'application/octet-stream', 'sheet'],
		['spreadsheet', 'text/plain', 'document'],
		['spreadsheet', 'image/avif', 'image']
	])('prefers recognized MIME, falling back to type: %s / %s', (type, mime, expected) => {
		expect(workspaceFileKind({ ...file('name'), type, mime })).toBe(expected);
	});
});

describe('servable workspace files', () => {
	it.each([
		['an ordinary file', {}, true],
		['explicit false markers', { too_large: false, unsupported_name: false }, true],
		['a too-large file', { too_large: true }, false],
		['an unsupported name', { url: null, unsupported_name: true }, false]
	] as const)('decides servability for %s', (_label, markers, expected) => {
		expect(servable({ ...file('name'), ...markers })).toBe(expected);
	});
});
