import { describe, expect, it } from 'vitest';
import type { WorkspaceFile } from '$lib/apis/ocu';
import {
	buildWorkspaceFileRows,
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

describe('loaded workspace file rows', () => {
	it('returns no rows for no loaded files', () => {
		expect(buildWorkspaceFileRows([])).toEqual([]);
	});

	it('orders root display names by code unit without a folder header', () => {
		const lower = file('a.txt');
		const upper = file('Z.txt');
		const fallback = file('', 'empty-path.txt', 'empty');
		const input = Object.freeze([fallback, lower, upper]);
		expect(buildWorkspaceFileRows(input)).toEqual([
			{ kind: 'file', file: upper, name: 'Z.txt', nested: false },
			{ kind: 'file', file: lower, name: 'a.txt', nested: false },
			{ kind: 'file', file: fallback, name: 'empty-path.txt', nested: false }
		]);
		expect(input).toEqual([fallback, lower, upper]);
	});

	it('counts one directory and sorts its files without changing their identities', () => {
		const z = file('reports/z.txt');
		const a = file('reports/a.txt');
		const input = Object.freeze([z, a]);
		const expected: WorkspaceFileRow[] = [
			{ kind: 'folder', path: 'reports', count: 2 },
			{ kind: 'file', file: a, name: 'a.txt', nested: true },
			{ kind: 'file', file: z, name: 'z.txt', nested: true }
		];
		const rows = buildWorkspaceFileRows(input);
		expect(rows).toEqual(expected);
		expect(buildWorkspaceFileRows(input)).toEqual(expected);
		expect(rows[1].kind === 'file' && rows[1].file).toBe(a);
		expect(rows[2].kind === 'file' && rows[2].file).toBe(z);
		expect(input).toEqual([z, a]);
	});

	it('keeps same basenames in separate full-path folders and puts roots last', () => {
		const deep = file('packages/core/src/index.ts', 'ignored', 'deep');
		const other = file('docs/index.ts', 'ignored', 'other');
		const root = file('index.ts', 'ignored', 'root');
		expect(buildWorkspaceFileRows([root, deep, other])).toEqual([
			{ kind: 'folder', path: 'docs', count: 1 },
			{ kind: 'file', file: other, name: 'index.ts', nested: true },
			{ kind: 'folder', path: 'packages/core/src', count: 1 },
			{ kind: 'file', file: deep, name: 'index.ts', nested: true },
			{ kind: 'file', file: root, name: 'index.ts', nested: false }
		]);
	});

	it('normalizes empty path segments for display while preserving directory case', () => {
		const lower = file('/a//reports/z.txt');
		const upper = file('//Z/reports/a.txt');
		const distinct = file('A/reports/a.txt');
		const same = file('a/reports/a.txt');
		const root = file('/root.txt');
		expect(buildWorkspaceFileRows([lower, upper, root, distinct, same])).toEqual([
			{ kind: 'folder', path: 'A/reports', count: 1 },
			{ kind: 'file', file: distinct, name: 'a.txt', nested: true },
			{ kind: 'folder', path: 'Z/reports', count: 1 },
			{ kind: 'file', file: upper, name: 'a.txt', nested: true },
			{ kind: 'folder', path: 'a/reports', count: 2 },
			{ kind: 'file', file: same, name: 'a.txt', nested: true },
			{ kind: 'file', file: lower, name: 'z.txt', nested: true },
			{ kind: 'file', file: root, name: 'root.txt', nested: false }
		]);
		expect(lower.path).toBe('/a//reports/z.txt');
	});

	it('retains loaded identities, names and groups when another page changes ordering', () => {
		const earlier = file('reports/z.txt');
		const root = file('root.txt');
		const first = Object.freeze([earlier, root]);
		expect(buildWorkspaceFileRows(first)).toEqual([
			{ kind: 'folder', path: 'reports', count: 1 },
			{ kind: 'file', file: earlier, name: 'z.txt', nested: true },
			{ kind: 'file', file: root, name: 'root.txt', nested: false }
		]);
		const added = file('reports/a.txt');
		const newFolder = file('archive/old.txt');
		const rows = buildWorkspaceFileRows([...first, added, newFolder]);
		expect(rows).toEqual([
			{ kind: 'folder', path: 'archive', count: 1 },
			{ kind: 'file', file: newFolder, name: 'old.txt', nested: true },
			{ kind: 'folder', path: 'reports', count: 2 },
			{ kind: 'file', file: added, name: 'a.txt', nested: true },
			{ kind: 'file', file: earlier, name: 'z.txt', nested: true },
			{ kind: 'file', file: root, name: 'root.txt', nested: false }
		]);
		for (const original of first) {
			const row = rows.find((row) => row.kind === 'file' && row.file.file_id === original.file_id);
			expect(row?.kind === 'file' && row.file).toBe(original);
		}
	});
});

describe('workspace display kinds', () => {
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
		['unknown', 'text/csv', 'sheet']
	])('prefers recognized MIME, falling back to type: %s / %s', (type, mime, expected) => {
		expect(workspaceFileKind({ ...file('name'), type, mime })).toBe(expected);
	});
});
