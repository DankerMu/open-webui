// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { chat, describeBody, file, url } from '../../../../test/ocu-workspace-fixtures';
import type { WorkspaceFile } from '$lib/apis/ocu';
import { pdfViewers } from '../../../../test/PdfViewerDouble.svelte';
import {
	OfficeArtifactHarness,
	editAction,
	namedButton,
	officeDocx,
	previewFrame
} from './workspace-artifact-office-test';

// A `vi.mock('pdfjs-dist')` does not hold here: vitest 1.6 hands the real module to an
// `import('pdfjs-dist')` that starts while another is in flight, which these tests do by
// remounting the viewer mid-load. The viewer itself is therefore the double.
vi.mock(
	'$lib/components/common/PDFViewer.svelte',
	() => import('../../../../test/PdfViewerDouble.svelte')
);

const harness = new OfficeArtifactHarness();
const FAILURE = 'This file could not be displayed. Download the file to open it.';
const UNSUPPORTED = 'Preview not supported for this file type';

const entry = (name: string, type: string, mime: string, revision = 1): WorkspaceFile => ({
	...file(name, name, revision),
	type,
	mime
});
const photo = entry('photo.png', 'image', 'image/png');
const second = entry('second.jpg', 'image', 'image/jpeg');
const report = entry('r.pdf', 'pdf', 'application/pdf');
const brief = entry('s.pdf', 'pdf', 'application/pdf');
const notes = entry('notes.txt', 'text', 'text/plain');
const readme = entry('README.md', 'markdown', 'text/markdown; charset=utf-8');
const other = entry('other.bin', 'other', 'application/octet-stream');
const serve = (files: WorkspaceFile[], revision = 1) =>
	harness.setListing(files, { ...describeBody, revision }, revision);

async function refresh(files: WorkspaceFile[], revision: number) {
	serve(files, revision);
	await harness.controller.refresh();
	await tick();
}

async function select(name: string) {
	namedButton(name).click();
	await tick();
	await tick();
}

function surface() {
	const node = document.querySelector('[data-selected-preview]');
	expect(node).not.toBeNull();
	return node as HTMLElement;
}

const image = () => surface().querySelector('img');
const pdfViewer = () => surface().querySelector('[data-pdf-viewer]');
const filePreview = (name: string) =>
	document.querySelector(`iframe[title="Preview: ${name}"]`) as HTMLIFrameElement | null;

function failureView(name: string) {
	const view = surface();
	expect(view.querySelector('[role="status"]')?.textContent?.trim()).toBe(FAILURE);
	expect(view.textContent).not.toContain(UNSUPPORTED);
	const download = view.querySelector(`a[download="${name}"]`);
	expect(download?.getAttribute('href')).toBe(`${url}${name}?download=1`);
	expect(download?.textContent?.trim()).toBe('Download');
	return view;
}

function post(frame: HTMLIFrameElement, data: object) {
	window.dispatchEvent(
		new MessageEvent('message', {
			origin: window.location.origin,
			source: frame.contentWindow,
			data
		})
	);
}

async function handshake(frame: HTMLIFrameElement) {
	await tick();
	const sent = vi.spyOn(frame.contentWindow!, 'postMessage');
	post(frame, { type: 'ocu:preview-ready', chat_id: chat });
	await tick();
	expect(sent).toHaveBeenCalledTimes(1);
	const selection = sent.mock.calls[0][0] as { file_id: string; generation: number };
	return selection;
}

async function frameState(frame: HTMLIFrameElement, state: string) {
	const selection = await handshake(frame);
	post(frame, {
		type: 'ocu:preview-state',
		chat_id: chat,
		file_id: selection.file_id,
		generation: selection.generation,
		state
	});
	await tick();
}

beforeEach(() => {
	harness.install();
	pdfViewers.length = 0;
	serve([photo, second, report, brief, notes, readme, other, officeDocx]);
});
afterEach(() => harness.cleanup());

describe('over-limit files', () => {
	const marked = (source: WorkspaceFile, marker: 'too_large' | 'unsupported_name') =>
		marker === 'too_large'
			? { ...source, too_large: true }
			: { ...source, url: null, unsupported_name: true };
	const cases = [photo, report, notes].flatMap((source) =>
		(['too_large', 'unsupported_name'] as const).map(
			(marker) => [source.name, marker, marked(source, marker)] as const
		)
	);

	it.each(cases)(
		'%s marked %s shows the fallback without loading the file',
		async (name, marker, entry) => {
			serve([entry]);
			await harness.open();
			await harness.ready(name);
			await select(name);
			const view = surface();
			expect(image()).toBeNull();
			expect(pdfViewer()).toBeNull();
			expect(pdfViewers).toEqual([]);
			expect(view.querySelector('iframe')).toBeNull();
			expect(filePreview(name)).toBeNull();
			expect(harness.calls.filter((call) => call.url.startsWith(url))).toEqual([]);
			const status = view.querySelector('[role="status"]')?.textContent?.trim();
			if (marker === 'too_large') {
				expect(status).toBe('This file is larger than the 100 MiB preview limit.');
				const download = view.querySelector(`a[download="${name}"]`);
				expect(download?.getAttribute('href')).toBe(`${url}${name}?download=1`);
			} else {
				// OCU sends no URL for an unsupported name, so there is nothing to download.
				expect(status).toBe(
					'This file name cannot be opened here. Rename it in the terminal to open or download it.'
				);
				expect(document.querySelectorAll('[aria-label="Selected workspace file"] a')).toHaveLength(
					0
				);
			}
		}
	);
});

