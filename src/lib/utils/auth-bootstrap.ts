type FetchTarget = { fetch: typeof fetch };

type AuthBootstrapOptions<User> = {
	target: FetchTarget;
	origin: string;
	backendBaseUrl: string;
	sessionUrl: string;
	getToken: () => string | null;
	getUser: () => User | null | undefined;
	onUnauthorized: () => void;
};

type AuthSessionLease = {
	readonly token: string | null;
	isCurrent: () => boolean;
};

export type AuthBootstrapOwner<User> = {
	readonly active: boolean;
	readonly disposed: boolean;
	bootstrap: (
		lookup: (token: string) => Promise<User | null | undefined>,
		setUser: (value: User) => void
	) => Promise<AuthSessionLease | null>;
	retire: () => void;
	resume: () => void;
	dispose: () => void;
};

export function createAuthBootstrapOwner<User>(
	options: AuthBootstrapOptions<User>
): AuthBootstrapOwner<User> {
	const { target, getToken, getUser } = options;
	const originalFetch = target.fetch;
	const backendOrigin = new URL(options.backendBaseUrl || '/', options.origin).origin;
	let generation = 0;
	let active = true;
	let disposed = false;

	function capture() {
		const token = getToken();
		let user = getUser();
		const requestedGeneration = generation;
		return {
			token,
			isCurrent() {
				return (
					active &&
					!disposed &&
					generation === requestedGeneration &&
					getToken() === token &&
					getUser() === user
				);
			},
			adopt(value: User, setUser: (value: User) => void) {
				if (!this.isCurrent()) return false;
				setUser(value);
				user = value;
				return this.isCurrent();
			}
		};
	}

	function isAuthenticatedBackendFetch(input: RequestInfo | URL, init?: RequestInit) {
		try {
			const url = new URL(input instanceof Request ? input.url : String(input), options.origin);
			const headers = init?.headers
				? new Headers(init.headers)
				: input instanceof Request
					? input.headers
					: new Headers();
			return url.origin === backendOrigin && headers.has('authorization');
		} catch {
			return false;
		}
	}

	const ownedFetch: typeof fetch = async (input, init) => {
		const request = isAuthenticatedBackendFetch(input, init) ? capture() : null;
		const response = await originalFetch.call(target, input, init);
		if (response.status !== 401 || !request?.token || !request.isCurrent()) {
			return response;
		}

		const confirmation = capture();
		try {
			const probe = await originalFetch.call(target, options.sessionUrl, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${confirmation.token}`
				},
				credentials: 'include'
			});
			if (probe.status === 401 && request.isCurrent() && confirmation.isCurrent()) {
				options.onUnauthorized();
			}
		} catch {
			// A failed confirmation supplies no evidence that the session is invalid.
		}
		return response;
	};
	target.fetch = ownedFetch;

	return {
		get active() {
			return active && !disposed;
		},
		get disposed() {
			return disposed;
		},
		async bootstrap(
			lookup: (token: string) => Promise<User | null | undefined>,
			setUser: (value: User) => void
		) {
			const request = capture();
			if (!request.token || !request.isCurrent()) return null;
			let sessionUser: User | null | undefined;
			try {
				sessionUser = await lookup(request.token);
			} catch {
				return null;
			}
			return sessionUser && request.adopt(sessionUser, setUser) ? request : null;
		},
		retire() {
			active = false;
			generation += 1;
		},
		resume() {
			if (!disposed) active = true;
		},
		dispose() {
			this.retire();
			disposed = true;
			if (target.fetch === ownedFetch) target.fetch = originalFetch;
		}
	};
}
