/**
 * Post-update session refresh (#462): replace the current user only with a user the server
 * returned. `getSessionUser` resolves `null` on a transport failure without an error detail,
 * which must not read as sign-out; thrown lookup errors propagate to the caller unchanged.
 */
export async function refreshSessionUser<User>(
	lookup: () => Promise<User | null | undefined>,
	setUser: (user: User) => void
): Promise<User | null> {
	const result = await lookup();
	if (!result) return null;
	setUser(result);
	return result;
}
