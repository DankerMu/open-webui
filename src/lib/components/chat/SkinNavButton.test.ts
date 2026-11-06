// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { toast } from 'svelte-sonner';
import { i18n } from '../../../../test/ocu-workspace-fixtures';
import { settings } from '$lib/stores';
import { selectSkin } from '$lib/skins';
import SkinNavButton from './SkinNavButton.svelte';

vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('$lib/skins', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/skins')>()),
	selectSkin: vi.fn()
}));

// Expected names: the catalogue table in openspec/changes/webui-wallpaper-skins/design.md.
const NAMES = [
	['olive-ops', 'Olive Ops', '军绿作战'],
	['snow-plateau', 'Snow Plateau', '雪域高原'],
	['golden-peaks', 'Golden Peaks', '日照金山'],
	['cloud-watch', 'Cloud Watch', '云观天象'],
	['river-hydrology', 'River Hydrology', '江河水文'],
	['terrain-grid', 'Terrain Grid', '山川经纬'],
	['glacier-lake', 'Glacier Lake', '冰川冰湖'],
	['starfield', 'Starfield', '星空观测'],
	['minimal-terrain', 'Minimal Terrain', '简约地形']
] as const;

let component: Record<string, unknown> | undefined;

const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Skin"]')!;
const menu = () => document.querySelector('[role="menu"]');
const tiles = () => [...(menu()?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
const tileState = () =>
	tiles().map((tile) => [
		tile.textContent?.trim(),
		tile.querySelector('img')?.getAttribute('src') ?? null,
		tile.getAttribute('aria-pressed')
	]);

async function open() {
	trigger().click();
	await tick();
	await tick();
	expect(menu()).not.toBeNull();
}

function render(skin?: string | null) {
	settings.set(skin === undefined ? {} : { skin });
	component = mount(SkinNavButton, {
		target: document.body,
		context: new Map<unknown, unknown>([['i18n', i18n]])
	});
	flushSync();
}

const priorAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeEach(() => {
	// jsdom has no Web Animations; the popover transition finishes on the next microtask.
	Object.defineProperty(Element.prototype, 'animate', {
		configurable: true,
		value: () => {
			const animation = { currentTime: 0, playState: 'finished', effect: null, cancel: () => {} };
			queueMicrotask(() => (animation as { onfinish?: () => void }).onfinish?.());
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
	vi.mocked(selectSkin).mockResolvedValue(true);
});

afterEach(async () => {
	if (priorAnimate) Object.defineProperty(Element.prototype, 'animate', priorAnimate);
	else Reflect.deleteProperty(Element.prototype, 'animate');
	vi.unstubAllGlobals();
	if (component) await unmount(component);
	component = undefined;
	vi.clearAllMocks();
	document.body.replaceChildren();
});

describe('navbar skin picker', () => {
	it('is a palette icon button named and tooltipped Skin', async () => {
		render();
		const button = trigger();
		expect(button.type).toBe('button');
		expect(button.textContent?.trim()).toBe('');
		expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
		expect(menu()).toBeNull();
		button.parentElement!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
		await vi.waitFor(() =>
			expect(document.querySelector('.tippy-content')?.textContent).toBe('Skin')
		);
	});

	it('lists None and the nine skins with names and thumbnails, None pressed by default', async () => {
		render();
		await open();
		expect(tileState()).toEqual([
			['None', null, 'true'],
			...NAMES.map(([id, name]) => [name, `/skins/${id}-thumb.webp`, 'false'])
		]);
		tiles().forEach((tile) => expect(tile.type).toBe('button'));
		menu()!
			.querySelectorAll('img')
			.forEach((img) => expect(img.getAttribute('alt')).toBe(''));
	});

	it.each([
		['glacier-lake', 7],
		['removed-skin', 0],
		[null, 0]
	])('marks the current skin %s as pressed and follows the settings store', async (skin, index) => {
		render(skin);
		await open();
		expect(tiles().map((tile) => tile.getAttribute('aria-pressed') === 'true')).toEqual(
			tiles().map((_tile, i) => i === index)
		);
		settings.set({ skin: 'starfield' });
		flushSync();
		expect(tiles()[8].getAttribute('aria-pressed')).toBe('true');
		expect(tiles().filter((tile) => tile.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
	});

	it.each([
		[2, 'snow-plateau'],
		[0, null]
	])('applies tile %i via selectSkin(%s), stays open and does not toast', async (index, id) => {
		render('olive-ops');
		await open();
		tiles()[index].click();
		await vi.waitFor(() => expect(selectSkin).toHaveBeenCalledWith(id));
		await tick();
		expect(selectSkin).toHaveBeenCalledTimes(1);
		expect(menu()).not.toBeNull();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('toasts Failed to update settings when the save fails', async () => {
		vi.mocked(selectSkin).mockResolvedValue(false);
		render();
		await open();
		tiles()[1].click();
		await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update settings'));
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(menu()).not.toBeNull();
	});

	it('closes on Escape and on an outside click', async () => {
		render();
		await open();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await vi.waitFor(() => expect(menu()).toBeNull());
		await open();
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		await vi.waitFor(() => expect(menu()).toBeNull());
		expect(selectSkin).not.toHaveBeenCalled();
	});
});

describe('skin names', () => {
	const source = readFileSync(resolve(__dirname, 'SkinNavButton.svelte'), 'utf8');
	const zh = JSON.parse(
		readFileSync(resolve(__dirname, '../../i18n/locales/zh-CN/translation.json'), 'utf8')
	);

	it.each(NAMES)('%s is a literal i18n call translated to zh-CN', (id, name, chinese) => {
		expect(source).toMatch(new RegExp(`'?${id}'?: \\$i18n\\.t\\('${name}'\\)`));
		expect(zh[name]).toBe(chinese);
	});

	it('translates the button name', () => {
		expect(zh.Skin).toBe('皮肤');
	});
});
