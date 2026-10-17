import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSessionUser } from '../apis/auths';
import { createAuthBootstrapOwner } from './auth-bootstrap';
import type { AuthBootstrapOwner } from './auth-bootstrap';

type User = { id: string };
const owners: AuthBootstrapOwner<User>[] = [];

afterEach(() => {
	for (const owner of owners.splice(0).reverse()) owner.dispose();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function fixture(network: typeof fetch) {
	vi.stubGlobal('fetch', network);
	const state: { token: string | null; user: User | null; invalidations: number } = {
		token: 'session-a',
		user: null,
		invalidations: 0
	};
	const options = {
		target: globalThis,
		origin: 'https://webui.example',
		backendBaseUrl: '',
		sessionUrl: '/api/v1/auths/',
		getToken: () => state.token,
		getUser: () => state.user,
		onUnauthorized: () => {
			state.invalidations += 1;
			state.token = null;
			state.user = null;
		}
	};
	const owner = createAuthBootstrapOwner<User>(options);
	owners.push(owner);
	return {
		owner,
		state,
		options,
		bootstrap: () => owner.bootstrap(getSessionUser, (value) => (state.user = value))
	};
}

describe('root bootstrap ownership', () => {
	it('adopts the real session and retains its own post-adoption lease', async () => {
		const held = Promise.withResolvers<Response>();
		const { bootstrap, state } = fixture(() => held.promise);
		const pending = bootstrap();
		held.resolve(Response.json({ id: 'server-user' }));
		const lease = await pending;
		expect(state.user).toEqual({ id: 'server-user' });
		expect(lease?.isCurrent()).toBe(true);
		expect(lease?.token).toBe('session-a');
		state.user = { id: 'newer-user' };
		expect(lease?.isCurrent()).toBe(false);
	});

	for (const [name, response] of [
		['transport rejection', () => Promise.reject(new TypeError('Failed to fetch'))],
		['AbortError', () => Promise.reject(new DOMException('Aborted', 'AbortError'))],
		['HTTP 503', () => Promise.resolve(Response.json({ detail: 'Unavailable' }, { status: 503 }))],
		['unparseable session', () => Promise.resolve(new Response('{invalid', { status: 200 }))]
	] as const) {
		it(`preserves an unverified session after ${name}`, async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const held = Promise.withResolvers<Response>();
			const { bootstrap, state } = fixture(() => held.promise);
			const pending = bootstrap();
			response().then(held.resolve, held.reject);
			expect(await pending).toBeNull();
			expect(state).toEqual({ token: 'session-a', user: null, invalidations: 0 });
		});
	}

	for (const replacement of ['token', 'user'] as const) {
		for (const completion of ['success', 'failure'] as const) {
			it(`does not adopt or erase a replacement ${replacement} after delayed ${completion}`, async () => {
				vi.spyOn(console, 'error').mockImplementation(() => {});
				const held = Promise.withResolvers<Response>();
				const { bootstrap, state } = fixture(() => held.promise);
				const pending = bootstrap();
				state.user = { id: 'replacement-user' };
				if (replacement === 'token') state.token = 'session-b';
				if (completion === 'success') held.resolve(Response.json({ id: 'obsolete-user' }));
				else held.reject(new TypeError('Failed to fetch'));
				expect(await pending).toBeNull();
				expect(state.user).toEqual({ id: 'replacement-user' });
				expect(state.token).toBe(replacement === 'token' ? 'session-b' : 'session-a');
				expect(state.invalidations).toBe(0);
			});
		}
	}

	it('retirement fences old bootstrap results while restoration admits fresh work', async () => {
		const held = Promise.withResolvers<Response>();
		let calls = 0;
		const { bootstrap, owner, state } = fixture(() => {
			calls += 1;
			return calls === 1 ? held.promise : Promise.resolve(Response.json({ id: 'restored-user' }));
		});
		const pending = bootstrap();
		owner.retire();
		expect(await bootstrap()).toBeNull();
		owner.resume();
		held.resolve(Response.json({ id: 'retired-user' }));
		expect(await pending).toBeNull();
		expect(state.user).toBeNull();
		await bootstrap();
		expect(state.user).toEqual({ id: 'restored-user' });
	});

	it('does not request a session after credentials have been cleared', async () => {
		let requests = 0;
		const { bootstrap, state } = fixture(async () => {
			requests += 1;
			return Response.json({ id: 'unexpected-user' });
		});
		state.token = null;
		expect(await bootstrap()).toBeNull();
		expect(requests).toBe(0);
		expect(state.user).toBeNull();
	});
});

describe('authenticated request confirmation ownership', () => {
	it('preserves request credentials and clears only after a current real 401 confirmation', async () => {
		const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
		const { state } = fixture(async (input, init) => {
			requests.push({ input, init });
			return new Response(null, { status: 401 });
		});
		state.user = { id: 'server-user' };
		const request = new Request('https://webui.example/api/private', {
			headers: { Authorization: 'Bearer session-a' },
			credentials: 'include'
		});
		await fetch(request);
		expect(requests[0].input).toBe(request);
		expect((requests[0].input as Request).credentials).toBe('include');
		expect(requests[1]).toEqual({
			input: '/api/v1/auths/',
			init: {
				method: 'GET',
				headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session-a' },
				credentials: 'include'
			}
		});
		expect(state).toEqual({ token: null, user: null, invalidations: 1 });
	});

	it('clears a bootstrap token only through independently confirmed 401', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { bootstrap, state } = fixture(async () =>
			Response.json({ detail: 'Invalid session' }, { status: 401 })
		);
		expect(await bootstrap()).toBeNull();
		expect(state).toEqual({ token: null, user: null, invalidations: 1 });
	});

	for (const failure of ['transport', 'non-401'] as const) {
		it(`does not invalidate when confirmation has ${failure} failure`, async () => {
			let calls = 0;
			const { state } = fixture(async () => {
				calls += 1;
				if (calls === 1) return new Response(null, { status: 401 });
				if (failure === 'transport') throw new TypeError('Failed to fetch');
				return new Response(null, { status: 503 });
			});
			state.user = { id: 'server-user' };
			await fetch('/api/private', { headers: { Authorization: 'Bearer session-a' } });
			expect(state).toEqual({
				token: 'session-a',
				user: { id: 'server-user' },
				invalidations: 0
			});
		});
	}

	for (const replacement of ['token', 'user', 'retirement'] as const) {
		it(`never starts an obsolete response's confirmation after ${replacement}`, async () => {
			const held = Promise.withResolvers<Response>();
			let calls = 0;
			const { state, owner } = fixture(() => {
				calls += 1;
				return held.promise;
			});
			const pending = fetch('/api/private', { headers: { Authorization: 'Bearer session-a' } });
			if (replacement === 'token') state.token = 'session-b';
			if (replacement === 'user') state.user = { id: 'replacement-user' };
			if (replacement === 'retirement') {
				owner.retire();
				owner.resume();
			}
			held.resolve(new Response(null, { status: 401 }));
			await pending;
			expect(calls).toBe(1);
			expect(state.invalidations).toBe(0);
		});

		it(`never commits an obsolete confirmation after ${replacement}`, async () => {
			const held = Promise.withResolvers<Response>();
			const started = Promise.withResolvers<void>();
			let calls = 0;
			const { state, owner } = fixture(async () => {
				calls += 1;
				if (calls === 1) return new Response(null, { status: 401 });
				started.resolve();
				return held.promise;
			});
			const pending = fetch('/api/private', { headers: { Authorization: 'Bearer session-a' } });
			await started.promise;
			if (replacement === 'token') state.token = 'session-b';
			if (replacement === 'user') state.user = { id: 'replacement-user' };
			if (replacement === 'retirement') {
				owner.retire();
				owner.resume();
			}
			held.resolve(new Response(null, { status: 401 }));
			await pending;
			expect(state.invalidations).toBe(0);
			expect(state.token).toBe(replacement === 'token' ? 'session-b' : 'session-a');
			if (replacement === 'user') expect(state.user).toEqual({ id: 'replacement-user' });
		});
	}

	for (const [url, headers] of [
		['https://foreign.example/api/private', { Authorization: 'Bearer session-a' }],
		['/api/public', {}]
	] as const) {
		it(`does not probe an unauthenticated or foreign request to ${url}`, async () => {
			let calls = 0;
			const { state } = fixture(async () => {
				calls += 1;
				return new Response(null, { status: 401 });
			});
			await fetch(url, { headers });
			expect(calls).toBe(1);
			expect(state.token).toBe('session-a');
		});
	}

	it('honors init header replacement rather than a Request authorization header', async () => {
		let calls = 0;
		fixture(async () => {
			calls += 1;
			return new Response(null, { status: 401 });
		});
		await fetch(
			new Request('https://webui.example/api/private', {
				headers: { Authorization: 'Bearer session-a' }
			}),
			{ headers: {} }
		);
		expect(calls).toBe(1);
	});

	it('old disposal cannot remove a newer wrapper or revive retired invalidation', async () => {
		const { owner, options, state } = fixture(async () => new Response(null, { status: 401 }));
		const next = createAuthBootstrapOwner<User>(options);
		owners.push(next);
		const newerFetch = globalThis.fetch;
		owner.dispose();
		expect(globalThis.fetch).toBe(newerFetch);
		await fetch('/api/private', { headers: { Authorization: 'Bearer session-a' } });
		expect(state.invalidations).toBe(1);
		next.dispose();
		owner.resume();
		expect(owner.active).toBe(false);
		state.token = 'replacement';
		await fetch('/api/private', { headers: { Authorization: 'Bearer replacement' } });
		expect(state.token).toBe('replacement');
		expect(state.invalidations).toBe(1);
	});
});
