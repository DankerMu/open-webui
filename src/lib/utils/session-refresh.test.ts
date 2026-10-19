import { describe, expect, it, vi } from 'vitest';
import { refreshSessionUser } from './session-refresh';

type User = { id: string };

describe('refreshSessionUser', () => {
	it('writes and returns a user returned by the lookup', async () => {
		const returned: User = { id: 'server-user' };
		const setUser = vi.fn();
		await expect(refreshSessionUser(async () => returned, setUser)).resolves.toBe(returned);
		expect(setUser).toHaveBeenCalledTimes(1);
		expect(setUser).toHaveBeenCalledWith(returned);
	});

	for (const missing of [null, undefined]) {
		it(`keeps the current user when the lookup resolves ${missing}`, async () => {
			const setUser = vi.fn();
			await expect(refreshSessionUser<User>(async () => missing, setUser)).resolves.toBeNull();
			expect(setUser).not.toHaveBeenCalled();
		});
	}

	it('propagates a thrown lookup error without writing the user', async () => {
		const failure = 'Not authenticated';
		const setUser = vi.fn();
		await expect(
			refreshSessionUser<User>(async () => Promise.reject(failure), setUser)
		).rejects.toBe(failure);
		expect(setUser).not.toHaveBeenCalled();
	});
});
