import { describe, expect, it } from 'vitest';
import {
	WireRows,
	describeRefusal,
	formatBufferHits,
	matchesRefusal,
	type Refusal,
	type WireRequest
} from './ocu-wire-rows';

type Step = [method: string, payload: Record<string, unknown>];

const ORIGIN = 'http://localhost:5173';
const DENIED = `${ORIGIN}/ocu/api/denial-probe`;
const RESOURCE = `${ORIGIN}/ocu/f/grant-token/chat-1/style.css`;
const CANONICAL = `${ORIGIN}/ocu/files/chat-1/page.html`;
const GRANTED = `${ORIGIN}/ocu/f/grant-token/chat-1/page.html`;

// A CORS-refused POST probe: the 403 is only visible on responseReceivedExtraInfo and the
// refusal on loadingFailed; Chromium sends no responseReceived for it.
const refused = {
	request: [
		'Network.requestWillBeSent',
		{
			requestId: 'probe-1',
			request: {
				url: DENIED,
				method: 'POST',
				headers: { Origin: 'null', 'Content-Type': 'text/plain' }
			}
		}
	],
	authority: [
		'Network.requestWillBeSentExtraInfo',
		{
			requestId: 'probe-1',
			headers: { Origin: 'null', 'Content-Type': 'text/plain', Host: 'localhost:5173' }
		}
	],
	status: [
		'Network.responseReceivedExtraInfo',
		{ requestId: 'probe-1', statusCode: 403, headers: { 'content-type': 'text/plain' } }
	],
	failed: [
		'Network.loadingFailed',
		{
			requestId: 'probe-1',
			errorText: 'net::ERR_FAILED',
			corsErrorStatus: { corsError: 'MissingAllowOriginHeader' }
		}
	]
} satisfies Record<string, Step>;

const refusedRow: WireRequest = {
	url: DENIED,
	method: 'POST',
	origin: 'null',
	status: 403,
	cookie: false,
	authorization: false,
	authorityObserved: true,
	cors: 'MissingAllowOriginHeader',
	failure: 'net::ERR_FAILED'
};

// A readable granted resource: responseReceived carries the headers the resource checks read.
const readable = {
	request: [
		'Network.requestWillBeSent',
		{
			requestId: 'resource-1',
			request: { url: RESOURCE, method: 'GET', headers: { Origin: 'null' } }
		}
	],
	authority: [
		'Network.requestWillBeSentExtraInfo',
		{ requestId: 'resource-1', headers: { Origin: 'null', Accept: 'text/css' } }
	],
	response: [
		'Network.responseReceived',
		{
			requestId: 'resource-1',
			response: {
				url: RESOURCE,
				status: 200,
				headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'null' }
			}
		}
	],
	status: [
		'Network.responseReceivedExtraInfo',
		{ requestId: 'resource-1', statusCode: 200, headers: {} }
	],
	finished: ['Network.loadingFinished', { requestId: 'resource-1' }]
} satisfies Record<string, Step>;

const readableRow: WireRequest = {
	url: RESOURCE,
	method: 'GET',
	origin: 'null',
	status: 200,
	cookie: false,
	authorization: false,
	authorityObserved: true,
	finished: true
};

const readableNative = {
	url: RESOURCE,
	status: 200,
	headers: { 'cache-control': 'no-store', 'access-control-allow-origin': 'null' },
	origin: 'null'
};

function replay(steps: Step[], session?: string) {
	const requests: Array<{ url: string; method: string }> = [];
	const wires = new WireRows((request) => requests.push(request));
	const snapshots: WireRequest[] = [];
	for (const [method, payload] of steps) {
		wires.observe(method, payload, session);
		snapshots.push(...[...wires.rows.values()].map((row) => ({ ...row })));
	}
	return {
		wires,
		rows: [...wires.rows.values()],
		native: wires.nativeResponses,
		requests,
		snapshots
	};
}

