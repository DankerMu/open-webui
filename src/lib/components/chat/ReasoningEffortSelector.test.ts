// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import { chatEffortParams, type ChatParams } from '$lib/stores/chat-effort';
import ReasoningEffortSelector from './ReasoningEffortSelector.svelte';

let component: Record<string, unknown> | undefined;
let params: ChatParams = {};
let modelIds: string[] = [];
const setParams = vi.fn((next: ChatParams) => {
	params = next;
	publish();
});

// Mirrors ChatControls: one atomic publication of the bound params and the selected model ids.
function publish() {
	chatEffortParams.set({ modelIds, params, setParams });
	flushSync();
}

function render(ids: string[] | null, initial: ChatParams = {}) {
	params = initial;
	modelIds = ids ?? [];
	if (ids) publish();
	component = mount(ReasoningEffortSelector, {
		target: document.body,
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	flushSync();
}

function select(ids: string[], next: ChatParams = params) {
	modelIds = ids;
	params = next;
	publish();
}

const trigger = () =>
	document.querySelector<HTMLButtonElement>('button[aria-label^="Thinking strength"]');
async function openMenu() {
	if (!document.querySelector('[role="menu"]')) {
		trigger()!.click();
		await tick();
		await tick();
	}
	return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
}
// Picks a level and waits for the menu's outro to remove it.
async function choose(index: number) {
	(await openMenu())[index].click();
	await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
}
const items = async () =>
	(await openMenu()).map((item) => [item.textContent?.trim(), item.getAttribute('aria-checked')]);

const priorAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeEach(() => {
	// jsdom has no Web Animations; the menu transition finishes on the next microtask.
	Object.defineProperty(Element.prototype, 'animate', {
		configurable: true,
		value: () => {
			const animation = {
				currentTime: 0,
				playState: 'finished',
				effect: null,
				onfinish: null as (() => void) | null,
				cancel: () => {}
			};
			queueMicrotask(() => animation.onfinish?.());
			return animation;
		}
	});
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			disconnect() {}
		}
	);
});

afterEach(async () => {
	if (priorAnimate) Object.defineProperty(Element.prototype, 'animate', priorAnimate);
	else Reflect.deleteProperty(Element.prototype, 'animate');
	vi.unstubAllGlobals();
	if (component) await unmount(component);
	component = undefined;
	chatEffortParams.set(null);
	setParams.mockClear();
	document.body.replaceChildren();
});

describe('composer thinking-strength selector', () => {
	it('renders nothing without a published chat binding', () => {
		render(null);
		expect(trigger()).toBeNull();
		expect(document.body.textContent?.trim()).toBe('');
	});

	it('renders nothing for several models and while no model is resolved', () => {
		render(['qwen3.8-27b', 'gpt-4o']);
		expect(trigger()).toBeNull();
		select([]);
		expect(trigger()).toBeNull();
		expect(setParams).not.toHaveBeenCalled();
	});

	it('shows Default with four levels for a generic model and writes nothing until a pick', async () => {
		render(['gpt-4o']);
		expect(trigger()!.getAttribute('aria-label')).toBe('Thinking strength: Default');
		expect(await items()).toEqual([
			['Low', 'false'],
			['Medium', 'false'],
			['High', 'false'],
			['XHigh', 'false']
		]);
		expect(setParams).not.toHaveBeenCalled();
		await choose(3);
		expect(params).toEqual({ reasoning_effort: 'xhigh', thinking: null });
		expect(trigger()!.getAttribute('aria-label')).toBe('Thinking strength: XHigh');
	});

	it('keeps a generic pick across a switch to another generic model', () => {
		render(['gpt-4o'], { reasoning_effort: 'xhigh', thinking: null });
		select(['claude-sonnet']);
		expect(setParams).not.toHaveBeenCalled();
		expect(params).toEqual({ reasoning_effort: 'xhigh', thinking: null });
	});

	it('clears a carried family default on a switch to a generic model', () => {
		render(['qwen3.8-27b']);
		expect(params).toEqual({ reasoning_effort: 'medium', thinking: null });
		select(['gpt-4o']);
		expect(params).toEqual({});
		expect(trigger()!.getAttribute('aria-label')).toBe('Thinking strength: Default');
	});

	it('shows family levels in order with the current one checked and writes the mapped shape', async () => {
		render(['qwen3.8-27b']);
		expect(trigger()!.getAttribute('aria-label')).toBe('Thinking strength: Medium');
		expect(await items()).toEqual([
			['Off', 'false'],
			['Low', 'false'],
			['Medium', 'true'],
			['High', 'false'],
			['XHigh', 'false']
		]);
		await choose(0);
		expect(params).toEqual({ reasoning_effort: null, thinking: { type: 'disabled' } });
		expect(trigger()!.getAttribute('aria-label')).toBe('Thinking strength: Off');
		select(['deepseek-v4.1-flash-1017']);
		expect(params).toEqual({ reasoning_effort: null, thinking: { type: 'disabled' } });
		expect(await items()).toEqual([
			['Off', 'true'],
			['High', 'false'],
			['Max', 'false']
		]);
		await choose(2);
		expect(params).toEqual({ reasoning_effort: 'max', thinking: null });
	});

	it('does not write once settled', () => {
		render(['qwen3.8-27b'], { reasoning_effort: 'high', thinking: null });
		expect(setParams).not.toHaveBeenCalled();
		select(['qwen3.8-flash']);
		publish();
		expect(setParams).not.toHaveBeenCalled();
	});

	it('keeps a saved generic pick when the chat id lands before the loaded params and model', () => {
		render(['qwen3.8-27b'], { reasoning_effort: 'medium', thinking: null });
		// Chat switch: the old chat's binding republishes, then the loaded chat replaces both.
		publish();
		select(['gpt-4o'], { reasoning_effort: 'xhigh', thinking: null });
		expect(params).toEqual({ reasoning_effort: 'xhigh', thinking: null });
		select(['qwen3.8-27b'], { reasoning_effort: 'low', thinking: null });
		expect(params).toEqual({ reasoning_effort: 'low', thinking: null });
		expect(setParams).not.toHaveBeenCalled();
	});

	it('names the trigger and hides the decorative icon and narrow-screen label correctly', () => {
		render(['deepseek-v4-pro']);
		const button = trigger()!;
		expect(button.type).toBe('button');
		expect(button.getAttribute('aria-label')).toBe('Thinking strength: High');
		expect(button.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
		expect(button.querySelector('span')!.className).toContain('hidden sm:inline');
	});
});
