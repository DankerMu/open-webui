// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import Drawer from './Drawer.svelte';

let destroy: (() => void) | undefined;
const priorOverflow = document.body.style.overflow;
const priorAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

beforeEach(() => {
	Object.defineProperty(Element.prototype, 'animate', {
		configurable: true,
		value: (_keyframes: unknown, options: KeyframeAnimationOptions = {}) => {
			let cancelled = false;
			const animation = {
				currentTime: 0,
				playState: 'running',
				effect: null,
				onfinish: null as (() => void) | null,
				cancel: () => {
					cancelled = true;
					animation.playState = 'idle';
				}
			};
			queueMicrotask(() => {
				if (cancelled) return;
				animation.currentTime = Number(options.duration ?? 0);
				animation.playState = 'finished';
				animation.onfinish?.();
			});
			return animation;
		}
	});
});

afterEach(async () => {
	destroy?.();
	await tick();
	destroy = undefined;
	document.body.replaceChildren();
	document.body.style.overflow = priorOverflow;
	if (priorAnimate) Object.defineProperty(Element.prototype, 'animate', priorAnimate);
	else Reflect.deleteProperty(Element.prototype, 'animate');
});

function render(props: { onClose?: () => void; onCloseRequest?: () => void } = {}) {
	const component = createClassComponent({
		component: Drawer,
		target: document.body,
		props: { show: true, ...props }
	});
	destroy = () => component.$destroy();
	return component;
}

function closeFrom(trigger: 'Escape' | 'backdrop') {
	if (trigger === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	else
		document.querySelector('.modal')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

describe('Drawer close requests', () => {
	it.each(['Escape', 'backdrop'] as const)(
		'closes locally and notifies default callers on %s',
		async (trigger) => {
			const onClose = vi.fn();
			render({ onClose });
			await tick();
			expect(document.querySelector('.modal')).not.toBeNull();
			closeFrom(trigger);
			await tick();
			expect(document.querySelector('.modal')).toBeNull();
			expect(onClose).toHaveBeenCalledTimes(1);
		}
	);

	it.each(['Escape', 'backdrop'] as const)(
		'keeps the original drawer visible until its owner admits %s closure',
		async (trigger) => {
			const onCloseRequest = vi.fn();
			const onClose = vi.fn();
			const component = render({ onCloseRequest, onClose });
			await tick();
			const drawer = document.querySelector('.modal');
			closeFrom(trigger);
			await tick();
			expect(document.querySelector('.modal')).toBe(drawer);
			expect(drawer!.isConnected).toBe(true);
			expect(document.body.style.overflow).toBe('hidden');
			expect(onCloseRequest).toHaveBeenCalledTimes(1);
			expect(onClose).not.toHaveBeenCalled();
			component.$set({ show: false });
			await tick();
			expect(document.querySelector('.modal')).toBeNull();
			expect(onCloseRequest).toHaveBeenCalledTimes(1);
		}
	);

	it('does not request a user close when its owner hides it or replaces its layout', async () => {
		const onCloseRequest = vi.fn();
		const component = render({ onCloseRequest });
		await tick();
		component.$set({ show: false });
		await tick();
		expect(document.querySelector('.modal')).toBeNull();
		expect(onCloseRequest).not.toHaveBeenCalled();
		component.$set({ show: true });
		await tick();
		const drawer = document.querySelector('.modal');
		expect(drawer).not.toBeNull();
		component.$destroy();
		destroy = undefined;
		expect(drawer!.isConnected).toBe(false);
		expect(document.body.style.overflow).toBe('unset');
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(onCloseRequest).not.toHaveBeenCalled();
	});
});
