// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import WorkspaceTreeSplitter from './WorkspaceTreeSplitter.svelte';

let component: Record<string, unknown> | undefined;

function render(rowWidth: number, width = 220) {
	const row = document.createElement('div');
	Object.defineProperty(row, 'clientWidth', { configurable: true, value: rowWidth });
	document.body.append(row);
	const state = { width };
	component = mount(WorkspaceTreeSplitter, {
		target: row,
		props: {
			get width() {
				return state.width;
			},
			set width(value: number) {
				state.width = value;
			}
		},
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	flushSync();
	const separator = row.querySelector('[role="separator"]') as HTMLElement;
	return { state, separator };
}

const key = (node: HTMLElement, value: string) =>
	node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
function pointer(node: HTMLElement, type: string, clientX: number, pointerId = 1) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
	Object.defineProperty(event, 'pointerId', { value: pointerId });
	node.dispatchEvent(event);
}

afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	document.body.replaceChildren();
});

describe('workspace tree splitter', () => {
	it('is a focusable vertical separator named Resize file tree reporting the width', () => {
		const { separator } = render(600);
		expect(separator.getAttribute('aria-label')).toBe('Resize file tree');
		expect(separator.getAttribute('aria-orientation')).toBe('vertical');
		expect(separator.getAttribute('aria-valuemin')).toBe('100');
		expect(separator.getAttribute('aria-valuenow')).toBe('220');
		expect(separator.getAttribute('tabindex')).toBe('0');
		expect(separator.className).toMatch(/(^|\s)w-0(\s|$)/);
	});

	it('moves by 16 px with the arrow keys within 100 px and the row width minus 200 px', () => {
		const { state, separator } = render(600);
		key(separator, 'ArrowRight');
		expect(state.width).toBe(236);
		key(separator, 'ArrowLeft');
		key(separator, 'ArrowLeft');
		expect(state.width).toBe(204);
		for (let step = 0; step < 20; step++) key(separator, 'ArrowRight');
		expect(state.width).toBe(400);
		for (let step = 0; step < 40; step++) key(separator, 'ArrowLeft');
		expect(state.width).toBe(100);
		key(separator, 'Enter');
		expect(state.width).toBe(100);
	});

	it('starts keyboard steps from the width the row bounds actually allow', () => {
		const { state, separator } = render(366);
		key(separator, 'ArrowLeft');
		expect(state.width).toBe(150);
	});

	it('follows a captured pointer drag with the same clamp and ignores other pointers', () => {
		const { state, separator } = render(600);
		pointer(separator, 'pointermove', 400);
		expect(state.width).toBe(220);
		pointer(separator, 'pointerdown', 300);
		pointer(separator, 'pointermove', 350);
		expect(state.width).toBe(270);
		pointer(separator, 'pointermove', 900, 2);
		expect(state.width).toBe(270);
		pointer(separator, 'pointermove', 900);
		expect(state.width).toBe(400);
		pointer(separator, 'pointermove', -500);
		expect(state.width).toBe(100);
		pointer(separator, 'pointerup', -500);
		pointer(separator, 'pointermove', 380);
		expect(state.width).toBe(100);
		pointer(separator, 'pointerdown', 0);
		pointer(separator, 'pointercancel', 0);
		pointer(separator, 'pointermove', 200);
		expect(state.width).toBe(100);
	});
});
