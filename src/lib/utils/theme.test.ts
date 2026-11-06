// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { theme } from '$lib/stores';
import { applyTheme, setTheme } from './theme';

// Expected values are the literals of the theme logic upstream shipped in
// src/lib/components/chat/Settings/General.svelte (v0.11.3), which this module replaces.
const GRAY_VARS = ['--color-gray-800', '--color-gray-850', '--color-gray-900', '--color-gray-950'];
const DARK_GRAYS = ['#333', '#262626', '#171717', '#0d0d0d'];
const OLED_GRAYS = ['#101010', '#050505', '#000000', '#000000'];
const UNSET_GRAYS = ['', '', '', ''];

type HookWindow = Window & { applyTheme?: () => void };

const root = () => document.documentElement;
const grays = () => GRAY_VARS.map((name) => root().style.getPropertyValue(name));
const classes = () => [...root().classList].sort();
const metaColor = () =>
	document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;

let hook: ReturnType<typeof vi.fn>;

function prefersDark(matches: boolean) {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: query === '(prefers-color-scheme: dark)' ? matches : false,
		media: query
	})) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
	root().className = '';
	root().removeAttribute('style');
	document.head.innerHTML = '<meta name="theme-color" content="#initial" />';
	localStorage.clear();
	theme.set('system');
	prefersDark(false);
	hook = vi.fn();
	(window as HookWindow).applyTheme = hook;
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	delete (window as HookWindow).applyTheme;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('applyTheme', () => {
	it('system with a dark preference applies dark with the dark grays', () => {
		prefersDark(true);
		root().classList.add('light');

		applyTheme('system');

		expect(classes()).toEqual(['dark']);
		expect(grays()).toEqual(DARK_GRAYS);
		expect(metaColor()).toBe('#171717');
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('system with a light preference applies light and leaves the grays alone', () => {
		prefersDark(false);
		root().classList.add('dark', 'oled-dark');

		applyTheme('system');

		expect(classes()).toEqual(['light']);
		expect(grays()).toEqual(UNSET_GRAYS);
		expect(metaColor()).toBe('#ffffff');
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('dark replaces light and sets the dark grays', () => {
		prefersDark(false);
		root().classList.add('light');

		applyTheme('dark');

		expect(classes()).toEqual(['dark']);
		expect(grays()).toEqual(DARK_GRAYS);
		expect(metaColor()).toBe('#171717');
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('light replaces dark and oled-dark and leaves the grays alone', () => {
		prefersDark(true);
		root().classList.add('dark', 'oled-dark');

		applyTheme('light');

		expect(classes()).toEqual(['light']);
		expect(grays()).toEqual(UNSET_GRAYS);
		expect(metaColor()).toBe('#ffffff');
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('oled-dark applies the dark class with the oled grays', () => {
		root().classList.add('light', 'oled-dark');

		applyTheme('oled-dark');

		expect(classes()).toEqual(['dark']);
		expect(grays()).toEqual(OLED_GRAYS);
		expect(metaColor()).toBe('#000000');
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('her applies light with its own meta colour', () => {
		prefersDark(true);
		root().classList.add('dark');

		applyTheme('her');

		expect(classes()).toEqual(['light']);
		expect(grays()).toEqual(UNSET_GRAYS);
		expect(metaColor()).toBe('#983724');
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('runs the window hook after the dark grays and before the oled grays and class', () => {
		hook.mockImplementation(() => {
			root().style.setProperty('--color-gray-900', '#123456');
			root().classList.remove('dark');
		});

		applyTheme('dark');
		expect(root().style.getPropertyValue('--color-gray-900')).toBe('#123456');
		expect(classes()).toEqual([]);

		applyTheme('oled-dark');
		expect(root().style.getPropertyValue('--color-gray-900')).toBe('#000000');
		expect(classes()).toEqual(['dark']);
	});

	it('switching from oled-dark to dark restores the dark grays; light keeps them', () => {
		applyTheme('oled-dark');
		applyTheme('dark');
		expect(grays()).toEqual(DARK_GRAYS);

		applyTheme('light');
		expect(classes()).toEqual(['light']);
		expect(grays()).toEqual(DARK_GRAYS);
	});

	it('works without the window hook and without a theme-color meta tag', () => {
		delete (window as HookWindow).applyTheme;
		document.head.innerHTML = '';

		expect(() => applyTheme('oled-dark')).not.toThrow();
		expect(classes()).toEqual(['dark']);
		expect(grays()).toEqual(OLED_GRAYS);
		expect(metaColor()).toBeNull();
	});

	it('does nothing when there is no document (server render)', () => {
		vi.stubGlobal('document', undefined);

		expect(() => applyTheme('dark')).not.toThrow();
		expect(hook).not.toHaveBeenCalled();
	});
});

describe('setTheme', () => {
	it('writes the store and localStorage, then applies the theme', () => {
		root().classList.add('light');

		setTheme('oled-dark');

		expect(get(theme)).toBe('oled-dark');
		expect(localStorage.getItem('theme')).toBe('oled-dark');
		expect(classes()).toEqual(['dark']);
		expect(grays()).toEqual(OLED_GRAYS);
		expect(metaColor()).toBe('#000000');
		expect(hook).toHaveBeenCalledTimes(1);
	});
});
