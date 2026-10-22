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
	redirectResponse?: { url: string; status: number };
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
type ResponseFields = Partial<Pick<WireRequest, 'status' | 'finished' | 'cors' | 'failure'>>;
type ResponseUpdate = { fields: ResponseFields; native?: NativeResponse };
// Response-side events seen before their requestWillBeSent; CDP does not order ExtraInfo or
// network-service events against the renderer's request event.
type PendingResponse = { fields: ResponseFields; natives: NativeResponse[]; events: string[] };

const UNMATCHED = '(no request)';

function responseUpdate(method: string, event: NetworkEvent): ResponseUpdate | undefined {
	if (method === 'Network.responseReceived' && event.response) {
		const headers = Object.fromEntries(
			Object.entries(event.response.headers).map(([name, value]) => [
				name.toLowerCase(),
				String(value)
			])
		);
		return {
			fields: { status: event.response.status },
			native: { ...event.response, headers }
		};
	}
	if (method === 'Network.responseReceivedExtraInfo')
		return { fields: { status: event.statusCode } };
	if (method === 'Network.loadingFinished') return { fields: { finished: true } };
	if (method === 'Network.loadingFailed')
		return { fields: { cors: event.corsErrorStatus?.corsError, failure: event.errorText } };
	return undefined;
}

export class WireRows {
	readonly rows = new Map<string, WireRequest>();
	readonly nativeResponses: NativeResponse[] = [];
	private readonly authority = new Map<string, WireAuthority>();
	private readonly pending = new Map<string, PendingResponse>();
	private readonly hits = new Map<string, Map<string, number>>();
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
	private observeRequest(key: string, event: NetworkEvent & { request: { url: string } }) {
		const { request } = event;
		const names = Object.keys(request.headers).map((name) => name.toLowerCase());
		const authority = this.authority.get(key);
		const origin = Object.entries(request.headers).find(
			([name]) => name.toLowerCase() === 'origin'
		)?.[1];
		const marker =
			origin === undefined ? authority?.origin : origin === 'null' ? 'null' : 'unexpected';
		const identity: WireRequest = {
			url: request.url,
			method: request.method,
			cookie: names.includes('cookie') || authority?.cookie === true,
			authorization: names.includes('authorization') || authority?.authorization === true,
			authorityObserved: authority !== undefined,
			origin: authority?.origin === 'unexpected' ? 'unexpected' : marker
		};
		const existing = this.rows.get(key);
		// A redirect hop reuses the requestId: it starts the next hop's response fields afresh,
		// while a repeated non-redirect request event keeps the response fields already recorded.
		if (existing && !event.redirectResponse) Object.assign(existing, identity);
		else this.rows.set(key, identity);
		const row = this.rows.get(key)!;
		const buffered = this.pending.get(key);
		if (buffered) {
			this.pending.delete(key);
			this.apply(row, { fields: buffered.fields });
			for (const native of buffered.natives) this.apply(row, { fields: {}, native });
			for (const name of buffered.events) this.count(name, row.url);
		}
		this.onRequest({ url: request.url, method: request.method });
	}
	private apply(row: WireRequest, update: ResponseUpdate) {
		Object.assign(row, update.fields);
		if (update.native) this.nativeResponses.push({ ...update.native, origin: row.origin });
	}
	private buffer(key: string, method: string, update: ResponseUpdate) {
		const entry = this.pending.get(key) ?? { fields: {}, natives: [], events: [] };
		Object.assign(entry.fields, update.fields);
		if (update.native) entry.natives.push(update.native);
		entry.events.push(method.replace(/^Network\./, ''));
		this.pending.set(key, entry);
	}
	private count(event: string, url: string) {
		const target = redactOcu(url);
		const events = this.hits.get(target) ?? new Map<string, number>();
		events.set(event, (events.get(event) ?? 0) + 1);
		this.hits.set(target, events);
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
			this.observeRequest(key, { ...event, request: event.request });
		const update = responseUpdate(method, event);
		if (!update) return;
		const row = this.rows.get(key);
		if (row) this.apply(row, update);
		else this.buffer(key, method, update);
	}
	/** Buffer hits per redacted probe URL and event type; never-matched events count under "(no request)". */
	bufferHits(): Record<string, Record<string, number>> {
		const hits = new Map([...this.hits].map(([url, events]) => [url, new Map(events)]));
		for (const entry of this.pending.values())
			for (const name of entry.events) {
				const events = hits.get(UNMATCHED) ?? new Map<string, number>();
				events.set(name, (events.get(name) ?? 0) + 1);
				hits.set(UNMATCHED, events);
			}
		return Object.fromEntries([...hits].map(([url, events]) => [url, Object.fromEntries(events)]));
	}
	clear() {
		this.rows.clear();
		this.authority.clear();
		this.pending.clear();
		this.hits.clear();
		this.nativeResponses.length = 0;
	}
}

