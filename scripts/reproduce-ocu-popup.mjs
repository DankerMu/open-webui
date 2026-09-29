import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const REPORT = '.run/ocu-popup-repro/report.json';
const TYPES = ['html', 'svg'];
const VARIANTS = ['sandbox', 'plain'];
const ATTEMPTS_PER_PAIR = 10;
const WAIT_MS = 3_000;
const CSP = 'sandbox allow-scripts allow-forms';
const script = `
let storage = 'blocked', parentAccess = 'blocked', cookie = 'blocked';
try { localStorage.getItem('fixture'); storage = 'leaked'; } catch {}
try { window.parent.localStorage.getItem('fixture'); parentAccess = 'leaked'; } catch {}
try { cookie = document.cookie || 'blocked'; } catch {}
document.querySelector('#proof').textContent = [self.origin, storage, parentAccess, cookie].join('|');
`;
const documents = {
	html: Buffer.from(
		`<!doctype html><html><body><span id="proof"></span><script>${script}</script></body></html>`
	),
	svg: Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text id="proof">waiting</text><script><![CDATA[${script}]]></script></svg>`
	)
};

function pathname(raw, origin) {
	try {
		const url = new URL(raw);
		return url.origin === origin ? url.pathname : null;
	} catch {
		return null;
	}
}

function proofSummary(text, origin) {
	if (typeof text !== 'string') return null;
	const [documentOrigin, storage, parentAccess, cookie] = text.split('|');
	const access = (value) => (['blocked', 'leaked'].includes(value) ? value : 'other');
	return {
		origin:
			documentOrigin === 'null' ? 'opaque' : documentOrigin === origin ? 'same-origin' : 'other',
		storage: access(storage),
		parentAccess: access(parentAccess),
		cookie:
			cookie === 'blocked'
				? 'blocked'
				: cookie?.includes('fixture=present')
					? 'fixture-visible'
					: 'other'
	};
}

function expectedProof(variant) {
	return variant === 'sandbox'
		? { origin: 'opaque', storage: 'blocked', parentAccess: 'blocked', cookie: 'blocked' }
		: {
				origin: 'same-origin',
				storage: 'leaked',
				parentAccess: 'leaked',
				cookie: 'fixture-visible'
			};
}

function matchesProof(actual, expected) {
	return actual && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function hasDocument(arrival) {
	return arrival?.status === 200 && arrival.cookie === true;
}

function failedClassification(variant) {
	return variant === 'sandbox' ? 'security-failed' : 'control-failed';
}

function classifyPopup(dom, origin, variant, observed) {
	const valid =
		dom.path === '/file' &&
		dom.readyState === 'complete' &&
		matchesProof(proofSummary(dom.proof, origin), expectedProof(variant));
	if (!valid) return failedClassification(variant);
	if (!observed) return 'dom-wait-failed';
	return variant === 'sandbox' ? 'secure' : 'control-ok';
}

function startServer(arrivals, pending) {
	return createServer((request, response) => {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		if (url.pathname === '/source') {
			const attempt = url.searchParams.get('attempt') ?? '';
			const anchors = TYPES.flatMap((type) =>
				VARIANTS.map(
					(variant) =>
						`<a id="${type}-${variant}" target="_blank" href="/file?attempt=${encodeURIComponent(attempt)}&amp;type=${type}&amp;variant=${variant}">${type} ${variant}</a>`
				)
			).join(' ');
			response.writeHead(200, {
				'Content-Type': 'text/html; charset=utf-8',
				'Set-Cookie': 'fixture=present; Path=/; SameSite=Lax'
			});
			response.end(`<!doctype html><html><body>${anchors}</body></html>`);
			return;
		}
		if (url.pathname !== '/file') {
			response.writeHead(404);
			response.end();
			return;
		}
		const type = url.searchParams.get('type');
		const variant = url.searchParams.get('variant');
		const attempt = url.searchParams.get('attempt') ?? '';
		const valid = TYPES.includes(type) && VARIANTS.includes(variant);
		const status = valid ? 200 : 404;
		const arrival = { path: url.pathname, status, cookie: Boolean(request.headers.cookie) };
		arrivals.set(attempt, arrival);
		pending.get(attempt)?.(arrival);
		response.writeHead(
			status,
			valid
				? {
						'Content-Type': type === 'svg' ? 'image/svg+xml' : 'text/html; charset=utf-8',
						'X-Content-Type-Options': 'nosniff',
						...(variant === 'sandbox' ? { 'Content-Security-Policy': CSP } : {})
					}
				: {}
		);
		response.end(valid ? documents[type] : undefined);
	});
}

function waitForArrival(attempt, arrivals, pending) {
	if (arrivals.has(attempt)) return Promise.resolve(arrivals.get(attempt));
	const { promise, resolve } = Promise.withResolvers();
	const timer = setTimeout(() => {
		pending.delete(attempt);
		resolve(null);
	}, WAIT_MS);
	pending.set(attempt, (arrival) => {
		clearTimeout(timer);
		pending.delete(attempt);
		resolve(arrival);
	});
	return promise;
}

async function readDom(page) {
	const { promise, resolve } = Promise.withResolvers();
	const timer = setTimeout(() => resolve(null), WAIT_MS);
	try {
		return await Promise.race([
			page
				.evaluate(() => ({
					readyState: document.readyState,
					path: location.pathname,
					proof: document.querySelector('#proof')?.textContent ?? null
				}))
				.catch(() => null),
			promise
		]);
	} finally {
		clearTimeout(timer);
	}
}

function withDeadline(work, label) {
	const { promise, reject } = Promise.withResolvers();
	const timer = setTimeout(() => reject(new Error(label)), WAIT_MS);
	return Promise.race([work, promise]).finally(() => clearTimeout(timer));
}

function createTargetBridge(cdp, sessionId) {
	let nextId = 1;
	const pending = new Map();
	const onMessage = (event) => {
		if (event.sessionId !== sessionId) return;
		let message;
		try {
			message = JSON.parse(event.message);
		} catch {
			return;
		}
		const waiter = message && typeof message.id === 'number' ? pending.get(message.id) : undefined;
		if (!waiter) return;
		pending.delete(message.id);
		if (message.error) waiter.reject(new Error('rpc-error'));
		else waiter.resolve(message.result);
	};
	cdp.on('Target.receivedMessageFromTarget', onMessage);
	return {
		async send(method, params) {
			const id = nextId++;
			const { promise, resolve, reject } = Promise.withResolvers();
			pending.set(id, { resolve, reject });
			try {
				return await withDeadline(
					(async () => {
						await cdp.send('Target.sendMessageToTarget', {
							sessionId,
							message: JSON.stringify({ id, method, params })
						});
						return promise;
					})(),
					'rpc-timeout'
				);
			} finally {
				pending.delete(id);
			}
		},
		dispose() {
			cdp.off('Target.receivedMessageFromTarget', onMessage);
			pending.clear();
		}
	};
}

function exactAttemptTarget(info, origin, attempt) {
	if (info.type !== 'page' && info.type !== 'tab') return false;
	try {
		const url = new URL(info.url);
		return (
			url.origin === origin &&
			url.pathname === '/file' &&
			url.searchParams.get('attempt') === attempt
		);
	} catch {
		return false;
	}
}

function probeFailure(error) {
	const allowed = [
		'attach-timeout',
		'rpc-timeout',
		'rpc-error',
		'evaluate-exception',
		'evaluate-empty',
		'detach-timeout',
		'snapshot-timeout'
	];
	return allowed.includes(error?.message) ? error.message : 'probe-failed';
}

function summarizeProbedDocument(doc, origin, variant) {
	const proof = proofSummary(doc.proof, origin);
	return {
		path: doc.path === '/file' ? '/file' : 'other',
		readyState: ['loading', 'interactive', 'complete'].includes(doc.readyState)
			? doc.readyState
			: 'other',
		origin: doc.origin === origin ? 'same-origin' : 'other',
		scriptOrigin:
			doc.scriptOrigin === 'null'
				? 'opaque'
				: doc.scriptOrigin === origin
					? 'same-origin'
					: 'other',
		proof,
		matchesExpected:
			doc.path === '/file' &&
			doc.readyState === 'complete' &&
			doc.origin === origin &&
			doc.scriptOrigin === (variant === 'sandbox' ? 'null' : origin) &&
			matchesProof(proof, expectedProof(variant))
	};
}

async function probeUnexposedTarget(cdp, snapshot, row, origin) {
	const matches = snapshot.targetInfos.filter((info) =>
		exactAttemptTarget(info, origin, row.attempt)
	);
	if (matches.length !== 1) {
		row.probeError = matches.length ? 'target-not-unique' : 'target-missing';
		return;
	}
	const target = matches[0];
	if (
		!row.targetEvents.some(
			(event) => event.kind === 'created' && event.targetId === target.targetId
		)
	) {
		row.probeError = 'target-not-created-in-attempt';
		return;
	}
	let sessionId;
	let bridge;
	try {
		({ sessionId } = await withDeadline(
			cdp.send('Target.attachToTarget', {
				targetId: target.targetId,
				flatten: false
			}),
			'attach-timeout'
		));
		bridge = createTargetBridge(cdp, sessionId);
		const expression = `JSON.stringify({
			readyState: document.readyState,
			path: location.pathname,
			origin: location.origin,
			scriptOrigin: self.origin,
			proof: document.querySelector('#proof')?.textContent ?? null
		})`;
		const result = await bridge.send('Runtime.evaluate', { expression, returnByValue: true });
		if (result?.exceptionDetails) throw new Error('evaluate-exception');
		if (typeof result?.result?.value !== 'string') throw new Error('evaluate-empty');
		row.cdpDocument = summarizeProbedDocument(JSON.parse(result.result.value), origin, row.variant);
	} catch (error) {
		row.probeError = probeFailure(error);
	} finally {
		bridge?.dispose();
		if (sessionId)
			await withDeadline(
				cdp.send('Target.detachFromTarget', { sessionId }),
				'detach-timeout'
			).catch((error) => {
				row.probeError ??= probeFailure(error);
			});
	}
}

async function runAttempt(browser, origin, arrivals, pending, cdp, capture, type, variant, index) {
	const attempt = `${type}-${variant}-${index}`;
	const row = {
		attempt,
		type,
		variant,
		classification: 'error',
		http: null,
		pageExposed: false,
		dom: null,
		targetEvents: [],
		targets: null
	};
	let context;
	try {
		capture.current = { started: Date.now(), events: row.targetEvents, dropped: 0 };
		context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${origin}/source?attempt=${attempt}`, { timeout: WAIT_MS });
		await page.evaluate(() => localStorage.setItem('fixture', 'present'));
		const exposed = context.waitForEvent('page', { timeout: WAIT_MS }).catch(() => null);
		const documentRequest = waitForArrival(attempt, arrivals, pending);
		const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
		await page.click(`#${type}-${variant}`, { modifiers: [modifier], timeout: WAIT_MS });
		const popup = await exposed;
		row.http = await documentRequest;
		row.pageExposed = Boolean(popup);
		if (!popup) {
			row.classification = hasDocument(row.http) ? 'page-unexposed' : 'http-failed';
			let snapshot;
			try {
				snapshot = await withDeadline(cdp.send('Target.getTargets'), 'snapshot-timeout');
				row.targets = snapshot.targetInfos
					.filter(({ type: kind }) => kind === 'page' || kind === 'tab')
					.map(({ targetId, type: kind, url, openerId }) => ({
						targetId,
						type: kind,
						path: pathname(url, origin),
						openerId: openerId ?? null
					}));
			} catch (error) {
				row.targetsUnavailable = true;
				row.probeError ??=
					probeFailure(error) === 'snapshot-timeout' ? 'snapshot-timeout' : 'snapshot-unavailable';
			}
			if (snapshot)
				await probeUnexposedTarget(cdp, snapshot, row, origin).catch((error) => {
					row.probeError ??= probeFailure(error);
				});
			return row;
		}
		if (!hasDocument(row.http)) {
			const dom = await readDom(popup);
			if (dom)
				row.dom = {
					path: dom.path,
					readyState: dom.readyState,
					proof: proofSummary(dom.proof, origin)
				};
			row.classification = 'http-failed';
			return row;
		}
		const observed = await popup
			.waitForFunction(
				() =>
					location.pathname === '/file' &&
					document.readyState === 'complete' &&
					Boolean(document.querySelector('#proof')?.textContent) &&
					document.querySelector('#proof')?.textContent !== 'waiting',
				null,
				{ polling: 100, timeout: WAIT_MS }
			)
			.then(
				() => true,
				() => false
			);
		const dom = await readDom(popup);
		if (!dom) {
			row.classification = 'error';
			row.error = 'DomReadUnavailable';
			return row;
		}
		row.dom = {
			path: dom.path,
			readyState: dom.readyState,
			proof: proofSummary(dom.proof, origin)
		};
		row.classification = classifyPopup(dom, origin, variant, observed);
	} catch (error) {
		row.classification = row.pageExposed ? failedClassification(variant) : 'error';
		row.error = error instanceof Error ? error.name : 'unknown';
	} finally {
		pending.get(attempt)?.(null);
		try {
			await context?.close();
		} catch {
			row.classification = 'error';
			row.error = 'ContextCloseError';
		}
		row.targetEventsDropped = capture.current?.dropped ?? 0;
		capture.current = null;
	}
	return row;
}

