// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import PDFViewer from './PDFViewer.svelte';

// Each getDocument call parks until the test resolves it, so load order is under test control.
const { getDocument, pending } = vi.hoisted(() => {
	const pending: Array<(value: unknown) => void> = [];
	const getDocument = vi.fn<[Record<string, unknown>], { promise: Promise<unknown> }>(() => ({
		promise: new Promise((resolve) => pending.push(resolve))
	}));
	return { getDocument, pending };
});

vi.mock('pdfjs-dist', () => ({
	GlobalWorkerOptions: {},
	getDocument,
	TextLayer: class {
		render() {}
		cancel() {}
	}
}));

const pdfDocument = () => ({
	numPages: 1,
	destroy: vi.fn(),
	getPage: vi.fn(async () => ({
		getViewport: () => ({ width: 100, height: 100, scale: 1 }),
		render: () => ({ promise: Promise.resolve() }),
		getTextContent: async () => ({ items: [] })
	}))
});

let viewer: ReturnType<typeof createClassComponent> | undefined;
let fetched: string[] = [];

beforeEach(() => {
	pending.length = 0;
	getDocument.mockClear();
	fetched = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) => {
			fetched.push(String(input));
			return new Response(new Uint8Array([37, 80, 68, 70]));
		})
	);
	// jsdom has no canvas; the render loop skips a page without a 2D context.
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
	viewer?.$destroy();
	viewer = undefined;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

const open = (url: string) =>
	(viewer = createClassComponent({
		component: PDFViewer,
		target: document.body,
		props: { url, singlePage: true }
	}));

describe('PDFViewer loading', () => {
	it('fetches and parses once per mount, without eval in pdf.js', async () => {
		open('/files/a.pdf');
		await vi.waitFor(() => expect(getDocument).toHaveBeenCalled());
		const doc = pdfDocument();
		pending[0](doc);
		await vi.waitFor(() => expect(document.body.textContent).toContain('1 / 1'));
		expect(fetched).toEqual(['/files/a.pdf']);
		expect(getDocument).toHaveBeenCalledTimes(1);
		expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false }));
		expect(doc.destroy).not.toHaveBeenCalled();
	});

	it('destroys a document superseded while it was still parsing', async () => {
		open('/files/a.pdf');
		await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
		viewer!.$set({ url: '/files/b.pdf' });
		await tick();
		await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2));
		const [first, second] = [pdfDocument(), pdfDocument()];
		pending[1](second);
		await vi.waitFor(() => expect(second.getPage).toHaveBeenCalled());
		pending[0](first);
		await vi.waitFor(() => expect(first.destroy).toHaveBeenCalledTimes(1));
		expect(first.getPage).not.toHaveBeenCalled();
		expect(second.destroy).not.toHaveBeenCalled();
		expect(fetched).toEqual(['/files/a.pdf', '/files/b.pdf']);
		viewer!.$destroy();
		viewer = undefined;
		expect(second.destroy).toHaveBeenCalledTimes(1);
	});
});