export function formatBufferHits(hits: Record<string, Record<string, number>>): string {
	return redactOcu(`wire-buffer-hits ${JSON.stringify(hits)}`);
}

export type Refusal = {
	probe: number | string;
	url: string;
	method: string;
	status: number;
	visibility: 'cors' | 'authorization';
};

const CORS_ERROR = 'MissingAllowOriginHeader';
const CORS_FAILURE = 'net::ERR_FAILED';

const gap = (field: string, observed: unknown, expected: unknown) =>
	`${field}=${String(observed)}≠${String(expected)}`;

function corsGaps(row: WireRequest): string[] {
	return [
		...(row.cors === CORS_ERROR ? [] : [gap('cors', row.cors, CORS_ERROR)]),
		...(row.failure === CORS_FAILURE ? [] : [gap('failure', row.failure, CORS_FAILURE)])
	];
}

function readableGaps(row: WireRequest): string[] {
	return [
		...(row.status === 401 ? [] : [gap('status', row.status, 401)]),
		...(row.finished === true ? [] : [gap('finished', row.finished, true)]),
		...(row.cors ? [gap('cors', row.cors, 'absent')] : []),
		...(row.failure ? [gap('failure', row.failure, 'absent')] : [])
	];
}

/** Unmet refusal fields of a row with the probe's URL and method; empty means the row matches. */
function unmetRefusal(row: WireRequest, refusal: Refusal): string[] {
	const unmet = [
		...(row.status === refusal.status ? [] : [gap('status', row.status, refusal.status)]),
		...(row.authorityObserved ? [] : [gap('authorityObserved', row.authorityObserved, true)])
	];
	const cors = corsGaps(row);
	if (refusal.visibility === 'cors') return [...unmet, ...cors];
	const readable = readableGaps(row);
	if (cors.length && readable.length)
		unmet.push(`either (${cors.join(' ')}) or (${readable.join(' ')})`);
	return unmet;
}

export function matchesRefusal(row: WireRequest, refusal: Refusal): boolean {
	return (
		row.url === refusal.url &&
		row.method === refusal.method &&
		unmetRefusal(row, refusal).length === 0
	);
}

export function describeRefusal(refusal: Refusal, rows: WireRequest[]): string {
	const expected =
		`status=${refusal.status} authorityObserved=true cors=${CORS_ERROR} failure=${CORS_FAILURE}` +
		(refusal.visibility === 'authorization'
			? ` (or readable: status=401 finished=true, no cors/failure)`
			: '');
	const candidates = rows.filter((row) => row.url === refusal.url && row.method === refusal.method);
	const observed = candidates.length
		? candidates.map((row, index) => `row ${index + 1}: ${unmetRefusal(row, refusal).join(' ')}`)
		: ['no row'];
	return redactOcu(
		`refusal not observed for probe ${refusal.probe} ${refusal.method} ${refusal.url}; ` +
			`expected ${expected}; ${observed.join('; ')}`
	);
}
