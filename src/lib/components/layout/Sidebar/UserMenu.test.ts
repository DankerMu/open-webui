// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { config, user } from '$lib/stores';
import { i18n } from '../../../../../test/ocu-workspace-fixtures';
import UserMenu from './UserMenu.svelte';

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://webui.test/') }) };
});
// Modal's real trap throws in jsdom: tabbable sees no client rects, so nothing is focusable.
vi.mock('focus-trap', () => ({
	createFocusTrap: () => {
		const trap = {
			activate: () => trap,
			deactivate: () => trap,
			pause: () => trap,
			unpause: () => trap
		};
		return trap;
	}
}));

const priorUser = {
	id: 'user-1',
	name: 'Alice',
	email: 'alice@example.com',
	role: 'user',
	profile_image_url: '/avatars/alice.png',
	permissions: {},
	status_emoji: '',
	status_message: 'In a meeting',
	token: 'session-a'
};

type SessionReply = () => Promise<Response>;
let mounted: ReturnType<typeof mount> | undefined;
const priorAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

function network(refresh: SessionReply) {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
		const path = new URL(String(input), 'http://webui.test').pathname;
		calls.push(path);
		if (path === '/api/v1/users/user/status/update') return Response.json({ status: true });
		if (path === '/api/v1/auths/') return refresh();
		throw new Error(`unexpected request ${path}`);
	});
	return calls;
}

function render() {
	mounted = mount(UserMenu, {
		target: document.body,
		context: new Map<unknown, unknown>([['i18n', i18n]]),
		props: { show: true, profile: true, role: 'user' }
	});
}

// The refresh write is the last step of both flows; let its continuation run before asserting.
async function settleRefresh(calls: string[]) {
	await vi.waitFor(() => expect(calls).toContain('/api/v1/auths/'));
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
}

async function saveStatus(refresh: SessionReply) {
	const calls = network(refresh);
	render();
	await tick();
	document.querySelector<HTMLButtonElement>('.user-menu-status > button')!.click();
	await vi.waitFor(() => expect(document.getElementById('status-message')).not.toBeNull());
	document
		.getElementById('status-message')!
		.closest('form')!
		.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	await settleRefresh(calls);
	expect(calls).toEqual(['/api/v1/users/user/status/update', '/api/v1/auths/']);
}

async function clearStatus(refresh: SessionReply) {
	const calls = network(refresh);
	render();
	await tick();
	const status = document.querySelector('.user-menu-status > button')!;
	const clear = [...status.querySelectorAll('button')].at(-1)!;
	clear.click();
	await settleRefresh(calls);
	expect(calls).toEqual(['/api/v1/users/user/status/update', '/api/v1/auths/']);
}

beforeEach(() => {
	// jsdom has no Web Animations; transitions finish on the next microtask.
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
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	localStorage.setItem('token', 'session-a');
	config.set(undefined);
	user.set(priorUser);
});

afterEach(async () => {
	if (mounted) unmount(mounted);
	mounted = undefined;
	await tick();
	document.body.replaceChildren();
	document.body.style.overflow = '';
	localStorage.clear();
	user.set(undefined);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	if (priorAnimate) Object.defineProperty(Element.prototype, 'animate', priorAnimate);
	else Reflect.deleteProperty(Element.prototype, 'animate');
});

const transportFailure: SessionReply = async () => Promise.reject(new TypeError('Failed to fetch'));

describe('UserMenu post-update session refresh', () => {
	for (const [flow, run] of [
		['status save', saveStatus],
		['status clear', clearStatus]
	] as const) {
		it(`keeps the user after a ${flow} when the refresh fails without a response`, async () => {
			await run(transportFailure);
			expect(get(user)).toBe(priorUser);
		});

		it(`replaces the user with the one returned after a ${flow}`, async () => {
			const refreshed = { ...priorUser, status_message: 'Back at my desk' };
			await run(async () => Response.json(refreshed));
			expect(get(user)).toEqual(refreshed);
		});
	}
});
