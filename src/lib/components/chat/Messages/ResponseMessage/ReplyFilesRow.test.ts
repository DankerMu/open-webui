// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { i18n } from '../../../../../../test/ocu-workspace-fixtures';
import ReplyFilesRow from './ReplyFilesRow.svelte';
import type { OutputItem } from '../structuredOutput';

// generate_image writes each image to message.files and names it in its result JSON with the same
// id and url (builtin.py:410-436, routers/images.py:562-568).
const image = (id: string) => ({
	type: 'image',
	id,
	url: `/api/v1/files/${id}/content`,
	name: `${id}.png`,
	content_type: 'image/png'
});
const pdf = { type: 'file', id: 'p', url: '/api/v1/files/p/content', name: 'report.pdf', size: 10 };

const generated = (...ids: string[]): OutputItem[] => [
	{ type: 'function_call', id: 'fc_A', call_id: 'A', name: 'generate_image', status: 'completed' },
	{
		type: 'function_call_output',
		id: 'fco_A',
		call_id: 'A',
		output: [{ type: 'input_text', text: JSON.stringify({ images: ids.map(image) }) }],
		status: 'completed'
	}
];

let component: ReturnType<typeof mount> | null = null;

async function render(props: Record<string, unknown>) {
	component = mount(ReplyFilesRow, {
		target: document.body,
		props,
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	await tick();
}

const images = () =>
	[...document.body.querySelectorAll('img[data-cy="image"]')].map((img) => img.getAttribute('src'));

afterEach(() => {
	if (component) unmount(component);
	component = null;
	document.body.innerHTML = '';
});

describe('the files row above a reply', () => {
	it('leaves out the images the output shows after their call and keeps the rest', async () => {
		await render({ files: [image('a'), image('b'), pdf], output: generated('a', 'b') });
		expect(images()).toEqual([]);
		expect(document.body.textContent).toContain('report.pdf');
	});

	it('keeps every file of a message with no output', async () => {
		await render({ files: [image('a'), image('b'), pdf], output: undefined });
		expect(images()).toEqual([
			expect.stringMatching(/\/api\/v1\/files\/a\/content$/),
			expect.stringMatching(/\/api\/v1\/files\/b\/content$/)
		]);
		expect(document.body.textContent).toContain('report.pdf');
	});

	it('keeps an image no call in the output names', async () => {
		await render({ files: [image('a'), image('z')], output: generated('a') });
		expect(images()).toEqual([expect.stringMatching(/\/api\/v1\/files\/z\/content$/)]);
	});

	it('draws no row when every file is shown in order or none is an image or file', async () => {
		await render({
			files: [image('a'), { type: 'doc', url: '/d', name: 'collection' }],
			output: generated('a')
		});
		expect(document.body.querySelector('div')).toBeNull();
	});

	it('draws no row without files', async () => {
		await render({ files: undefined, output: generated('a') });
		expect(document.body.querySelector('div')).toBeNull();
	});
});
