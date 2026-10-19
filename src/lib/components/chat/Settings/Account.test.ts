// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { config, user } from '$lib/stores';
import { i18n } from '../../../../../test/ocu-workspace-fixtures';
import Account from './Account.svelte';

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Same name and a non-empty image keep the save off generateInitialsImage (canvas in jsdom).
const priorUser = {
	id: 'user-1',
	name: 'Alice',
	email: 'alice@example.com',
	role: 'user',
	profile_image_url: '/avatars/alice.png',
	permissions: {},
	token: 'session-a'
};

type SessionReply = () => Promise<Response>;
let mounted: ReturnType<typeof mount> | undefined;

function network(postSave: SessionReply) {
	const sessionLookups: string[] = [];
	const replies: SessionReply[] = [async () => Response.json(priorUser), postSave];
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
		const path = new URL(String(input), 'http://webui.test').pathname;
		if (path === '/api/v1/auths/') {
			sessionLookups.push(path);
			const reply = replies.shift();
			if (!reply) throw new Error('unexpected session lookup');
			return reply();
		}
		if (path === '/api/v1/users/user/variables') {
			return Response.json({ variables: { team: 'blue' } });
		}
		if (path === '/api/v1/auths/update/profile') return Response.json(priorUser);
		if (path === '/api/v1/users/user/variables/update') {
			return Response.json({ variables: { team: 'blue', region: 'north' } });
		}
		throw new Error(`unexpected request ${path}`);
	});
	return sessionLookups;
}

async function save(postSave: SessionReply) {
	const sessionLookups = network(postSave);
	const saveHandler = vi.fn();
	mounted = mount(Account, {
		target: document.body,
		context: new Map<unknown, unknown>([['i18n', i18n]]),
		props: { saveHandler }
	});
	await vi.waitFor(() => expect(document.body.textContent).toContain('team'));
	const button = [...document.querySelectorAll('button')].find(
		(node) => node.textContent?.trim() === 'Save'
	);
	button!.click();
	await vi.waitFor(() => expect(saveHandler).toHaveBeenCalledTimes(1));
	await tick();
	expect(sessionLookups).toHaveLength(2);
	return saveHandler;
}

// jsdom has no canvas: the first render (before the mount lookup fills profileImageUrl) asks
// generateInitialsImage for a placeholder; a blank 2d context fails its pixel test -> /user.png.
function stubCanvas() {
	vi.stubGlobal(
		'ImageData',
		class {
			data: Uint8ClampedArray;
			constructor(width: number, height: number) {
				this.data = new Uint8ClampedArray(width * height * 4);
			}
		}
	);
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
		putImageData: () => {},
		getImageData: () => ({ data: new Uint8ClampedArray(4) })
	} as unknown as CanvasRenderingContext2D);
}

beforeEach(() => {
	stubCanvas();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	localStorage.setItem('token', 'session-a');
	config.set(undefined);
	user.set(priorUser);
});

afterEach(() => {
	if (mounted) unmount(mounted);
	mounted = undefined;
	document.body.replaceChildren();
	localStorage.clear();
	user.set(undefined);
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.mocked(toast.error).mockClear();
});

describe('Account post-save session refresh', () => {
	it('keeps the user and the save result when the refresh fails without a response', async () => {
		const saveHandler = await save(async () => Promise.reject(new TypeError('Failed to fetch')));
		expect(get(user)).toBe(priorUser);
		expect(saveHandler).toHaveBeenCalledTimes(1);
		expect(document.body.textContent).toContain('region');
		expect(document.body.textContent).toContain('north');
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('replaces the user with the one the refresh returns', async () => {
		const refreshed = { ...priorUser, bio: 'saved bio' };
		await save(async () => Response.json(refreshed));
		expect(get(user)).toEqual(refreshed);
	});

	it('keeps the thrown-error handling when the refresh returns 401', async () => {
		const saveHandler = await save(async () =>
			Response.json({ detail: 'Not authenticated' }, { status: 401 })
		);
		expect(toast.error).toHaveBeenCalledWith('Not authenticated');
		expect(get(user)).toBeNull();
		expect(saveHandler).toHaveBeenCalledTimes(1);
	});
});
