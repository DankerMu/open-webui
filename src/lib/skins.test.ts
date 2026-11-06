// @vitest-environment jsdom
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { settings, user, type SessionUser } from '$lib/stores';
import { updateUserSettings } from '$lib/apis/users';
import { setTheme } from '$lib/utils/theme';
import { applySkin, applySkinMirror, restoreSkin, selectSkin, skins } from './skins';

vi.mock('$lib/utils/theme', () => ({ setTheme: vi.fn() }));
vi.mock('$lib/apis/users', () => ({ updateUserSettings: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

// Expected values: the catalogue table in openspec/changes/webui-wallpaper-skins/design.md,
// with each overlay colour converted to rgba by hand.
const CATALOGUE = [
	['olive-ops', 'dark', '#101d13', 0.18, 'rgba(16, 29, 19, 0.18)'],
	['snow-plateau', 'light', '#ffffff', 0.18, 'rgba(255, 255, 255, 0.18)'],
	['golden-peaks', 'dark', '#101c30', 0.24, 'rgba(16, 28, 48, 0.24)'],
	['cloud-watch', 'light', '#f8fbff', 0.2, 'rgba(248, 251, 255, 0.2)'],
	['river-hydrology', 'light', '#f8fbff', 0.22, 'rgba(248, 251, 255, 0.22)'],
	['terrain-grid', 'dark', '#061623', 0.22, 'rgba(6, 22, 35, 0.22)'],
	['glacier-lake', 'light', '#f8fbff', 0.22, 'rgba(248, 251, 255, 0.22)'],
	['starfield', 'dark', '#071322', 0.2, 'rgba(7, 19, 34, 0.2)'],
	['minimal-terrain', 'light', '#ffffff', 0.12, 'rgba(255, 255, 255, 0.12)']
] as const;
const MAX_ASSET_BYTES = 480_000;
const SKINS_DIR = resolve(__dirname, '../../static/skins');

const root = () => document.documentElement;
const skinState = () => ({
	skin: root().dataset.skin ?? null,
	image: root().style.getPropertyValue('--skin-image'),
	overlay: root().style.getPropertyValue('--skin-overlay')
});
const NONE = { skin: null, image: '', overlay: '' };
const signIn = (id: string) => user.set({ id } as SessionUser);
const consoleSpies = () =>
	(['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
		vi.spyOn(console, level).mockImplementation(() => {})
	);

beforeEach(() => {
	root().removeAttribute('data-skin');
	root().removeAttribute('style');
	localStorage.clear();
	localStorage.token = 'token-1';
	signIn('user-1');
	settings.set({ textScale: 1.25 });
	vi.mocked(updateUserSettings).mockResolvedValue({});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('catalogue', () => {
	it('lists the nine skins in the requested order with mode and overlay', () => {
		expect(skins.map((s) => [s.id, s.mode, s.overlay.color, s.overlay.alpha])).toEqual(
			CATALOGUE.map(([id, mode, color, alpha]) => [id, mode, color, alpha])
		);
		expect(new Set(skins.map((s) => s.id)).size).toBe(9);
	});

	it.each(CATALOGUE.flatMap(([id]) => [`${id}.webp`, `${id}-thumb.webp`]))(
		'ships %s as a WebP of at most 480 KB',
		(file) => {
			const path = resolve(SKINS_DIR, file);
			const header = readFileSync(path).subarray(0, 12).toString('latin1');
			expect(header.slice(0, 4) + header.slice(8)).toBe('RIFFWEBP');
			expect(statSync(path).size).toBeLessThanOrEqual(MAX_ASSET_BYTES);
		}
	);
});

describe('applySkin', () => {
	it.each(CATALOGUE)('applies %s with its wallpaper and overlay', (id, _m, _c, _a, overlay) => {
		applySkin(id);

		expect(skinState()).toEqual({ skin: id, image: `url(/skins/${id}.webp)`, overlay });
	});

	it.each([null, 'removed-skin'])('clears the skin for %s without logging', (id) => {
		const spies = consoleSpies();
		applySkin('starfield');

		applySkin(id);

		expect(skinState()).toEqual(NONE);
		spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
	});

	it('does nothing without a document', () => {
		vi.stubGlobal('document', undefined);

		expect(() => applySkin('starfield')).not.toThrow();
		vi.unstubAllGlobals();
		expect(skinState()).toEqual(NONE);
	});
});

describe('selectSkin', () => {
	it.each([
		['olive-ops', 'dark'],
		['snow-plateau', 'light']
	])('selects %s, switches to %s and saves the whole ui object', async (id, mode) => {
		await selectSkin(id);

		expect(root().dataset.skin).toBe(id);
		expect(setTheme).toHaveBeenCalledTimes(1);
		expect(setTheme).toHaveBeenCalledWith(mode);
		expect(get(settings)).toEqual({ textScale: 1.25, skin: id });
		expect(localStorage.getItem('skin:user-1')).toBe(id);
		expect(updateUserSettings).toHaveBeenCalledTimes(1);
		expect(updateUserSettings).toHaveBeenCalledWith('token-1', {
			ui: { textScale: 1.25, skin: id }
		});
	});

	it('None clears the skin and mirror and leaves light/dark alone', async () => {
		await selectSkin('starfield');
		vi.clearAllMocks();

		await selectSkin(null);

		expect(skinState()).toEqual(NONE);
		expect(setTheme).not.toHaveBeenCalled();
		expect(localStorage.getItem('skin:user-1')).toBeNull();
		expect(updateUserSettings).toHaveBeenCalledTimes(1);
		expect(updateUserSettings).toHaveBeenCalledWith('token-1', {
			ui: { textScale: 1.25, skin: null }
		});
	});

	it('keeps the skin applied and toasts when the save is rejected', async () => {
		vi.mocked(updateUserSettings).mockRejectedValue('Server unavailable');

		await expect(selectSkin('glacier-lake')).resolves.toBeUndefined();

		expect(root().dataset.skin).toBe('glacier-lake');
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(toast.error).toHaveBeenCalledWith('Server unavailable');
	});
});

describe('layout restore', () => {
	beforeEach(() => localStorage.setItem('skin:user-1', 'starfield'));

	it('applies the mirror early and keeps it until settings arrive', () => {
		applySkinMirror();

		expect(root().dataset.skin).toBe('starfield');
		expect(localStorage.getItem('skin:user-1')).toBe('starfield');
	});

	it('never applies another user mirror', () => {
		signIn('user-2');

		applySkinMirror();

		expect(skinState()).toEqual(NONE);
	});

	it('lets settings win and refreshes the mirror', () => {
		applySkinMirror();

		restoreSkin('snow-plateau');

		expect(root().dataset.skin).toBe('snow-plateau');
		expect(localStorage.getItem('skin:user-1')).toBe('snow-plateau');
	});

	it.each([undefined, null, 'removed-skin'])(
		'treats a settings skin of %s as None and removes the mirror',
		(stored) => {
			const spies = consoleSpies();
			applySkinMirror();

			restoreSkin(stored);

			expect(skinState()).toEqual(NONE);
			expect(localStorage.getItem('skin:user-1')).toBeNull();
			spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
		}
	);
});
