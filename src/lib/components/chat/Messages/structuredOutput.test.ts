import { describe, expect, it } from 'vitest';
import { buildOutputDisplayItems, type OutputItem } from './structuredOutput';

// The shapes the backend stores (#937): the middleware writes one function_call per call and, after
// all of a turn's calls, one function_call_output whose text is the tool result JSON
// (middleware.py:5798-5830). generate_image's result names each image
// {id, url: /api/v1/files/<id>/content, name, content_type} (builtin.py:436, routers/images.py:562-568).
const call = (callId: string, name = 'generate_image'): OutputItem => ({
	type: 'function_call',
	id: `fc_${callId}`,
	call_id: callId,
	name,
	arguments: '{"prompt": "a cat"}',
	status: 'completed'
});

const outputOf = (callId: string, text: string): OutputItem => ({
	type: 'function_call_output',
	id: `fco_${callId}`,
	call_id: callId,
	output: [{ type: 'input_text', text }],
	status: 'completed'
});

const image = (id: string) => ({
	id,
	url: `/api/v1/files/${id}/content`,
	name: `${id}.png`,
	content_type: 'image/png'
});

const imageResult = (callId: string, ...ids: string[]) =>
	outputOf(
		callId,
		JSON.stringify({
			status: 'success',
			message: 'The image has been successfully generated and is already visible to the user.',
			images: ids.map(image)
		})
	);

/** Each display item as `kind:detail`: the tool name(s) of a row, or the image ids of an image item. */
const shape = (output: OutputItem[]) =>
	buildOutputDisplayItems(output).map((item) => {
		if (item.type === 'detail_single') return `tool:${item.token.attributes.name}`;
		if (item.type === 'detail_group') {
			return `group:${item.tokens.map((token) => token.attributes.name ?? token.attributes.type).join(',')}`;
		}
		if (item.type === 'message') return `message:${item.text}`;
		if (item.type === 'file') return `file:${String(item.item.path)}`;
		return `${item.type}:${(item as { images: { id: string }[] }).images.map((entry) => entry.id).join(',')}`;
	});

describe('generated images in the reply order', () => {
	it('puts each image right after the call that produced it', () => {
		expect(shape([call('A'), imageResult('A', 'a'), call('B'), imageResult('B', 'b')])).toEqual([
			'tool:generate_image',
			'image:a',
			'tool:generate_image',
			'image:b'
		]);
	});

	it('anchors the image at the call when a turn appends its outputs after all its calls', () => {
		expect(
			shape([call('A'), call('B', 'search_web'), imageResult('A', 'a'), outputOf('B', '[]')])
		).toEqual(['tool:generate_image', 'image:a', 'tool:search_web']);
		expect(shape([call('A'), call('B'), imageResult('A', 'a'), imageResult('B', 'b')])).toEqual([
			'tool:generate_image',
			'image:a',
			'tool:generate_image',
			'image:b'
		]);
	});

	it('treats an edit_image result the same way', () => {
		expect(
			shape([
				call('A', 'edit_image'),
				imageResult('A', 'a'),
				call('B', 'edit_image'),
				imageResult('B', 'b')
			])
		).toEqual(['tool:edit_image', 'image:a', 'tool:edit_image', 'image:b']);
	});

	it('closes a thinking block and the call into their group and shows the image outside it', () => {
		const thinking: OutputItem = {
			type: 'reasoning',
			id: 'rs_1',
			summary: [{ type: 'summary_text', text: 'Planning the picture.' }],
			status: 'completed'
		};
		expect(shape([thinking, call('A'), imageResult('A', 'a')])).toEqual([
			'group:reasoning,generate_image',
			'image:a'
		]);
	});

	it('keeps the id, url and name of every image a result returns, in result order', () => {
		const items = buildOutputDisplayItems([call('A'), imageResult('A', 'a', 'b')]);
		expect(items[1]).toMatchObject({
			type: 'image',
			images: [
				{ id: 'a', url: '/api/v1/files/a/content', name: 'a.png' },
				{ id: 'b', url: '/api/v1/files/b/content', name: 'b.png' }
			]
		});
		expect(Object.keys((items[1] as { images: object[] }).images[0]).sort()).toEqual([
			'id',
			'name',
			'url'
		]);
	});

	it('gives each image item an id no other display item uses', () => {
		const ids = buildOutputDisplayItems([
			call('A'),
			imageResult('A', 'a'),
			call('B'),
			imageResult('B', 'b')
		]).map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('keeps only the entries with a nonempty string url', () => {
		const result = outputOf(
			'A',
			JSON.stringify({
				images: [{ id: 'x', url: 5 }, { id: 'y' }, { id: 'z', url: '' }, null, 'a', image('c')]
			})
		);
		expect(shape([call('A'), result])).toEqual(['tool:generate_image', 'image:c']);
	});

	it.each([
		['not JSON', 'Error: image generation failed'],
		['JSON without images', JSON.stringify({ status: 'error', message: 'quota' })],
		['images that is not a list', JSON.stringify({ images: { id: 'a' } })],
		['no entry with a string url', JSON.stringify({ images: [{ id: 'a', url: null }] })],
		['an empty result', '']
	])('adds no image item for a result that is %s', (_, text) => {
		expect(shape([call('A'), outputOf('A', text), call('B'), imageResult('B', 'b')])).toEqual([
			'group:generate_image,generate_image',
			'image:b'
		]);
	});

	it('adds no image item for a call that has no output yet', () => {
		expect(shape([call('A')])).toEqual(['tool:generate_image']);
	});

	it('adds no image item for another tool whose result carries images', () => {
		expect(shape([call('A', 'search_web'), imageResult('A', 'a')])).toEqual(['tool:search_web']);
	});

	it('adds no image item for an output whose call is missing', () => {
		expect(shape([imageResult('A', 'a')])).toEqual([]);
	});

	it('still shows a display_file call as a file item after its output', () => {
		const displayFile: OutputItem = {
			type: 'function_call',
			id: 'fc_F',
			call_id: 'F',
			name: 'display_file',
			arguments: '{"path": "/home/user/report.pdf"}',
			status: 'completed'
		};
		const fileResult = outputOf(
			'F',
			JSON.stringify({
				type: 'file',
				source: 'open_terminal',
				path: '/home/user/report.pdf',
				terminal_selector: 't1'
			})
		);
		expect(shape([displayFile, fileResult])).toEqual([
			'tool:display_file',
			'file:/home/user/report.pdf'
		]);
	});
});
