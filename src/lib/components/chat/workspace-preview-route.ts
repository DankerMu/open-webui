import type { WorkspaceFile } from '$lib/apis/ocu';
import { mimeEssence, servable } from './workspace-file-rows';

const OFFICE_TYPES = new Set(['docx', 'xlsx', 'pptx']);
// Generated documents run only in the opaque iframe; the same list is refused by the trusted frame.
const GENERATED_MIMES = new Set([
	'text/html',
	'image/svg+xml',
	'application/xhtml+xml',
	'application/xml',
	'text/xml'
]);
const IMAGE_MIMES = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/bmp',
	'image/x-ms-bmp'
]);
// Mirrors OCU `embeddedFileDisposition` (preview.js), which answers `unsupported` for anything else.
const EMBEDDED_TYPES = new Set(['markdown', 'code', 'text', 'spreadsheet', 'audio', 'video']);

const embeddable = (type: string, mime: string) =>
	EMBEDDED_TYPES.has(type) && !!mime && !GENERATED_MIMES.has(mime) && !mime.endsWith('+xml');

// One route per selected file, decided by broker type and MIME essence, never by name or display kind.
export function workspacePreviewRoute(file: WorkspaceFile, editorActive = false) {
	if (editorActive) return 'editor';
	if (!servable(file)) return 'download';
	if (OFFICE_TYPES.has(file.type)) return 'office';
	const mime = mimeEssence(file);
	if (GENERATED_MIMES.has(mime)) return 'generated';
	if (IMAGE_MIMES.has(mime)) return 'image';
	if (mime === 'application/pdf') return 'pdf';
	return embeddable(file.type, mime) ? 'embedded' : 'download';
}