async function reproduce(browser, origin, arrivals, pending, cdp, capture) {
	const attempts = [];
	for (const type of TYPES) {
		for (const variant of VARIANTS) {
			for (let index = 0; index < ATTEMPTS_PER_PAIR; index++)
				attempts.push(
					await runAttempt(browser, origin, arrivals, pending, cdp, capture, type, variant, index)
				);
		}
	}
	return attempts;
}

async function main() {
	const arrivals = new Map();
	const pending = new Map();
	const server = startServer(arrivals, pending);
	let browser;
	let cdp;
	let origin;
	const capture = { current: null };
	const report = {
		platform: process.platform,
		node: process.version,
		browser: null,
		attempts: [],
		summary: {},
		setupError: null,
		cleanupErrors: []
	};
	try {
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		origin = `http://127.0.0.1:${server.address().port}`;
		browser = await chromium.launch({ headless: true });
		report.browser = browser.version();
		cdp = await browser.newBrowserCDPSession();
		const record = (kind, info) => {
			const active = capture.current;
			if (!active) return;
			if (active.events.length >= 64) {
				active.dropped++;
				return;
			}
			active.events.push({
				ms: Date.now() - active.started,
				kind,
				targetId: info.targetId,
				type: info.type,
				openerId: info.openerId ?? null,
				path: info.url ? pathname(info.url, origin) : null
			});
		};
		cdp.on('Target.targetCreated', ({ targetInfo }) => record('created', targetInfo));
		cdp.on('Target.targetInfoChanged', ({ targetInfo }) => record('changed', targetInfo));
		cdp.on('Target.targetDestroyed', ({ targetId }) => record('destroyed', { targetId }));
		cdp.on('Target.targetCrashed', ({ targetId }) => record('crashed', { targetId }));
		await withDeadline(
			cdp.send('Target.setDiscoverTargets', { discover: true }),
			'discovery-timeout'
		);
		report.attempts = await reproduce(browser, origin, arrivals, pending, cdp, capture);
	} catch (error) {
		report.setupError = error instanceof Error ? error.name : 'unknown';
	} finally {
		for (const release of pending.values()) release(null);
		pending.clear();
		if (cdp) {
			await withDeadline(
				cdp.send('Target.setDiscoverTargets', { discover: false }),
				'discovery-stop-timeout'
			).catch(() => report.cleanupErrors.push('target-discovery'));
			await withDeadline(cdp.detach(), 'root-detach-timeout').catch(() =>
				report.cleanupErrors.push('cdp-session')
			);
		}
		if (browser) await browser.close().catch(() => report.cleanupErrors.push('browser'));
		if (server.listening) {
			const closed = Promise.withResolvers();
			server.close((error) => (error ? closed.reject(error) : closed.resolve()));
			await closed.promise.catch(() => report.cleanupErrors.push('http-server'));
		}
		const counts = Object.fromEntries(
			[
				'secure',
				'control-ok',
				'page-unexposed',
				'dom-wait-failed',
				'security-failed',
				'control-failed',
				'http-failed',
				'error'
			].map((name) => [name, report.attempts.filter((row) => row.classification === name).length])
		);
		const byPair = Object.fromEntries(
			TYPES.flatMap((type) =>
				VARIANTS.map((variant) => [
					`${type}/${variant}`,
					Object.fromEntries(
						Object.keys(counts).map((name) => [
							name,
							report.attempts.filter(
								(row) => row.type === type && row.variant === variant && row.classification === name
							).length
						])
					)
				])
			)
		);
		report.summary = {
			total: report.attempts.length,
			byOutcome: counts,
			byPair,
			exposed: report.attempts.filter((row) => row.pageExposed).length
		};
		await mkdir('.run/ocu-popup-repro', { recursive: true });
		await writeFile(REPORT, JSON.stringify(report, null, 2) + '\n');
		console.log(JSON.stringify({ report: REPORT, ...report.summary }));
		if (
			report.setupError ||
			report.cleanupErrors.length ||
			report.attempts.length !== TYPES.length * VARIANTS.length * ATTEMPTS_PER_PAIR ||
			report.attempts.some(
				(row) => row.classification !== 'secure' && row.classification !== 'control-ok'
			)
		)
			process.exitCode = 1;
	}
}

await main();
