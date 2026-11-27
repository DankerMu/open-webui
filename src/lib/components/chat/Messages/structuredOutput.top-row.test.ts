import { describe, expect, it } from 'vitest';
import {
	buildOutputDisplayItems,
	getOrderedImageKeys,
	notShownInOrder,
	type OutputItem
} from './structuredOutput';

// generate_image saves each image to message.files and returns it in the tool result JSON with the
// same id and url (builtin.py:410-436, routers/images.py:562-568). A channel rewrites its files'
// url to the id (socket/main.py:1039).
const image = (id: string) => ({
	id,
	url: `/api/v1/files/${id}/content`,
	name: `${id}.png`,
	content_type: 'image/png'
});

const output = (...ids: string[][]): OutputItem[] =>
	ids.flatMap((callIds, index) => [
		{
			type: 'function_call',
			id: `fc_${index}`,
			call_id: `call_${index}`,
			name: 'generate_image',
			arguments: '{}',
			status: 'completed'
		},
		{
			type: 'function_call_output',
			id: `fco_${index}`,
			call_id: `call_${index}`,
			output: [{ type: 'input_text', text: JSON.stringify({ images: callIds.map(image) }) }],
			status: 'completed'
		}
	]);

const chatFile = (id: string) => ({ type: 'image', ...image(id) });
const pdf = { type: 'file', id: 'p', url: '/api/v1/files/p/content', name: 'report.pdf' };

describe('keys of the images shown in the reply order', () => {
	it('returns the id and url of every image the reply shows after its call', () => {
		expect(getOrderedImageKeys(output(['a'], ['b']))).toEqual(
			new Set(['a', '/api/v1/files/a/content', 'b', '/api/v1/files/b/content'])
		);
	});

	it('names exactly the images the display items show', () => {
		const reply = output(['a', 'b'], ['c']);
		const shown = buildOutputDisplayItems(reply).flatMap((item) =>
			item.type === 'image' ? item.images.flatMap((entry) => [entry.id, entry.url]) : []
		);
		expect(getOrderedImageKeys(reply)).toEqual(new Set(shown));
	});

	it('leaves out an empty id', () => {
		const reply = output(['a']);
		reply[1].output = [
			{ type: 'input_text', text: JSON.stringify({ images: [{ id: '', url: '/x.png' }] }) }
		];
		expect(getOrderedImageKeys(reply)).toEqual(new Set(['/x.png']));
	});

	it('is empty without an output', () => {
		expect(getOrderedImageKeys(undefined)).toEqual(new Set());
		expect(getOrderedImageKeys([])).toEqual(new Set());
	});
});

describe('the files row above the reply', () => {
	it('drops the chat images shown in order, matched by url, and keeps the rest', () => {
		const files = [chatFile('a'), chatFile('b'), pdf];
		expect(files.filter(notShownInOrder(output(['a'], ['b'])))).toEqual([pdf]);
	});

	it('keeps every file of a message with no output', () => {
		const files = [chatFile('a'), chatFile('b'), pdf];
		expect(files.filter(notShownInOrder(undefined))).toEqual(files);
		expect(files.filter(notShownInOrder([]))).toEqual(files);
	});

	it('keeps an image no call in the output names', () => {
		const files = [chatFile('a'), chatFile('z')];
		expect(files.filter(notShownInOrder(output(['a'])))).toEqual([chatFile('z')]);
	});

	it('drops the channel images shown in order, whose url is their id, matched by id', () => {
		const channelFile = (id: string) => ({ ...chatFile(id), url: id });
		const files = [channelFile('a'), channelFile('b'), { ...pdf, url: 'p' }];
		expect(files.filter(notShownInOrder(output(['a'], ['b'])))).toEqual([{ ...pdf, url: 'p' }]);
	});

	it('keeps a file without an id or url', () => {
		expect([null, {}, { id: 5, url: null }].filter(notShownInOrder(output(['a'])))).toEqual([
			null,
			{},
			{ id: 5, url: null }
		]);
	});
});
