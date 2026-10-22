// Side-effect-free CDP wire-row bookkeeping for the OCU browser observers. Importing this module
// must not require OCU_E2E_CONTEXT (ocu-fixtures.ts throws without it), so it imports nothing.

export function redactOcu(text: string): string {
	return text
		.replace(/\/ocu\/f\/[^/\s"'<>?#]+/g, '/ocu/f/[grant]')
		.replace(/wss?:\/\/[^\s"'<>]+\/devtools\/[^\s"'<>]+/g, '[private CDP endpoint]');
}

type NetworkEvent = {
	requestId?: string;
	request?: { url: string; method: string; headers: Record<string, string> };
	response?: { url: string; status: number; headers: Record<string, string> };
	headers?: Record<string, string>;
	statusCode?: number;
	corsErrorStatus?: { corsError: string };
	errorText?: string;
};

export type WireRequest = {
	url: string;
	method: string;
	origin?: string;
	status?: number;
	cookie: boolean;
	authorization: boolean;
	authorityObserved: boolean;
	finished?: boolean;
	cors?: string;
	failure?: string;
};

type NativeResponse = {
	url: string;
	status: number;
	headers: Record<string, string>;
	origin?: string;
};

type WireAuthority = { cookie: boolean; authorization: boolean; origin?: string };

export class WireRows {
	readonly rows = new Map<string, WireRequest>();
	readonly nativeResponses: NativeResponse[] = [];
	private readonly authority = new Map<string, WireAuthority>();
	constructor(private readonly onRequest: (request: { url: string; method: string }) => void) {}
	private observeAuthority(key: string, headers: Record<string, string>) {
		// Keep presence only; private Cookie/Authorization values must not enter diagnostics.
		const names = Object.keys(headers).map((name) => name.toLowerCase());
		const origin = Object.entries(headers).find(([name]) => name.toLowerCase() === 'origin')?.[1];
		const authority = {
			cookie: names.includes('cookie'),
			authorization: names.includes('authorization'),
			origin: origin === undefined ? undefined : origin === 'null' ? 'null' : 'unexpected'
		};
		this.authority.set(key, authority);
		const observed = this.rows.get(key);
		if (observed) {
			observed.cookie ||= authority.cookie;
			observed.authorization ||= authority.authorization;
			observed.authorityObserved = true;
			if (observed.origin !== 'unexpected') observed.origin = authority.origin ?? observed.origin;
		}
	}
	private observeRequest(key: string, request: NonNullable<NetworkEvent['request']>) {
		const names = Object.keys(request.headers).map((name) => name.toLowerCase());
		const authority = this.authority.get(key);
		const origin = Object.entries(request.headers).find(
			([name]) => name.toLowerCase() === 'origin'
		)?.[1];
		const marker =
			origin === undefined ? authority?.origin : origin === 'null' ? 'null' : 'unexpected';
		this.rows.set(key, {
			url: request.url,
			method: request.method,
			cookie: names.includes('cookie') || authority?.cookie === true,
			authorization: names.includes('authorization') || authority?.authorization === true,
			authorityObserved: authority !== undefined,
			origin: authority?.origin === 'unexpected' ? 'unexpected' : marker
		});
		this.onRequest({ url: request.url, method: request.method });
	}
	private observeResponse(row: WireRequest, response: NonNullable<NetworkEvent['response']>) {
		row.status = response.status;
		this.nativeResponses.push({
			...response,
			origin: row.origin,
			headers: Object.fromEntries(
				Object.entries(response.headers).map(([name, value]) => [name.toLowerCase(), String(value)])
			)
		});
	}
	observe(method: string, payload: unknown, session = 'native') {
		const event = payload as NetworkEvent;
		if (!event.requestId) return;
		const key = `${session}:${event.requestId}`;
		if (method === 'Network.requestWillBeSentExtraInfo' && event.headers) {
			this.observeAuthority(key, event.headers);
			return;
		}
		if (method === 'Network.requestWillBeSent' && event.request)
			this.observeRequest(key, event.request);
		const row = this.rows.get(key);
		if (!row) return;
		if (method === 'Network.responseReceived' && event.response)
			this.observeResponse(row, event.response);
		if (method === 'Network.responseReceivedExtraInfo') row.status = event.statusCode;
		if (method === 'Network.loadingFinished') row.finished = true;
		if (method === 'Network.loadingFailed') {
			row.cors = event.corsErrorStatus?.corsError;
			row.failure = event.errorText;
		}
	}
}