describe('wire rows do not depend on CDP event order', () => {
	it('(a1) keeps a 403 and CORS refusal whose status arrives before the request', () => {
		const { rows } = replay([refused.status, refused.request, refused.authority, refused.failed]);
		expect(rows).toEqual([refusedRow]);
	});

	it('(a2) keeps a CORS refusal whose loadingFailed arrives before the request', () => {
		const { rows } = replay([refused.failed, refused.request, refused.authority, refused.status]);
		expect(rows).toEqual([refusedRow]);
	});

	it('(a3) keeps a responseReceived that arrives before the request, with its origin', () => {
		const { rows, native } = replay([
			readable.response,
			readable.request,
			readable.authority,
			readable.status,
			readable.finished
		]);
		expect(rows).toEqual([readableRow]);
		expect(native).toEqual([readableNative]);
	});

	describe('(a4) in-order control', () => {
		it('records a CORS-refused probe', () => {
			const { rows, requests } = replay([
				refused.request,
				refused.authority,
				refused.status,
				refused.failed
			]);
			expect(rows).toEqual([refusedRow]);
			expect(requests).toEqual([{ url: DENIED, method: 'POST' }]);
		});

		it('records a readable resource and its native response', () => {
			const { rows, native, requests } = replay([
				readable.request,
				readable.authority,
				readable.response,
				readable.status,
				readable.finished
			]);
			expect(rows).toEqual([readableRow]);
			expect(native).toEqual([readableNative]);
			expect(requests).toEqual([{ url: RESOURCE, method: 'GET' }]);
		});
	});

	it('(a5) describes the last redirect hop and never puts the 302 on the next hop', () => {
		// CDP reuses the requestId for the next hop and sends no responseReceived for the 302 hop.
		const { rows, native, snapshots } = replay(
			[
				[
					'Network.requestWillBeSent',
					{ requestId: 'nav-1', request: { url: CANONICAL, method: 'GET', headers: {} } }
				],
				[
					'Network.responseReceivedExtraInfo',
					{ requestId: 'nav-1', statusCode: 302, headers: { location: GRANTED } }
				],
				[
					'Network.requestWillBeSent',
					{
						requestId: 'nav-1',
						request: { url: GRANTED, method: 'GET', headers: {} },
						redirectResponse: { url: CANONICAL, status: 302, headers: { Location: GRANTED } }
					}
				],
				[
					'Network.responseReceived',
					{
						requestId: 'nav-1',
						response: { url: GRANTED, status: 200, headers: { 'Content-Type': 'text/html' } }
					}
				]
			],
			'popup-session'
		);
		expect(snapshots.filter((row) => row.url === GRANTED && row.status === 302)).toEqual([]);
		expect(rows).toEqual([
			{
				url: GRANTED,
				method: 'GET',
				status: 200,
				cookie: false,
				authorization: false,
				authorityObserved: false
			}
		]);
		expect(native).toEqual([
			{ url: GRANTED, status: 200, headers: { 'content-type': 'text/html' } }
		]);
	});
});