describe('image preview', () => {
	it('shows the revision URL in an image, fails visibly with a download, then shows the next image', async () => {
		await harness.open();
		await harness.ready('photo.png');
		await select('photo.png');
		const img = image();
		expect(img?.getAttribute('src')).toBe(`${url}photo.png?revision=1`);
		expect(img?.getAttribute('alt')).toBe('photo.png');
		expect(surface().querySelector('iframe')).toBeNull();
		expect(surface().textContent).not.toContain(UNSUPPORTED);

		img!.dispatchEvent(new Event('error'));
		await tick();
		expect(image()).toBeNull();
		failureView('photo.png');
		expect(
			document.querySelector('[data-selected-bar] a[download="photo.png"]')?.getAttribute('href')
		).toBe(`${url}photo.png?download=1`);

		await select('second.jpg');
		expect(image()?.getAttribute('src')).toBe(`${url}second.jpg?revision=1`);
		expect(surface().textContent).not.toContain(FAILURE);
		await select('photo.png');
		expect(image()?.getAttribute('src')).toBe(`${url}photo.png?revision=1`);
	});
});

describe('PDF preview', () => {
	it('mounts PDFViewer in single-page mode with the revision URL and no frame', async () => {
		await harness.open();
		await harness.ready('r.pdf');
		await select('r.pdf');
		const viewer = pdfViewer();
		expect(viewer?.getAttribute('data-url')).toBe(`${url}r.pdf?revision=1`);
		expect(viewer?.getAttribute('data-single-page')).toBe('true');
		expect(pdfViewers).toEqual([
			{ url: `${url}r.pdf?revision=1`, singlePage: true, destroyed: false }
		]);
		expect(surface().querySelector('iframe')).toBeNull();
		expect(surface().textContent).not.toContain(UNSUPPORTED);
		expect(editAction()).toBeUndefined();
	});

	it('remounts for another PDF, retiring the first viewer before the second loads', async () => {
		await harness.open();
		await harness.ready('r.pdf');
		await select('r.pdf');
		const first = pdfViewer();
		await select('s.pdf');
		expect(pdfViewer()).not.toBe(first);
		expect(first?.isConnected).toBe(false);
		expect(pdfViewer()?.getAttribute('data-url')).toBe(`${url}s.pdf?revision=1`);
		expect(pdfViewers).toEqual([
			{ url: `${url}r.pdf?revision=1`, singlePage: true, destroyed: true },
			{ url: `${url}s.pdf?revision=1`, singlePage: true, destroyed: false }
		]);
	});
});

