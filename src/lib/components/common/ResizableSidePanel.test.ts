// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { createClassComponent } from 'svelte/legacy';
import ResizableSidePanel from './ResizableSidePanel.svelte';

let destroy: (() => void) | undefined;
const priorUserSelect = document.body.style.userSelect;

afterEach(() => {
	destroy?.();
	destroy = undefined;
	document.body.replaceChildren();
	document.body.style.userSelect = priorUserSelect;
});

function render(props: { onClose?: () => void; onCloseRequest?: () => void } = {}) {
	const component = createClassComponent({
		component: ResizableSidePanel,
		target: document.body,
		props: { open: true, width: 350, minWidth: 300, closeOnDragBelowMinWidth: true, ...props }
	});
	destroy = () => component.$destroy();
	return component;
}

function startDrag() {
	document
		.querySelector('[aria-label="Resize panel"]')!
		.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0 }));
}

function movePointer(clientX: number) {
	window.dispatchEvent(new MouseEvent('pointermove', { clientX }));
}

describe('ResizableSidePanel close requests', () => {
	it('closes locally and synchronously notifies default callers when dragged below minimum width', async () => {
		const onClose = vi.fn();
		render({ onClose });
		await tick();
		const resizer = document.querySelector('[aria-label="Resize panel"]');
		expect(resizer).not.toBeNull();
		startDrag();
		movePointer(100);
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(document.body.style.userSelect).toBe('');
		await tick();
		expect(document.querySelector('[aria-label="Resize panel"]')).toBeNull();
	});

	it('keeps the original panel visible and ends resizing while its owner admits closure', async () => {
		const onCloseRequest = vi.fn();
		const onClose = vi.fn();
		const component = render({ onCloseRequest, onClose });
		await tick();
		const resizer = document.querySelector('[aria-label="Resize panel"]');
		const panel = resizer!.nextElementSibling as HTMLElement;
		startDrag();
		expect(document.body.style.userSelect).toBe('none');
		movePointer(100);
		await tick();
		expect(document.querySelector('[aria-label="Resize panel"]')).toBe(resizer);
		expect(panel.isConnected).toBe(true);
		expect(panel.style.width).toBe('350px');
		expect(document.body.style.userSelect).toBe('');
		expect(onCloseRequest).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
		movePointer(-100);
		await tick();
		expect(panel.style.width).toBe('350px');
		expect(onCloseRequest).toHaveBeenCalledTimes(1);
		component.$set({ open: false });
		await tick();
		expect(panel.isConnected).toBe(false);
		expect(onCloseRequest).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('does not request a user close when its owner hides it or tears it down during resizing', async () => {
		const onCloseRequest = vi.fn();
		const component = render({ onCloseRequest });
		await tick();
		component.$set({ open: false });
		await tick();
		expect(document.querySelector('[aria-label="Resize panel"]')).toBeNull();
		expect(onCloseRequest).not.toHaveBeenCalled();
		component.$set({ open: true });
		await tick();
		startDrag();
		await tick();
		expect(document.body.style.userSelect).toBe('none');
		component.$destroy();
		destroy = undefined;
		expect(document.querySelector('[aria-label="Resize panel"]')).toBeNull();
		expect(document.body.style.userSelect).toBe('');
		movePointer(100);
		expect(onCloseRequest).not.toHaveBeenCalled();
	});
});
