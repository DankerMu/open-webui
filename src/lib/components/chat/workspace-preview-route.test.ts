import { describe, expect, it } from 'vitest';
import type { WorkspaceFile } from '$lib/apis/ocu';
import { workspacePreviewRoute } from './workspace-preview-route';

const entry = (name: string, type: string, mime: string): WorkspaceFile =>
	Object.freeze({
		file_id: name,
		path: name,
		name,
		type,
		mime,
		url: `/ocu/files/chat/${name}`,
		revision: 1,
		size: 10
	});

// Broker types and MIME values as OCU `classify_file` reports them (computer-use-server/app.py).
const cases = [
	['photo.png', 'image', 'image/png', 'image'],
	['a.jpg', 'image', 'image/jpeg', 'image'],
	['b.webp', 'image', 'image/webp', 'image'],
	['c.gif', 'image', 'image/gif', 'image'],
	['d.bmp', 'image', 'image/bmp', 'image'],
	['d2.bmp', 'image', 'image/x-ms-bmp', 'image'],
	['e.svg', 'image', 'image/svg+xml', 'generated'],
	['f.drawio', 'code', 'application/xml', 'generated'],
	['n.xml', 'code', 'text/xml', 'generated'],
	['p.html', 'html', 'text/html', 'generated'],
	['p.xhtml', 'other', 'application/xhtml+xml', 'generated'],
	['r.pdf', 'pdf', 'application/pdf', 'pdf'],
	['README.md', 'markdown', 'text/markdown', 'embedded'],
	['a.txt', 'text', 'text/plain', 'embedded'],
	['t.csv', 'spreadsheet', 'text/csv', 'embedded'],
	['x.json', 'code', 'application/json', 'embedded'],
	['m.py', 'code', 'text/x-python', 'embedded'],
	['s.mp3', 'audio', 'audio/mpeg', 'embedded'],
	['v.mp4', 'video', 'video/mp4', 'embedded'],
	[
		'w.docx',
		'docx',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'office'
	],
	['w.xlsx', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'office'],
	[
		'w.pptx',
		'pptx',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'office'
	],
	['feed.atom', 'code', 'application/atom+xml', 'download'],
	['q.bin', 'other', 'application/octet-stream', 'download'],
	['scan.tiff', 'image', 'image/tiff', 'download'],
	['legacy.doc', 'other', 'application/msword', 'download'],
	['empty.txt', 'text', '', 'download']
] as const;

describe('workspace preview route', () => {
	it.each(cases)('%s (%s, %s) routes to %s', (name, type, mime, route) => {
		expect(workspacePreviewRoute(entry(name, type, mime))).toBe(route);
	});

	it.each([
		['IMAGE/PNG', 'image'],
		['image/jpeg; charset=binary', 'image'],
		[' Application/PDF ; foo=bar', 'pdf'],
		['TEXT/HTML; charset=utf-8', 'generated'],
		['Text/Plain; charset=UTF-8', 'embedded'],
		['APPLICATION/ATOM+XML; charset=utf-8', 'download']
	] as const)('normalizes MIME %j to %s', (mime, route) => {
		const type = route === 'embedded' || route === 'download' ? 'code' : 'other';
		expect(workspacePreviewRoute(entry('x', type, mime))).toBe(route);
	});

	// Mismatched broker type and MIME make each precedence step observable.
	it.each([
		['docx', 'image/png', 'office'],
		['xlsx', 'text/html', 'office'],
		['code', 'image/svg+xml', 'generated'],
		['text', 'application/xhtml+xml', 'generated'],
		['code', 'image/png', 'image'],
		['text', 'application/pdf', 'pdf'],
		['markdown', 'text/markdown', 'embedded'],
		['pdf', 'text/plain', 'download'],
		['image', 'text/plain', 'download'],
		['drawio', 'text/plain', 'download'],
		['html', 'text/plain', 'download'],
		['other', 'text/plain', 'download'],
		['TEXT', 'text/plain', 'download']
	] as const)('type %s with %s routes to %s', (type, mime, route) => {
		expect(workspacePreviewRoute(entry('x', type, mime))).toBe(route);
	});

	it.each(cases.filter(([, , , route]) => route !== 'download'))(
		'%s marked too_large or unsupported_name downloads',
		(name, type, mime) => {
			const file = entry(name, type, mime);
			expect(workspacePreviewRoute({ ...file, too_large: true })).toBe('download');
			expect(workspacePreviewRoute({ ...file, unsupported_name: true, url: null })).toBe(
				'download'
			);
			expect(
				workspacePreviewRoute({ ...file, too_large: false, unsupported_name: false })
			).not.toBe('download');
		}
	);

	it('an active editor wins over every route, including a file no longer servable', () => {
		for (const [name, type, mime] of cases) {
			const file = entry(name, type, mime);
			expect(workspacePreviewRoute(file, true)).toBe('editor');
			expect(workspacePreviewRoute({ ...file, too_large: true }, true)).toBe('editor');
		}
	});

	it('never consults the file name', () => {
		expect(workspacePreviewRoute(entry('photo.png', 'other', 'application/octet-stream'))).toBe(
			'download'
		);
		expect(workspacePreviewRoute(entry('notes.bin', 'text', 'text/plain'))).toBe('embedded');
		expect(workspacePreviewRoute(entry('page.html', 'code', 'application/json'))).toBe('embedded');
	});
});