describe('embedded text preview', () => {
	it('uses the fixed frame with neutral copy through connecting, rendering and ready', async () => {
		await harness.open();
		await harness.ready('notes.txt');
		await select('notes.txt');
		const frame = filePreview('notes.txt');
		expect(frame).not.toBeNull();
		expect(previewFrame('notes.txt')).toBeNull();
		expect(frame!.getAttribute('src')).toBe(`/ocu/preview/${chat}?embed=files`);
		expect(frame!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
		expect(surface().textContent).toContain('Connecting preview');
		const selection = await handshake(frame!);
		expect(selection).toMatchObject({
			type: 'ocu:preview-select',
			chat_id: chat,
			file_id: 'notes.txt'
		});
		expect(surface().textContent).toContain('Rendering file');
		expect(
			document.querySelector('[aria-label="Selected workspace file"]')?.textContent
		).not.toMatch(/Office/);
		post(frame!, {
			type: 'ocu:preview-state',
			chat_id: chat,
			file_id: 'notes.txt',
			generation: selection.generation,
			state: 'ready'
		});
		await tick();
		expect(surface().querySelector('[role="status"]')).toBeNull();
		expect(filePreview('notes.txt')).toBe(frame);
		expect(editAction()).toBeUndefined();
	});

	it.each(['error', 'missing', 'unsupported'])(
		'shows the failure view, download and retry for a frame %s state',
		async (state) => {
			await harness.open();
			await harness.ready('README.md');
			await select('README.md');
			await frameState(filePreview('README.md')!, state);
			failureView('README.md');
			expect(filePreview('README.md')).toBeNull();
			expect(surface().textContent).not.toMatch(/Office/);
			namedButton('Retry preview').click();
			await tick();
			await tick();
			expect(surface().textContent).toContain('Connecting preview');
			expect(filePreview('README.md')).not.toBeNull();
		}
	);

	it('times out neutrally on ready and on result, and retry starts a fresh frame', async () => {
		await harness.open();
		await harness.ready('notes.txt');
		vi.useFakeTimers();
		await select('notes.txt');
		const frame = filePreview('notes.txt')!;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(surface().querySelector('[role="status"]')?.textContent?.trim()).toBe(
			'Preview did not become ready'
		);
		expect(surface().querySelector('a[download="notes.txt"]')).not.toBeNull();
		expect(filePreview('notes.txt')).toBeNull();
		namedButton('Retry preview').click();
		await tick();
		await tick();
		const retried = filePreview('notes.txt')!;
		expect(retried).not.toBe(frame);
		await handshake(retried);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(surface().querySelector('[role="status"]')?.textContent?.trim()).toBe(
			'Preview timed out'
		);
		expect(surface().textContent).not.toMatch(/Office/);
	});
});

describe('preview identity across listing changes', () => {
	it('reloads text, image and PDF on revision or rename and keeps them for unrelated changes', async () => {
		await harness.open();
		await harness.ready('notes.txt');
		const bump = (target: WorkspaceFile, changes: Partial<WorkspaceFile>) =>
			[photo, report, notes, other].map((item) =>
				item.file_id === target.file_id ? { ...item, ...changes } : item
			);
		const renamed = (target: WorkspaceFile, name: string) => ({
			path: name,
			name,
			url: `${url}${name}`,
			revision: target.revision
		});
		const cases: Array<[WorkspaceFile, string, () => Element | null]> = [
			[notes, 'notes-2.txt', () => surface().querySelector('iframe[title^="Preview: "]')],
			[photo, 'photo-2.png', image],
			[report, 'r-2.pdf', pdfViewer]
		];
		let revision = 1;
		for (const [target, newName, element] of cases) {
			serve([photo, report, notes, other], ++revision);
			await harness.controller.refresh();
			await select(target.name);
			await vi.waitFor(() => expect(element()).not.toBeNull());
			const initial = element();
			await refresh(bump(other, { revision: 5 }), ++revision);
			expect(element()).toBe(initial);
			await refresh(bump(target, { revision: 2 }), ++revision);
			await vi.waitFor(() => expect(element()).not.toBeNull());
			const revised = element();
			expect(revised).not.toBe(initial);
			await refresh(bump(target, { ...renamed(target, newName), revision: 2 }), ++revision);
			await vi.waitFor(() => expect(element()).not.toBeNull());
			expect(element()).not.toBe(revised);
		}
		expect(pdfViewers.map((viewer) => viewer.url)).toEqual([
			`${url}r.pdf?revision=1`,
			`${url}r.pdf?revision=2`,
			`${url}r-2.pdf?revision=2`
		]);
	});
});

describe('switching across preview kinds', () => {
	it('leaves no earlier timer or result in control and offers Edit only for Office', async () => {
		await harness.open();
		await harness.ready('report.docx');
		vi.useFakeTimers();
		await select('report.docx');
		const office = previewFrame('report.docx')!;
		expect(editAction()).toBeDefined();
		const officeSelection = await handshake(office);
		await select('notes.txt');
		expect(editAction()).toBeUndefined();
		const text = filePreview('notes.txt')!;
		expect(surface().textContent).toContain('Connecting preview');
		post(office, {
			type: 'ocu:preview-state',
			chat_id: chat,
			file_id: officeDocx.file_id,
			generation: officeSelection.generation,
			state: 'error'
		});
		await tick();
		expect(filePreview('notes.txt')).toBe(text);
		const textSelection = await handshake(text);
		await select('photo.png');
		post(text, {
			type: 'ocu:preview-state',
			chat_id: chat,
			file_id: 'notes.txt',
			generation: textSelection.generation,
			state: 'error'
		});
		await vi.advanceTimersByTimeAsync(30_000);
		expect(image()?.getAttribute('src')).toBe(`${url}photo.png?revision=1`);
		expect(surface().querySelector('[role="status"]')).toBeNull();
		await select('r.pdf');
		await vi.advanceTimersByTimeAsync(30_000);
		expect(pdfViewer()?.getAttribute('data-url')).toBe(`${url}r.pdf?revision=1`);
		expect(surface().textContent).not.toMatch(
			/timed out|did not become ready|could not be displayed/
		);
		await select('report.docx');
		expect(editAction()).toBeDefined();
		expect(surface().textContent).toContain('Connecting Office preview');
		expect(previewFrame('report.docx')).not.toBe(office);
		expect(image()).toBeNull();
		expect(pdfViewer()).toBeNull();
	});
});
