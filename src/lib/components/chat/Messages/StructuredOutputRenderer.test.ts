// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { i18n } from '../../../../../test/ocu-workspace-fixtures';
import StructuredOutputRenderer from './StructuredOutputRenderer.svelte';
import type { OutputItem } from './structuredOutput';

// Two generate_image calls, each followed by its stored result (middleware.py:5798-5830,
// builtin.py:436): the reply should read call, image, call, image (#937).
const turn = (callId: string, imageId: string): OutputItem[] => [
	{
		type: 'function_call',
		id: `fc_${callId}`,
		call_id: callId,
		name: 'generate_image',
		arguments: '{"prompt": "a cat"}',
		status: 'completed'
	},
	{
		type: 'function_call_output',
		id: `fco_${callId}`,
		call_id: callId,
		output: [
			{
				type: 'input_text',
				text: JSON.stringify({
					status: 'success',
					images: [{ id: imageId, url: `/api/v1/files/${imageId}/content`, name: '' }]
				})
			}
		],
		status: 'completed'
	}
];

let component: ReturnType<typeof mount> | null = null;

afterEach(() => {
	if (component) unmount(component);
	component = null;
	document.body.innerHTML = '';
});

describe('generated images in the rendered reply', () => {
	it('renders each image right after its tool row, outside the tool rows', async () => {
		component = mount(StructuredOutputRenderer, {
			target: document.body,
			props: { id: 'reply', output: [...turn('A', 'a'), ...turn('B', 'b')], done: true },
			context: new Map<unknown, unknown>([['i18n', i18n]])
		});
		await tick();

		// Document order of the tool rows and the generated images.
		const order = [
			...document.body.querySelectorAll<HTMLElement>('[role="button"], img[data-cy="image"]')
		].map((node) => (node.matches('img') ? `image:${node.getAttribute('src')}` : 'tool'));
		expect(order).toEqual([
			'tool',
			expect.stringMatching(/^image:.*\/api\/v1\/files\/a\/content$/),
			'tool',
			expect.stringMatching(/^image:.*\/api\/v1\/files\/b\/content$/)
		]);
		for (const img of document.body.querySelectorAll('img[data-cy="image"]')) {
			expect(img.closest('[role="button"]')).toBeNull();
			expect(img.getAttribute('alt')).toBe('Generated Image');
		}
	});
});
