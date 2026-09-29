import * as fs from 'node:fs';
import { expect, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import { attachCdpTarget, cdpDeadline } from '../scripts/ocu-target-bridge.mjs';

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
	restart: {
		stub: { old_pid: number; new_pid: number };
		backend: { old_pid: number; new_pid: number };
		record_offset: number;
	};
} = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
export const evidence = '.run/ui-evidence';
fs.mkdirSync(evidence, { recursive: true });

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
};

function collectPopupError(
	errors: Array<{ url: string; text: string }>,
	method: string,
	params: PopupCdpEvent
) {
	if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
		errors.push({
			url: params.stackTrace?.callFrames?.[0]?.url ?? '',
			text: params.args?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') ?? ''
		});
	if (method === 'Runtime.exceptionThrown')
		errors.push({
			url: params.exceptionDetails?.url ?? '',
			text: params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? ''
		});
	if (method === 'Log.entryAdded' && params.entry?.level === 'error')
		errors.push({ url: params.entry.url ?? '', text: params.entry.text ?? '' });
}

async function sourceTargetContext(
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
type PopupBridge = Awaited<ReturnType<typeof attachCdpTarget>>;

function matchesPopupPath(url: string, path: string) {
	try {
		const address = new URL(url);
		return (
			address.origin === context.origin &&
			address.pathname === path &&
			address.search === '' &&
			address.hash === ''
		);
	} catch {
		return false;
	}
}

async function awaitPopupDestination(
	root: CDPSession,
	targetId: string,
	contextId: string,
	path: string,
	valid: () => boolean
) {
	const deadline = Date.now() + 20_000;
	do {
		if (!valid()) throw new Error('Native popup target lost or ambiguous');
		const { targetInfos } = await cdpDeadline(root.send('Target.getTargets'), 'snapshot-timeout');
		const matches = targetInfos.filter(
			(info) => (info.type === 'page' || info.type === 'tab') && matchesPopupPath(info.url, path)
		);
		if (
			matches.length > 1 ||
			(matches.length === 1 &&
				(matches[0].targetId !== targetId || matches[0].browserContextId !== contextId))
		)
			throw new Error('Native popup destination identity mismatch');
		if (matches.length === 1) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	} while (Date.now() < deadline);
	throw new Error('Native popup destination identity mismatch');
}

const POPUP_DOCUMENT_EXPRESSION = `JSON.stringify((() => {
	const proof = document.querySelector('#proof')?.textContent;
	const inline = document.querySelector('#inline');
	const image = document.querySelector('#image');
	const safe = (value) => value === 'blocked' ? 'blocked' : 'unexpected';
	return {
		path: location.pathname, origin: location.origin, readyState: document.readyState,
		proof: proof === 'null|blocked|blocked|blocked' ? proof : 'unexpected',
		inlineColor: inline ? getComputedStyle(inline).color : null,
		imageNaturalWidth: image?.naturalWidth ?? null, imageComplete: image?.complete ?? null,
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

function expectedPopupEvent(event: PopupFixtureEvent, type: 'html' | 'svg') {
	return (
		event.origin === 'null' &&
		event.type === (type === 'html' ? 'fixture-opaque' : 'fixture-svg') &&
		event.storage === 'blocked' &&
		event.parentAccess === 'blocked' &&
		event.cookie === 'blocked'
	);
}

async function readPopupDocument(bridge: PopupBridge, type: 'html' | 'svg', valid: () => boolean) {
	const deadline = Date.now() + 20_000;
	do {
		if (!valid()) throw new Error('Native popup target lost or ambiguous');
		const result = await bridge.send('Runtime.evaluate', {
			expression: POPUP_DOCUMENT_EXPRESSION,
			returnByValue: true
		});
		if (result.exceptionDetails || typeof result.result?.value !== 'string')
			throw new Error('Native popup DOM evaluation failed');
		const document = JSON.parse(result.result.value);
		if (
			document.readyState === 'complete' &&
			document.fixtureEvents.some((event: PopupFixtureEvent) => expectedPopupEvent(event, type))
		)
			return document;
		await new Promise((resolve) => setTimeout(resolve, 100));
	} while (Date.now() < deadline);
	throw new Error('Native popup fixture event missing');
}

async function capturePopupScreenshot(bridge: PopupBridge, path: string) {
	const capture = await bridge.send('Page.captureScreenshot', { format: 'png' });
	const png = Buffer.from(capture.data ?? '', 'base64');
	if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
		throw new Error('Native popup screenshot is not PNG');
	fs.writeFileSync(path, png);
}

async function releasePopupTarget(
	root: CDPSession,
	bridge: PopupBridge | undefined,
	targetId: string | undefined,
	targetLost: boolean
) {
	const errors: string[] = [];
	if (bridge) await bridge.detach().catch(() => errors.push('target detach'));
	if (targetId) {
		const closed = await cdpDeadline(
			root.send('Target.closeTarget', { targetId }),
			'target-close-timeout'
		).catch(() => ({ success: false }));
		if (!closed.success && !targetLost) errors.push('target close');
	}
	await cdpDeadline(
		root.send('Target.setDiscoverTargets', { discover: false }),
		'discovery-stop-timeout'
	).catch(() => errors.push('target discovery'));
	await cdpDeadline(root.detach(), 'root-detach-timeout').catch(() => errors.push('root detach'));
	return errors;
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
	screenshotPath: string
) {
	const owner = browser.browser();
	if (!owner) throw new Error('Native popup observation requires a Chromium browser');
	const root = await owner.newBrowserCDPSession();
	let targetId: string | undefined;
	let bridge: PopupBridge | undefined;
	let onCreated:
		| ((event: {
				targetInfo: { targetId: string; type: string; browserContextId?: string };
		  }) => void)
		| undefined;
	let exposed = false;
	let targetLost = false;
	const onLost = ({ targetId: lost }: { targetId: string }) => {
		if (lost === targetId) targetLost = true;
	};
	const errors: Array<{ url: string; text: string }> = [];
	const onPage = (page: Page) => {
		if (page !== source) exposed = true;
	};
	let observation:
		| {
				document: Awaited<ReturnType<typeof readPopupDocument>>;
				errors: Array<{ url: string; text: string }>;
				pageExposed: boolean;
				targetId: string;
		  }
		| undefined;
	let failure: unknown;
	let cleanupErrors: string[] = [];
	try {
		await cdpDeadline(
			root.send('Target.setDiscoverTargets', { discover: true }),
			'discovery-timeout'
		);
		const { targetInfos } = await cdpDeadline(root.send('Target.getTargets'), 'snapshot-timeout');
		const existing = new Set(targetInfos.map(({ targetId }) => targetId));
		const contextId = await sourceTargetContext(browser, source, targetInfos);
		const candidates = new Set<string>();
		const created = Promise.withResolvers<string>();
		onCreated = ({ targetInfo }) => {
			if (
				existing.has(targetInfo.targetId) ||
				(targetInfo.type !== 'page' && targetInfo.type !== 'tab') ||
				targetInfo.browserContextId !== contextId
			)
				return;
			candidates.add(targetInfo.targetId);
			if (candidates.size !== 1) return;
			targetId = targetInfo.targetId;
			created.resolve(
				(async () => {
					bridge = await attachCdpTarget(root, targetInfo.targetId, {
						onEvent: (method, params: PopupCdpEvent) => collectPopupError(errors, method, params)
					});
					await Promise.all([bridge.send('Runtime.enable'), bridge.send('Log.enable')]);
					return targetInfo.targetId;
				})()
			);
		};
		root.on('Target.targetCreated', onCreated);
		root.on('Target.targetDestroyed', onLost);
		root.on('Target.targetCrashed', onLost);
		browser.on('page', onPage);
		await click();
		targetId = await cdpDeadline(created.promise, 'target-created-timeout');
		if (candidates.size !== 1 || targetLost) throw new Error('Native popup target not unique');
		const valid = () => !targetLost && candidates.size === 1;
		await awaitPopupDestination(root, targetId, contextId, expectedPath, valid);
		if (!bridge) throw new Error('Native popup CDP attachment missing');
		const document = await readPopupDocument(bridge, type, valid);
		if (!valid()) throw new Error('Native popup target lost or ambiguous');
		await capturePopupScreenshot(bridge, screenshotPath);
		if (bridge.eventErrors) throw new Error('Native popup CDP event collection failed');
		observation = { document, errors, pageExposed: exposed, targetId };
	} catch (error) {
		failure = error;
	} finally {
		if (onCreated) root.off('Target.targetCreated', onCreated);
		root.off('Target.targetDestroyed', onLost);
		root.off('Target.targetCrashed', onLost);
		browser.off('page', onPage);
		cleanupErrors = await releasePopupTarget(root, bridge, targetId, targetLost);
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

export async function writeOcuFailureEvidence(
	record: {
		pending: Promise<void>[];
		active: Page;
		browser: BrowserContext;
		events: unknown[];
		anchorPath: string | null;
		gestures: OcuClickProbe[];
	},
	sanitize: (url: string) => string | null
) {
	await Promise.allSettled(record.pending);
	const active = record.active.isClosed()
		? null
		: await record.active
				.evaluate(() => ({
					location: window.location.href,
					baseURI: document.baseURI,
					readyState: document.readyState,
					proof:
						document
							.querySelector('#proof')
							?.textContent?.split('|')
							.slice(0, 4)
							.map((part) => (['null', 'blocked', 'leaked'].includes(part) ? part : '[redacted]'))
							.join('|') ?? null,
					stylesheets: [...document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]')].map(
						(link) => link.href
					)
				}))
				.catch(() => null);
	const targets = await captureBrowserTargetPaths(
		record.browser,
		record.active,
		(url) => sanitize(url)?.split('?')[0] ?? null
	);
	fs.writeFileSync(
		`${evidence}/workspace-network-failure.json`,
		JSON.stringify(
			{
				expectedStylesheets: [context.chats.normal, context.chats.link].map(
					(id) => `/ocu/files/${id}/style.css`
				),
				browserVersion: record.browser.browser()?.version() ?? null,
				platform: process.platform,
				events: record.events,
				anchorPath: record.anchorPath,
				gestures: record.gestures,
				targets,
				active: active && {
					location: sanitize(active.location),
					baseURI: sanitize(active.baseURI),
					readyState: active.readyState,
					proof: active.proof,
					stylesheets: active.stylesheets.map(sanitize)
				}
			},
			null,
			2
		)
	);
}
