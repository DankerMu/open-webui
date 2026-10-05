const OVERLAY_STYLE = 'position:fixed;inset:0;width:100vw;height:100dvh;margin:0;padding:0.75rem;';

export function officeMaximizeOverlay(node: HTMLElement, maximized: boolean) {
	function apply(next: boolean) {
		if (next) {
			if (typeof node.showPopover !== 'function') {
				throw new TypeError('showPopover is not a function');
			}
			node.setAttribute('popover', 'manual');
			node.setAttribute('style', OVERLAY_STYLE);
			node.showPopover();
			return;
		}
		if (typeof node.hidePopover === 'function' && node.hasAttribute('popover')) {
			try {
				if (node.matches(':popover-open')) node.hidePopover();
			} catch {
				node.hidePopover();
			}
		}
		node.removeAttribute('popover');
		node.removeAttribute('style');
	}

	apply(maximized);
	return {
		update(next: boolean) {
			apply(next);
		},
		destroy() {
			apply(false);
		}
	};
}
