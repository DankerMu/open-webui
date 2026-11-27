import { describe, expect, it } from 'vitest';
import { Marked } from 'marked';
import { buildOutputDisplayItems, type OutputItem } from './structuredOutput';

// The OCU wrapper appends one `New image: /mnt/user-data/files/<path>` line per image a call wrote,
// after the command output and before any sync notes (computer_use_tools.py, #938).
const CHAT = 'C';
const ORIGIN = 'https://h';
const OPTIONS = { chatId: CHAT, origin: ORIGIN };
const line = (path: string) => `New image: /mnt/user-data/files/${path}`;

const call = (name: string, text: string, id = '1'): OutputItem[] => [
	{
		type: 'function_call',
		id: `fc_${id}`,
		call_id: `call_${id}`,
		name,
		arguments: '{}',
		status: 'completed'
	},
	{
		type: 'function_call_output',
		id: `fco_${id}`,
		call_id: `call_${id}`,
		output: [{ type: 'input_text', text }],
		status: 'completed'
	}
];

const bash = (...paths: string[]) => call('bash_tool', ['saved', ...paths.map(line)].join('\n\n'));

const message = (text: string): OutputItem => ({
	type: 'message',
	id: 'msg',
	role: 'assistant',
	content: [{ type: 'output_text', text }]
});

const items = (output: OutputItem[], options: object = OPTIONS) =>
	buildOutputDisplayItems(output, options);

const imageUrls = (output: OutputItem[], options: object = OPTIONS) =>
	items(output, options).flatMap((item) =>
		item.type === 'image' ? item.images.map((image) => image.url) : []
	);

// What the reader sees: the markdown images Markdown.svelte renders (marked's image tokens) plus the
// image items, each as a URL resolved against the page.
const shown = (output: OutputItem[]) => {
	const marked = new Marked();
	const embeds: string[] = [];
	for (const item of output) {
		if (item.type !== 'message') continue;
		marked.walkTokens(marked.lexer(String(item.content?.[0]?.text ?? '')), (token) => {
			if (token.type === 'image') embeds.push(new URL(token.href, ORIGIN).href);
		});
	}
	return [...embeds, ...imageUrls(output).map((url) => new URL(url, ORIGIN).href)];
};

describe('images an OCU call wrote, shown after the call (#938)', () => {
	it('puts an image item right after the bash_tool call that wrote it', () => {
		const output = [...call('bash_tool', `done\n\n${line('plots/t.png')}`), message('Here it is.')];
		expect(items(output).map((item) => item.type)).toEqual(['detail_single', 'image', 'message']);
		expect(items(output)[1]).toEqual({
			type: 'image',
			id: 'image-0',
			images: [{ id: 'plots/t.png', url: '/ocu/files/C/plots/t.png', name: 't.png' }]
		});
	});

	it('anchors the item at the call even when the output follows a later call', () => {
		const [first, firstOutput] = call('bash_tool', line('a.png'), '1');
		const [second, secondOutput] = call('bash_tool', line('b.png'), '2');
		const output = [first, second, firstOutput, secondOutput];
		expect(items(output).map((item) => item.type)).toEqual([
			'detail_single',
			'image',
			'detail_single',
			'image'
		]);
		expect(imageUrls(output)).toEqual(['/ocu/files/C/a.png', '/ocu/files/C/b.png']);
	});

	it.each(['str_replace', 'create_file', 'sub_agent'])('reads the lines of %s', (name) => {
		expect(imageUrls(call(name, `ok\n\n${line('t.png')}`))).toEqual(['/ocu/files/C/t.png']);
	});

	it('keeps the images off the tool row, which would draw them a second time', () => {
		const [tool] = items(bash('t.png'));
		expect(tool.type === 'detail_single' && tool.token.attributes.files).toBe('');
	});

	it('reads the lines before the sync notes and ignores the overflow line', () => {
		const paths = Array.from({ length: 10 }, (_, index) => `chart-${index}.png`);
		const text = [
			'out',
			paths.map(line).join('\n'),
			'More new images: 2',
			'Synced image: /mnt/user-data/files/u.png'
		].join('\n\n');
		const shownItems = items(call('bash_tool', text)).filter((item) => item.type === 'image');
		expect(shownItems).toHaveLength(1);
		expect(shownItems[0].type === 'image' && shownItems[0].images.map((image) => image.id)).toEqual(
			paths
		);
	});

	it('shows a path named twice in one call once, and again after a later call', () => {
		const output = [
			...call('bash_tool', `${line('t.png')}\n${line('t.png')}`, '1'),
			...call('bash_tool', line('t.png'), '2')
		];
		expect(imageUrls(output)).toEqual(['/ocu/files/C/t.png', '/ocu/files/C/t.png']);
	});

	it('encodes the path like the sidebar does', () => {
		expect(imageUrls(bash('温度 (1).png'))).toEqual([
			'/ocu/files/C/%E6%B8%A9%E5%BA%A6%20%281%29.png'
		]);
		expect(imageUrls(bash('100%.png'))).toEqual(['/ocu/files/C/100%25.png']);
	});

	it.each([
		['a parent segment', '../x.png'],
		['an inner parent segment', 'a/../x.png'],
		['a backslash', 'a\\x.png'],
		['an absolute path after the prefix', '/etc/x.png'],
		['a lone surrogate', 'a\ud800.png']
	])('drops a line with %s', (_label, path) => {
		expect(imageUrls(bash(path, 'ok.png'))).toEqual(['/ocu/files/C/ok.png']);
	});

	it('ignores the line in a view result and in a non-OCU tool result', () => {
		expect(imageUrls(call('view', line('t.png')))).toEqual([]);
		expect(imageUrls(call('search_web', line('t.png')))).toEqual([]);
	});

	it('ignores a line that is not a whole line', () => {
		expect(imageUrls(call('bash_tool', `echo ${line('t.png')}`))).toEqual([]);
	});

	it('shows nothing without a chat id', () => {
		expect(buildOutputDisplayItems(bash('t.png')).map((item) => item.type)).toEqual([
			'detail_single'
		]);
		expect(imageUrls(bash('t.png'), {})).toEqual([]);
		expect(imageUrls(bash('t.png'), { origin: ORIGIN })).toEqual([]);
	});

	it('leaves a reply without lines unchanged', () => {
		const output = [...call('bash_tool', 'plain output'), message('Done.')];
		expect(items(output)).toEqual(buildOutputDisplayItems(output));
	});
});

