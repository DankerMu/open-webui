import * as fs from 'node:fs';
import { expect, type BrowserContext, type Page, type Response } from '@playwright/test';
import {
	openBrowserCdp,
	retireBrowserTargets,
	cdpDeadline,
	type BrowserCdpController,
	type CdpTargetSession
} from '../scripts/ocu-target-bridge.mjs';
import { popupTrace, redactChat, tracePopupEvent, type PopupTrace } from './ocu-popup-trace';

export type OcuClickProbe = {
	path: string;
	button: number;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	defaultPrevented: boolean;
};

declare global {
	interface Window {
		__recordOcuClick: (entry: OcuClickProbe) => Promise<void>;
	}
}

const contextFile = process.env.OCU_E2E_CONTEXT;
if (!contextFile) throw new Error('OCU_E2E_CONTEXT is required; run make verify-ui-ocu');
export const context: {
	origin: string;
	chats: Record<string, string>;
	fixtures: string;
	record: string;
	mint: { python: string; config: string };
	restart: {
		stub: { old_pid: number; new_pid: number };
		backend: { old_pid: number; new_pid: number };
		record_offset: number;
	};
} = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
export const evidence = '.run/ui-evidence';
fs.mkdirSync(evidence, { recursive: true });

export const tracePath = (url: string) => redactChat(sanitizedLocation(url));

/** Self-guarding collector: a second install (Playwright's or the observer's) is a no-op. */
export const FIXTURE_COLLECTOR_SOURCE = `if (!window.__fixtureCollector) {
	window.__fixtureCollector = true;
	window.fixtureEvents = [];
	window.addEventListener('message', (event) => {
		if (event.data?.type === 'fixture-opaque' || event.data?.type === 'fixture-svg')
			window.fixtureEvents.push({ origin: event.origin, ...event.data });
	});
}`;