describe('refusal diagnostics', () => {
	const corsProbe: Refusal = {
		probe: 1,
		url: `${ORIGIN}/ocu/f/secret-grant/chat-1/denied`,
		method: 'POST',
		status: 403,
		visibility: 'cors'
	};
	const authorizationProbe: Refusal = {
		probe: 0,
		url: DENIED,
		method: 'POST',
		status: 401,
		visibility: 'authorization'
	};
	const readable401: WireRequest = {
		url: DENIED,
		method: 'POST',
		origin: 'null',
		status: 401,
		cookie: false,
		authorization: false,
		authorityObserved: true,
		finished: true
	};

	it('keeps the refusal predicate meanings', () => {
		expect(matchesRefusal(refusedRow, { ...corsProbe, url: DENIED })).toBe(true);
		expect(matchesRefusal(readable401, authorizationProbe)).toBe(true);
		expect(matchesRefusal(readable401, { ...authorizationProbe, visibility: 'cors' })).toBe(false);
		expect(matchesRefusal({ ...refusedRow, status: 401 }, authorizationProbe)).toBe(true);
		expect(
			matchesRefusal({ ...refusedRow, authorityObserved: false }, { ...corsProbe, url: DENIED })
		).toBe(false);
		expect(matchesRefusal({ ...refusedRow, method: 'GET' }, { ...corsProbe, url: DENIED })).toBe(
			false
		);
	});

	it('names the probe, the redacted URL and "no row" when nothing has the URL and method', () => {
		expect(
			describeRefusal(corsProbe, [refusedRow, { ...refusedRow, url: corsProbe.url, method: 'GET' }])
		).toBe(
			'refusal not observed for probe 1 POST http://localhost:5173/ocu/f/[grant]/chat-1/denied; ' +
				'expected status=403 authorityObserved=true cors=MissingAllowOriginHeader failure=net::ERR_FAILED; no row'
		);
	});

	it('lists each unmet field with authority only as presence', () => {
		const partial: WireRequest = {
			url: corsProbe.url,
			method: 'POST',
			origin: 'null',
			cookie: true,
			authorization: true,
			authorityObserved: false
		};
		expect(
			describeRefusal(corsProbe, [
				partial,
				{ ...partial, status: 403, authorityObserved: true, cors: 'MissingAllowOriginHeader' }
			])
		).toBe(
			'refusal not observed for probe 1 POST http://localhost:5173/ocu/f/[grant]/chat-1/denied; ' +
				'expected status=403 authorityObserved=true cors=MissingAllowOriginHeader failure=net::ERR_FAILED; ' +
				'row 1: status=undefined≠403 authorityObserved=false≠true cors=undefined≠MissingAllowOriginHeader failure=undefined≠net::ERR_FAILED; ' +
				'row 2: failure=undefined≠net::ERR_FAILED'
		);
	});

	it('names both acceptable refusals when an authorization probe meets neither', () => {
		expect(describeRefusal(authorizationProbe, [{ ...readable401, finished: undefined }])).toBe(
			'refusal not observed for probe 0 POST http://localhost:5173/ocu/api/denial-probe; ' +
				'expected status=401 authorityObserved=true cors=MissingAllowOriginHeader failure=net::ERR_FAILED ' +
				'(or readable: status=401 finished=true, no cors/failure); ' +
				'row 1: either (cors=undefined≠MissingAllowOriginHeader failure=undefined≠net::ERR_FAILED) or (finished=undefined≠true)'
		);
	});
});

describe('buffer-hit record', () => {
	it('counts an early response-side event under its redacted probe URL and event type', () => {
		const { wires } = replay([refused.status, refused.request, refused.authority, refused.failed]);
		expect(wires.bufferHits()).toEqual({ [DENIED]: { responseReceivedExtraInfo: 1 } });
		expect(formatBufferHits(wires.bufferHits())).toBe(
			'wire-buffer-hits {"http://localhost:5173/ocu/api/denial-probe":{"responseReceivedExtraInfo":1}}'
		);
	});

	it('redacts grant segments and reports an empty record for in-order events', () => {
		const early = replay([readable.response, readable.finished, readable.request]);
		expect(early.wires.bufferHits()).toEqual({
			'http://localhost:5173/ocu/f/[grant]/chat-1/style.css': {
				responseReceived: 1,
				loadingFinished: 1
			}
		});
		expect(formatBufferHits(early.wires.bufferHits())).toBe(
			'wire-buffer-hits {"http://localhost:5173/ocu/f/[grant]/chat-1/style.css":{"responseReceived":1,"loadingFinished":1}}'
		);
		const ordered = replay([readable.request, readable.response, readable.finished]);
		expect(formatBufferHits(ordered.wires.bufferHits())).toBe('wire-buffer-hits {}');
		expect(formatBufferHits({ [`${ORIGIN}/ocu/f/raw-token/a`]: { loadingFailed: 2 } })).toBe(
			'wire-buffer-hits {"http://localhost:5173/ocu/f/[grant]/a":{"loadingFailed":2}}'
		);
	});

	it('reports buffered events whose request never arrived', () => {
		const { wires, rows } = replay([refused.failed]);
		expect(rows).toEqual([]);
		expect(wires.bufferHits()).toEqual({ '(no request)': { loadingFailed: 1 } });
	});

	it('clears rows, buffers, native responses and hits on dispose', () => {
		const { wires } = replay([
			refused.status,
			readable.request,
			readable.response,
			readable.authority
		]);
		wires.clear();
		expect([wires.rows.size, wires.nativeResponses.length, wires.bufferHits()]).toEqual([0, 0, {}]);
		wires.observe(...refused.request);
		expect([...wires.rows.values()]).toEqual([
			{
				url: DENIED,
				method: 'POST',
				origin: 'null',
				cookie: false,
				authorization: false,
				authorityObserved: false
			}
		]);
	});
});