describe('an image the reply already embeds is shown once (#938)', () => {
	it('drops the item when a message embeds the same file on this origin', () => {
		const absolute = [...bash('plots/t.png'), message('![t](https://h/ocu/files/C/plots/t.png)')];
		expect(imageUrls(absolute)).toEqual([]);
		expect(shown(absolute)).toEqual(['https://h/ocu/files/C/plots/t.png']);
		const relative = [...bash('plots/t.png'), message('See ![t](/ocu/files/C/plots/t.png) above.')];
		expect(imageUrls(relative)).toEqual([]);
	});

	it('drops the item for an embed before the call too', () => {
		const output = [message('![t](https://h/ocu/files/C/plots/t.png)'), ...bash('plots/t.png')];
		expect(imageUrls(output)).toEqual([]);
	});

	it('keeps the item for a plain link to the file', () => {
		const output = [...bash('plots/t.png'), message('[t](https://h/ocu/files/C/plots/t.png)')];
		expect(imageUrls(output)).toEqual(['/ocu/files/C/plots/t.png']);
	});

	it('keeps the item for an embed on another origin, which the browser cannot load', () => {
		const output = [
			...bash('plots/t.png'),
			message('![t](http://other:8082/ocu/files/C/plots/t.png)')
		];
		expect(imageUrls(output)).toEqual(['/ocu/files/C/plots/t.png']);
	});

	it('keeps the item for an embed of another chat or another file', () => {
		const otherChat = [...bash('plots/t.png'), message('![t](https://h/ocu/files/D/plots/t.png)')];
		expect(imageUrls(otherChat)).toEqual(['/ocu/files/C/plots/t.png']);
		const otherFile = [...bash('plots/t.png'), message('![t](https://h/ocu/files/C/t.png)')];
		expect(imageUrls(otherFile)).toEqual(['/ocu/files/C/plots/t.png']);
	});

	it('keeps the item when an encoded slash would join two segments', () => {
		const output = [...bash('a/b.png'), message('![x](https://h/ocu/files/C/a%2Fb.png)')];
		expect(imageUrls(output)).toEqual(['/ocu/files/C/a/b.png']);
	});

	it('keeps the item for an embed inside a code block, which renders no image', () => {
		const output = [...bash('t.png'), message('```\n![t](https://h/ocu/files/C/t.png)\n```')];
		expect(imageUrls(output)).toEqual(['/ocu/files/C/t.png']);
	});

	it('drops only the embedded one of two images', () => {
		const output = [...bash('a.png', 'b.png'), message('![a](/ocu/files/C/a.png)')];
		expect(imageUrls(output)).toEqual(['/ocu/files/C/b.png']);
	});

	it.each([
		['the raw URL in angle brackets', '![t](<https://h/ocu/files/C/温度 (1).png>)', []],
		['the raw name with an encoded space', '![t](https://h/ocu/files/C/温度%20(1).png)', []],
		['the encoded URL', '![t](https://h/ocu/files/C/%E6%B8%A9%E5%BA%A6%20%281%29.png)', []],
		// A bare space ends the destination: Markdown renders no image, so the item stays.
		[
			'the raw URL with a bare space',
			'![t](https://h/ocu/files/C/温度 (1).png)',
			['/ocu/files/C/%E6%B8%A9%E5%BA%A6%20%281%29.png']
		]
	])('shows 温度 (1).png once beside %s', (_label, text, expected) => {
		const output = [...bash('温度 (1).png'), message(text)];
		expect(imageUrls(output)).toEqual(expected);
		expect(shown(output)).toHaveLength(1);
	});

	it('keeps the item without throwing when the embed does not decode', () => {
		const output = [...bash('100%.png'), message('![x](https://h/ocu/files/C/100%.png)')];
		expect(() => items(output)).not.toThrow();
		expect(imageUrls(output)).toEqual(['/ocu/files/C/100%25.png']);
	});

	it('keeps the item without an origin to resolve embeds against', () => {
		const output = [...bash('t.png'), message('![t](/ocu/files/C/t.png)')];
		expect(imageUrls(output, { chatId: CHAT })).toEqual(['/ocu/files/C/t.png']);
	});
});
