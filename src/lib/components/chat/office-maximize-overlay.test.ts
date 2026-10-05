// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installOfficePopoverModel } from './workspace-artifact-office-test';
import { officeMaximizeOverlay } from './office-maximize-overlay';

let restorePopover: (() => void) | undefined;

afterEach(() => {
	restorePopover?.();
	restorePopover = undefined;
	document.body.replaceChildren();
});

describe('Office maximize overlay action', () => {
	it('shows a manual popover with viewport geometry and clears it on restore', () => {
		restorePopover = installOfficePopoverModel();
		const node = document.createElement('div');
		document.body.append(node);
		const action = officeMaximizeOverlay(node, false);
		expect(node.hasAttribute('popover')).toBe(false);
		action.update?.(true);
		expect(node.getAttribute('popover')).toBe('manual');
		expect(node.getAttribute('style')).toContain('position:fixed');
		expect(node.getAttribute('style')).toContain('inset:0');
		expect(node.hasAttribute('data-ocu-popover-open')).toBe(true);
		action.update?.(false);
		expect(node.hasAttribute('popover')).toBe(false);
		expect(node.getAttribute('style')).toBeNull();
		expect(node.hasAttribute('data-ocu-popover-open')).toBe(false);
		action.destroy?.();
	});

	it('does not invent a fixed-only fallback when the native primitive is absent', () => {
		const node = document.createElement('div');
		Object.defineProperty(node, 'showPopover', { value: undefined });
		document.body.append(node);
		expect(() => officeMaximizeOverlay(node, true)).toThrow(/showPopover is not a function/);
		expect(node.hasAttribute('popover')).toBe(false);
		expect(node.getAttribute('style')).toBeNull();
	});

	it.each([false, true])(
		'restores original prototype descriptors (existing model: %s)',
		(existing) => {
			const names = ['showPopover', 'hidePopover', 'matches'] as const;
			const restoreExisting = existing ? installOfficePopoverModel() : undefined;
			const before = names.map((name) =>
				Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
			);
			const restore = installOfficePopoverModel();
			restorePopover = () => {
				restore();
				restoreExisting?.();
			};
			const node = document.createElement('div');
			const action = officeMaximizeOverlay(node, false);
			action.update(true);
			expect(node.hasAttribute('data-ocu-popover-open')).toBe(true);
			action.destroy();
			expect(node.hasAttribute('data-ocu-popover-open')).toBe(false);
			restore();
			expect(
				names.map((name) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, name))
			).toEqual(before);
		}
	);
});