export function redactOcu(text: string): string {
	return text
		.replace(/\/ocu\/f\/[^/\s"'<>?#]+/g, '/ocu/f/[grant]')
		.replace(/wss?:\/\/[^\s"'<>]+\/devtools\/[^\s"'<>]+/g, '[private CDP endpoint]');
}

export function sanitizedLocation(raw: string): string | null {
	try {
		const address = new URL(raw, context.origin);
		if (address.origin !== context.origin) return null;
		const query = new URLSearchParams();
		for (const [key, value] of address.searchParams) {
			const allowed = ['revision', 'download', 'embed'].includes(key);
			query.append(allowed ? key : 'other', allowed && /^\d+$/.test(value) ? value : '[redacted]');
		}
		return redactOcu(address.pathname) + (query.size ? `?${query}` : '');
	} catch {
		return null;
	}
}

export function isGrantedFile(raw: string, canonical: string): boolean {
	try {
		const actual = new URL(raw, context.origin);
		const expected = new URL(canonical, context.origin);
		const grant = /^\/ocu\/f\/[^/]+\/([^/]+)\/(.+)$/.exec(actual.pathname);
		const file = /^\/ocu\/files\/([^/]+)\/(.+)$/.exec(expected.pathname);
		return (
			actual.origin === expected.origin &&
			!!grant &&
			!!file &&
			grant[1] === file[1] &&
			grant[2] === file[2] &&
			actual.search === expected.search &&
			actual.hash === expected.hash
		);
	} catch {
		return false;
	}
}

export type GrantedDocument = {
	url: string;
	canonical: string;
	headers: Record<string, string>;
};

function assertGrantChain(
	canonical: string,
	final: string,
	status: number,
	headers: Record<string, string>,
	issuedUrl: string,
	issuedStatus: number,
	issuance: Record<string, string>
): GrantedDocument {
	expect(isGrantedFile(final, canonical), 'exact granted chat/file/query').toBe(true);
	expect(
		issuedUrl === new URL(canonical, context.origin).href,
		'actual canonical predecessor'
	).toBe(true);
	expect(issuedStatus).toBe(302);
	expect(issuance['cache-control'] === 'no-store').toBe(true);
	expect(issuance['referrer-policy'] === 'no-referrer').toBe(true);
	expect(issuance.location?.startsWith('/ocu/f/'), 'relative grant Location').toBe(true);
	expect(
		new URL(issuance.location ?? '', context.origin).href === final,
		'redirect Location is final response'
	).toBe(true);
	expect(status).toBe(200);
	expect(headers['cache-control'] === 'no-store').toBe(true);
	expect(headers['referrer-policy'] === 'no-referrer').toBe(true);
	if (
		['text/html', 'image/svg+xml', 'application/xml', 'text/xml', 'application/xhtml+xml'].includes(
			headers['content-type']?.split(';')[0].trim().toLowerCase()
		)
	) {
		expect(headers['content-security-policy'] === 'sandbox allow-scripts allow-forms').toBe(true);
		expect(headers['x-content-type-options'] === 'nosniff').toBe(true);
	}
	return { url: final, canonical: new URL(canonical, context.origin).href, headers };
}

export async function assertGrantedFile(response: Response, canonical: string) {
	const entry = response.request().redirectedFrom();
	expect(entry?.redirectedFrom() === null, 'single canonical issuance hop').toBe(true);
	const issued = await entry?.response();
	return assertGrantChain(
		canonical,
		response.url(),
		response.status(),
		response.headers(),
		entry?.url() ?? '',
		issued?.status() ?? 0,
		issued?.headers() ?? {}
	);
}

export function waitForGrantedFile(page: Page, canonical: string) {
	return page
		.waitForResponse((response) => isGrantedFile(response.url(), canonical))
		.then(async (response) => {
			await assertGrantedFile(response, canonical);
			return response;
		});
}

export function records() {
	return fs
		.readFileSync(context.record, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export function recordsSince(offset: number) {
	return fs
		.readFileSync(context.record)
		.subarray(offset)
		.toString('utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export function setScenario(chatId: string, scenario: string) {
	const rows = JSON.parse(fs.readFileSync(context.fixtures, 'utf8'));
	rows[chatId] = scenario;
	const staged = `${context.fixtures}.controls`;
	fs.writeFileSync(staged, JSON.stringify(rows));
	fs.renameSync(staged, context.fixtures);
}

export async function createScenarioChat(
	page: Page,
	scenario: string,
	nativeArtifact = false
): Promise<string> {
	const token = await page.evaluate(() => localStorage.token);
	const message = {
		id: 'fixture-artifact',
		role: 'assistant',
		content:
			'```svg\n<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5"/></svg>\n```',
		parentId: null,
		childrenIds: [],
		timestamp: 1
	};
	const response = await page.request.post('/api/v1/chats/new', {
		headers: { Authorization: `Bearer ${token}` },
		data: {
			chat: {
				title: 'Workspace controls fixture',
				history: nativeArtifact
					? { messages: { [message.id]: message }, currentId: message.id }
					: { messages: {}, currentId: null }
			}
		}
	});
	expect(response.ok()).toBe(true);
	const created = await response.json();
	expect(created.id).toBeTruthy();
	setScenario(created.id, scenario);
	return created.id;
}

export async function captureBrowserTargetPaths(
	browser: BrowserContext,
	page: Page,
	sanitize: (url: string) => string | null
) {
	try {
		const owner = browser.browser();
		const active = page.isClosed()
			? browser.pages().find((candidate) => !candidate.isClosed())
			: page;
		if (!owner && !active) return null;
		const session = owner
			? await owner.newBrowserCDPSession()
			: await browser.newCDPSession(active!);
		try {
			const { targetInfos } = (await session.send('Target.getTargets')) as {
				targetInfos: Array<{ targetId: string; type: string; url: string; openerId?: string }>;
			};
			return targetInfos.map((target) => ({
				targetId: target.targetId,
				type: target.type,
				path: sanitize(target.url),
				openerId: target.openerId ?? null
			}));
		} finally {
			await session.detach().catch(() => undefined);
		}
	} catch {
		return null;
	}
}

export function watchPageLifecycle(
	page: Page,
	add: (kind: 'popup' | 'close' | 'crash' | 'download' | 'navigated', url: string) => void
) {
	page.on('popup', (popup) => add('popup', popup.url()));
	page.on('close', () => add('close', page.url()));
	page.on('crash', () => add('crash', page.url()));
	page.on('download', (download) => add('download', download.url()));
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) add('navigated', frame.url());
	});
}

export function watchContextLifecycle(
	browser: BrowserContext,
	active: Page,
	add: (kind: 'page' | 'popup' | 'close' | 'crash' | 'download' | 'navigated', url: string) => void
) {
	watchPageLifecycle(active, add);
	browser.on('page', (opened) => {
		add('page', opened.url());
		watchPageLifecycle(opened, add);
	});
}

export async function recordAnchorClicks(page: Page, record: (entry: OcuClickProbe) => void) {
	await page.exposeFunction('__recordOcuClick', (entry: OcuClickProbe) => {
		record(entry);
	});
	await page.evaluate(() => {
		window.addEventListener('click', (event) => {
			const anchor =
				event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
			if (!anchor) return;
			const path = new URL(anchor.href).pathname;
			if (!path.startsWith('/ocu/files/')) return;
			void window
				.__recordOcuClick({
					path,
					button: event.button,
					ctrlKey: event.ctrlKey,
					metaKey: event.metaKey,
					shiftKey: event.shiftKey,
					altKey: event.altKey,
					defaultPrevented: event.defaultPrevented
				})
				.catch(() => undefined);
		});
	});
}

type PopupCdpEvent = {
	type?: string;
	args?: Array<{ value?: unknown; description?: string }>;
	stackTrace?: { callFrames?: Array<{ url: string }> };
	exceptionDetails?: { url?: string; text?: string; exception?: { description?: string } };
	entry?: { level?: string; url?: string; text?: string };
	requestId?: string;
	frameId?: string;
	loaderId?: string;
	request?: { url: string; method: string };
	redirectResponse?: { url: string; status: number; headers: Record<string, string> };
	response?: { url: string; status: number; headers: Record<string, string> };
};

function collectPopupError(
	errors: Array<{ url: string; text: string }>,
	method: string,
	params: PopupCdpEvent
) {
	if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
		errors.push({
			url: redactOcu(params.stackTrace?.callFrames?.[0]?.url ?? ''),
			text: redactOcu(
				params.args?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') ?? ''
			)
		});
	if (method === 'Runtime.exceptionThrown')
		errors.push({
			url: redactOcu(params.exceptionDetails?.url ?? ''),
			text: redactOcu(
				params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? ''
			)
		});
	if (method === 'Log.entryAdded' && params.entry?.level === 'error')
		errors.push({
			url: redactOcu(params.entry.url ?? ''),
			text: redactOcu(params.entry.text ?? '')
		});
}

type PopupTargetInfo = { targetId: string; type: string; url?: string; browserContextId?: string };

type PopupNavigation = {
	frameId: string;
	loaderId: string;
	final?: PopupCdpEvent['response'];
	redirect?: PopupCdpEvent['redirectResponse'];
	redirectedUrl?: string;
};

function collectPopupNavigation(
	navigations: Map<string, PopupNavigation>,
	method: string,
	event: PopupCdpEvent,
	canonical: string
) {
	if (!event.requestId || event.type !== 'Document') return false;
	if (
		method === 'Network.requestWillBeSent' &&
		event.request?.url === canonical &&
		event.request.method === 'GET' &&
		event.frameId &&
		event.loaderId
	) {
		navigations.set(event.requestId, { frameId: event.frameId, loaderId: event.loaderId });
		return true;
	}
	const navigation = navigations.get(event.requestId);
	if (!navigation || navigation.frameId !== event.frameId || navigation.loaderId !== event.loaderId)
		return false;
	if (method === 'Network.requestWillBeSent') {
		navigation.redirect = event.redirectResponse;
		navigation.redirectedUrl = event.request?.url;
	}
	if (method === 'Network.responseReceived') navigation.final = event.response;
	return false;
}

export async function sourceTargetContext(
	browser: BrowserContext,
	source: Page,
	targets: Array<{ targetId: string; browserContextId?: string }>
) {
	const sourceSession = await cdpDeadline(browser.newCDPSession(source), 'source-attach-timeout');
	let info: { targetId: string; browserContextId?: string };
	try {
		const response = await cdpDeadline(
			sourceSession.send('Target.getTargetInfo'),
			'source-info-timeout'
		);
		info = response.targetInfo;
	} finally {
		await cdpDeadline(sourceSession.detach(), 'source-detach-timeout');
	}
	const original = targets.find(({ targetId }) => targetId === info.targetId);
	if (!original || !info.browserContextId || original.browserContextId !== info.browserContextId)
		throw new Error('Native popup source target identity unavailable');
	return info.browserContextId;
}

async function awaitPopupDestination(
	root: BrowserCdpController,
	targetId: string,
	contextId: string,
	path: string,
	valid: () => boolean
) {
	const deadline = Date.now() + 20_000;
	do {
		if (!valid()) throw new Error('Native popup target lost or ambiguous');
		const { targetInfos } = await root.send('Target.getTargets');
		const matches = targetInfos.filter(
			(info) => (info.type === 'page' || info.type === 'tab') && isGrantedFile(info.url, path)
		);
		if (
			matches.length > 1 ||
			(matches.length === 1 &&
				(matches[0].targetId !== targetId || matches[0].browserContextId !== contextId))
		)
			throw new Error('Native popup destination identity mismatch');
		if (matches.length === 1) return matches[0].url as string;
		await new Promise((resolve) => setTimeout(resolve, 100));
	} while (Date.now() < deadline);
	throw new Error('Native popup destination identity mismatch');
}

export const POPUP_DOCUMENT_EXPRESSION = `JSON.stringify((() => {
	const proof = document.querySelector('#proof')?.textContent;
	const inline = document.querySelector('#inline');
	const image = document.querySelector('#image');
	const safe = (value) => value === 'blocked' ? 'blocked' : 'unexpected';
	return {
		path: location.pathname.replace(/\\/ocu\\/f\\/[^/]+/, '/ocu/f/[grant]'), origin: location.origin, readyState: document.readyState,
		proof: proof === 'null|blocked|blocked|blocked' ? proof : 'unexpected',
		inlineColor: inline ? getComputedStyle(inline).color : null,
		imageNaturalWidth: image?.naturalWidth ?? null, imageComplete: image?.complete ?? null,
		collector: window.fixtureEvents === undefined ? 'absent' : (window.fixtureEvents.length ? window.fixtureEvents.length + ' events' : 'empty'),
		posted: window.__fixturePosted ?? null,
		fixtureEvents: (window.fixtureEvents ?? []).map((event) => ({
			origin: event.origin === 'null' ? 'null' : 'unexpected',
			type: ['fixture-opaque', 'fixture-svg'].includes(event.type) ? event.type : 'unexpected',
			storage: safe(event.storage), parentAccess: safe(event.parentAccess),
			cookie: safe(event.cookie)
		}))
	};
})())`;

type PopupFixtureEvent = {
	origin: string;
	type: string;
	storage: string;
	parentAccess: string;
	cookie: string;
};

export type PopupDocument = {
	path: string;
	origin: string;
	readyState: string;
	proof: string;
	inlineColor: string | null;
	imageNaturalWidth: number | null;
	imageComplete: boolean | null;
	collector: string;
	posted: number | null;
	fixtureEvents: PopupFixtureEvent[];
};

function expectedPopupEvent(event: PopupFixtureEvent, type: 'html' | 'svg') {
	return (
		event.origin === 'null' &&
		event.type === (type === 'html' ? 'fixture-opaque' : 'fixture-svg') &&
		event.storage === 'blocked' &&
		event.parentAccess === 'blocked' &&
		event.cookie === 'blocked'
	);
}

async function readPopupDocument(
	bridge: CdpTargetSession,
	type: 'html' | 'svg',
	valid: () => boolean,
	trace: PopupTrace
): Promise<PopupDocument> {
	const deadline = Date.now() + 20_000;
	let lastDocument: PopupDocument | undefined;
	do {
		if (!valid()) throw new Error('Native popup target lost or ambiguous');
		const result = await bridge.send('Runtime.evaluate', {
			expression: POPUP_DOCUMENT_EXPRESSION,
			returnByValue: true
		});
		if (result.exceptionDetails || typeof result.result?.value !== 'string')
			throw new Error('Native popup DOM evaluation failed');
		const document: PopupDocument = JSON.parse(result.result.value);
		lastDocument = document;
		const { readyState, collector, posted } = document;
		trace.mark('poll', { readyState, collector, posted });
		if (
			document.readyState === 'complete' &&
			document.fixtureEvents.some((event: PopupFixtureEvent) => expectedPopupEvent(event, type))
		)
			return document;
		await new Promise((resolve) => setTimeout(resolve, 100));
	} while (Date.now() < deadline);
	throw new Error(
		`Native popup fixture event missing (collector: ${lastDocument?.collector}, posted: ${lastDocument?.posted}): ${JSON.stringify(lastDocument)}`
	);
}

async function capturePopupScreenshot(bridge: CdpTargetSession, path: string) {
	const capture = await bridge.send('Page.captureScreenshot', { format: 'png' });
	const png = Buffer.from(capture.data ?? '', 'base64');
	if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
		throw new Error('Native popup screenshot is not PNG');
	fs.writeFileSync(path, png);
}

export type PopupObservation = {
	document: PopupDocument;
	grant: GrantedDocument;
	errors: Array<{ url: string; text: string }>;
	targetId: string;
	evaluate: (expression: string) => Promise<unknown>;
	screenshot: (path: string) => Promise<void>;
};

async function visitPopupDocument(
	bridge: CdpTargetSession | undefined,
	type: 'html' | 'svg',
	valid: () => boolean,
	screenshotPath: string,
	initial: Omit<PopupObservation, 'document' | 'evaluate' | 'screenshot'>,
	trace: PopupTrace,
	visit?: (popup: PopupObservation) => Promise<void>
) {
	if (!bridge) throw new Error('Native popup CDP attachment missing');
	const document = await readPopupDocument(bridge, type, valid, trace);
	if (!valid()) throw new Error('Native popup target lost or ambiguous');
	await capturePopupScreenshot(bridge, screenshotPath);
	if (bridge.eventErrors) throw new Error('Native popup CDP event collection failed');
	const observation: PopupObservation = {
		...initial,
		document,
		evaluate: async (expression) => {
			if (!valid()) throw new Error('Native popup target lost or ambiguous');
			const result = await bridge.send('Runtime.evaluate', {
				expression,
				returnByValue: true,
				awaitPromise: true
			});
			if (result.exceptionDetails) throw new Error('Native popup evaluation failed');
			return result.result?.value;
		},
		screenshot: (path) => capturePopupScreenshot(bridge, path)
	};
	await visit?.(observation);
	if (bridge.eventErrors) throw new Error('Native popup CDP event collection failed');
	return observation;
}

/**
 * Observe a native modifier-click through the browser target channel, including
 * tabs that Chromium does not surface as Playwright Page objects.
 */
export async function observeNativeOcuPopup(
	browser: BrowserContext,
	source: Page,
	expectedPath: string,
	type: 'html' | 'svg',
	click: () => Promise<void>,
	screenshotPath: string,
	visit?: (popup: PopupObservation) => Promise<void>,
	onNetwork?: (method: string, params: unknown, sessionId: string) => void
) {
	const owner = browser.browser();
	if (!owner) throw new Error('Native popup observation requires a Chromium browser');
	const trace = popupTrace();
	const root = await openBrowserCdp(owner);
	let targetId: string | undefined;
	let bridge: CdpTargetSession | undefined;
	const sessions = new Map<string, CdpTargetSession>();
	const jobs = new Set<Promise<void>>();
	const paused = new Set<string>();
	let ownedTarget: string | undefined;
	let closing = false;
	let onAttached:
		| ((event: {
				sessionId: string;
				waitingForDebugger: boolean;
				targetInfo: { targetId: string; type: string; browserContextId?: string };
		  }) => void)
		| undefined;
	let targetLost = false;
	let autoAttachStarted = false;
	const attachmentErrors: string[] = [];
	const onLost = ({ targetId: lost }: { targetId: string }) => {
		if (lost === targetId) targetLost = true;
	};
	const errors: Array<{ url: string; text: string }> = [];
	let observation: PopupObservation | undefined;
	const navigations = new Map<string, PopupNavigation>();
	const canonical = new URL(expectedPath, context.origin).href;
	let failure: unknown;
	let cleanupErrors: string[] = [];
	const onPage = (opened: Page) => trace.mark('page.event', { path: tracePath(opened.url()) });
	let onCreated: ((event: { targetInfo: PopupTargetInfo }) => void) | undefined;
	try {
		await root.send('Target.setDiscoverTargets', { discover: true });
		const { targetInfos } = await root.send('Target.getTargets');
		const existing = new Set(targetInfos.map(({ targetId }) => targetId));
		const contextId = await sourceTargetContext(browser, source, targetInfos);
		onCreated = ({ targetInfo }) => {
			if (existing.has(targetInfo.targetId)) return;
			trace.mark('target.created', {
				type: targetInfo.type,
				sameContext: targetInfo.browserContextId === contextId,
				path: tracePath(targetInfo.url ?? '')
			});
		};
		root.on('Target.targetCreated', onCreated);
		browser.on('page', onPage);
		const candidates = new Set<string>();
		const created = Promise.withResolvers<string>();
		void created.promise.catch(() => undefined);
		onAttached = ({ targetInfo, sessionId, waitingForDebugger }) => {
			const candidate =
				!closing &&
				!existing.has(targetInfo.targetId) &&
				targetInfo.type === 'page' &&
				targetInfo.browserContextId === contextId;
			if (candidate) candidates.add(targetInfo.targetId);
			const selected = candidate && candidates.size === 1;
			if (candidate && !selected) created.reject(new Error('Native popup target not unique'));
			if (waitingForDebugger) paused.add(sessionId);
			trace.mark('target.attached', { selected, waitingForDebugger, type: targetInfo.type });
			const job = (async () => {
				const attached = root.session(
					sessionId,
					selected
						? (method, params: PopupCdpEvent) => {
								collectPopupError(errors, method, params);
								onNetwork?.(method, params, sessionId);
								tracePopupEvent(trace, method, params, canonical, tracePath);
								if (collectPopupNavigation(navigations, method, params, canonical))
									ownedTarget = targetInfo.targetId;
							}
						: undefined
				);
				sessions.set(sessionId, attached);
				try {
					if (selected) {
						targetId = targetInfo.targetId;
						bridge = attached;
						const { targetInfo: adopted } = await attached.send('Target.getTargetInfo');
						if (adopted.targetId !== targetInfo.targetId || adopted.browserContextId !== contextId)
							throw new Error('Native popup adopted session identity mismatch');
						await Promise.all([
							attached.send('Runtime.enable'),
							attached.send('Log.enable'),
							attached.send('Network.enable')
						]);
						// The observer installs the collector before its own resume, so the popup's inline
						// script finds the listener whichever client (Playwright or this) releases first.
						await attached.send('Page.enable');
						await attached.send('Page.addScriptToEvaluateOnNewDocument', {
							source: FIXTURE_COLLECTOR_SOURCE
						});
						trace.mark('collector.install.ack');
					}
				} finally {
					// Even foreign, existing and ambiguous targets belong to the browser, not this observer.
					if (waitingForDebugger) {
						trace.mark('resume.send', { selected });
						await attached.send('Runtime.runIfWaitingForDebugger');
						trace.mark('resume.ack', { selected });
						paused.delete(sessionId);
					}
				}
				if (selected) created.resolve(targetInfo.targetId);
			})();
			jobs.add(job);
			void job
				.catch(() => {
					attachmentErrors.push('target attachment or resume');
					created.reject(new Error('Native popup attachment or resume failed'));
				})
				.finally(() => jobs.delete(job));
		};
		root.on('Target.attachedToTarget', onAttached);
		root.on('Target.targetDestroyed', onLost);
		root.on('Target.targetCrashed', onLost);
		autoAttachStarted = true;
		await root.send('Target.setAutoAttach', {
			autoAttach: true,
			waitForDebuggerOnStart: true,
			flatten: true,
			filter: [{ type: 'page', exclude: false }, { exclude: true }]
		});
		trace.mark('click.start');
		await click();
		trace.mark('click.end');
		targetId = await cdpDeadline(created.promise, 'target-created-timeout');
		if (candidates.size !== 1 || targetLost) throw new Error('Native popup target not unique');
		const valid = () => !targetLost && candidates.size === 1;
		const destination = await awaitPopupDestination(root, targetId, contextId, expectedPath, valid);
		trace.mark('destination', { path: tracePath(destination) });
		await expect
			.poll(() => [...navigations.values()].some((row) => row.final?.url === destination))
			.toBe(true);
		const navigation = [...navigations.values()].find((row) => row.final?.url === destination)!;
		expect(navigation.redirect !== undefined, 'native document keeps its captured redirect').toBe(
			true
		);
		expect(ownedTarget === targetId, 'observed canonical request owns the native target').toBe(
			true
		);
		expect(
			navigation.redirectedUrl === destination,
			'native redirected request reaches the same target'
		).toBe(true);
		const grant = assertGrantChain(
			expectedPath,
			destination,
			navigation.final!.status,
			Object.fromEntries(
				Object.entries(navigation.final!.headers).map(([name, value]) => [
					name.toLowerCase(),
					value
				])
			),
			navigation.redirect!.url,
			navigation.redirect!.status,
			Object.fromEntries(
				Object.entries(navigation.redirect!.headers).map(([name, value]) => [
					name.toLowerCase(),
					value
				])
			)
		);
		expect(grant.headers['content-security-policy'] === 'sandbox allow-scripts allow-forms').toBe(
			true
		);
		expect(grant.headers['x-content-type-options'] === 'nosniff').toBe(true);
		observation = await visitPopupDocument(
			bridge,
			type,
			valid,
			screenshotPath,
			{ grant, errors, targetId },
			trace,
			visit
		);
		expect(root.eventErrors, 'native root protocol observers remain healthy').toBe(0);
	} catch (error) {
		failure = error;
	} finally {
		closing = true;
		try {
			cleanupErrors = await retireBrowserTargets(
				root,
				sessions,
				jobs,
				paused,
				ownedTarget,
				targetLost,
				autoAttachStarted
			);
		} catch {
			cleanupErrors.push('target retirement');
		} finally {
			cleanupErrors.push(...attachmentErrors);
			browser.off('page', onPage);
			if (onCreated) root.off('Target.targetCreated', onCreated);
			if (onAttached) root.off('Target.attachedToTarget', onAttached);
			root.off('Target.targetDestroyed', onLost);
			root.off('Target.targetCrashed', onLost);
			await root.close().catch(() => cleanupErrors.push('root socket'));
			trace.mark('retired', { errors: cleanupErrors });
			trace.close();
		}
	}
	if (failure && cleanupErrors.length)
		throw new AggregateError(
			[failure, new Error(`Native popup cleanup failed: ${cleanupErrors.join(', ')}`)],
			'Native popup observation and cleanup failed'
		);
	if (failure) throw failure;
	if (cleanupErrors.length)
		throw new Error(`Native popup cleanup failed: ${cleanupErrors.join(', ')}`);
	if (!observation) throw new Error('Native popup observation unavailable');
	return observation;
}
