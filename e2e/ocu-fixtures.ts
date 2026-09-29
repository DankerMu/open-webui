import * as fs from 'node:fs';
import { expect, type BrowserContext, type Page } from '@playwright/test';
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

export async function expectOpaqueFileDocument(page: Page, path: string, type: 'html' | 'svg') {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const inline = document.querySelector<HTMLElement>('#inline');
				const image = document.querySelector<HTMLImageElement>('#image');
				return {
					path: window.location.pathname,
					origin: window.location.origin,
					readyState: document.readyState,
					proof: document.querySelector('#proof')?.textContent ?? null,
					inlineColor: inline ? getComputedStyle(inline).color : null,
					imageNaturalWidth: image?.naturalWidth ?? null,
					imageComplete: image?.complete ?? null
				};
			})
		)
		.toEqual({
			path,
			origin: context.origin,
			readyState: 'complete',
			proof: 'null|blocked|blocked|blocked',
			inlineColor: type === 'html' ? 'rgb(0, 128, 0)' : null,
			imageNaturalWidth: type === 'html' ? 1 : null,
			imageComplete: type === 'html' ? true : null
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

type ProtocolEvent = {
	ms: number;
	source: 'browser' | 'original' | 'exposed';
	kind: string;
	targetId?: string;
	openerId?: string;
	frameId?: string;
	requestId?: string;
	path?: string | null;
	status?: number;
	value?: string | number | boolean;
};

/**
 * Observe a native modifier-click through the browser target channel, including
 * tabs that Chromium does not surface as Playwright Page objects.
 */
export async function observeNativeOcuPopup(
	browser: BrowserContext,
	source: Page,
	expectedPath: string,
	click: () => Promise<void>,
	screenshotPath: string
) {
	const owner = browser.browser();
	if (!owner) throw new Error('Native popup observation requires a Chromium browser');
	const root = await owner.newBrowserCDPSession();
	let targetId: string | undefined;
	let bridge: Awaited<ReturnType<typeof attachCdpTarget>> | undefined;
	let onCreated:
		| ((event: {
				targetInfo: { targetId: string; type: string; browserContextId?: string };
		  }) => void)
		| undefined;
	let exposed = false;
	const errors: Array<{ url: string; text: string }> = [];
	const onPage = (page: Page) => {
		if (page !== source) exposed = true;
	};
	try {
		await cdpDeadline(
			root.send('Target.setDiscoverTargets', { discover: true }),
			'discovery-timeout'
		);
		const { targetInfos } = await cdpDeadline(root.send('Target.getTargets'), 'snapshot-timeout');
		const existing = new Set(targetInfos.map(({ targetId }) => targetId));
		const originals = targetInfos.filter(
			({ url, type }) => (type === 'page' || type === 'tab') && url === source.url()
		);
		if (originals.length !== 1 || !originals[0].browserContextId)
			throw new Error('Native popup source target identity unavailable');
		const contextId = originals[0].browserContextId;
		const candidates = new Set<string>();
		const created = Promise.withResolvers<string>();
		const onTargetEvent = (method: string, params: any) => {
			if (method === 'Runtime.consoleAPICalled' && params.type === 'error')
				errors.push({
					url: params.stackTrace?.callFrames?.[0]?.url ?? '',
					text:
						params.args
							?.map((arg: { value?: unknown; description?: string }) =>
								String(arg.value ?? arg.description ?? '')
							)
							.join(' ') ?? ''
				});
			if (method === 'Runtime.exceptionThrown')
				errors.push({
					url: params.exceptionDetails?.url ?? '',
					text:
						params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? ''
				});
			if (method === 'Log.entryAdded' && params.entry?.level === 'error')
				errors.push({ url: params.entry.url ?? '', text: params.entry.text ?? '' });
		};
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
					bridge = await attachCdpTarget(root, targetInfo.targetId, { onEvent: onTargetEvent });
					await Promise.all([bridge.send('Runtime.enable'), bridge.send('Log.enable')]);
					return targetInfo.targetId;
				})()
			);
		};
		root.on('Target.targetCreated', onCreated);
		browser.on('page', onPage);
		await click();
		targetId = await cdpDeadline(created.promise, 'target-created-timeout');
		if (candidates.size !== 1) throw new Error('Native popup target not unique');
		const targets = await cdpDeadline(root.send('Target.getTargets'), 'snapshot-timeout');
		const matches = targets.targetInfos.filter((info) => {
			if (info.type !== 'page' && info.type !== 'tab') return false;
			try {
				const url = new URL(info.url);
				return (
					url.origin === context.origin &&
					url.pathname === expectedPath &&
					url.search === '' &&
					url.hash === ''
				);
			} catch {
				return false;
			}
		});
		if (
			matches.length !== 1 ||
			matches[0].targetId !== targetId ||
			matches[0].browserContextId !== contextId
		)
			throw new Error('Native popup destination identity mismatch');
		const expression = `JSON.stringify((() => {
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
		let document;
		const until = Date.now() + 3_000;
		do {
			const result = await bridge.send('Runtime.evaluate', { expression, returnByValue: true });
			if (result.exceptionDetails || typeof result.result?.value !== 'string')
				throw new Error('Native popup DOM evaluation failed');
			document = JSON.parse(result.result.value);
			if (document.readyState === 'complete' && document.proof !== 'unexpected') break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		} while (Date.now() < until);
		const capture = await bridge.send('Page.captureScreenshot', { format: 'png' });
		const png = Buffer.from(capture.data ?? '', 'base64');
		if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
			throw new Error('Native popup screenshot is not PNG');
		fs.writeFileSync(screenshotPath, png);
		if (bridge.eventErrors) throw new Error('Native popup CDP event collection failed');
		return { document, errors, pageExposed: exposed, targetId };
	} finally {
		if (onCreated) root.off('Target.targetCreated', onCreated);
		browser.off('page', onPage);
		if (bridge) await bridge.detach().catch(() => undefined);
		if (targetId)
			await cdpDeadline(
				root.send('Target.closeTarget', { targetId }),
				'target-close-timeout'
			).catch(() => undefined);
		await cdpDeadline(
			root.send('Target.setDiscoverTargets', { discover: false }),
			'discovery-stop-timeout'
		).catch(() => undefined);
		await cdpDeadline(root.detach(), 'root-detach-timeout').catch(() => undefined);
	}
}

export async function watchOcuProtocol(
	browser: BrowserContext,
	original: Page,
	sanitize: (url: string) => string | null
) {
	const started = Date.now();
	const events: ProtocolEvent[] = [];
	const attached: string[] = [];
	const sessions: Array<Awaited<ReturnType<BrowserContext['newCDPSession']>>> = [];
	const pending: Promise<void>[] = [];
	let dropped = 0;
	const add = (
		source: ProtocolEvent['source'],
		kind: string,
		info: Omit<ProtocolEvent, 'ms' | 'source' | 'kind'> = {}
	) => {
		if (events.length >= 400) {
			events.splice(100, 1);
			dropped++;
		}
		events.push({ ms: Date.now() - started, source, kind, ...info });
	};
	const originClass = (origin: string) => {
		if (origin === '://') return 'opaque';
		try {
			return new URL(origin).origin === context.origin ? 'same-origin' : 'other';
		} catch {
			return origin === 'null' ? 'opaque' : 'unknown';
		}
	};
	const attach = async (page: Page, source: 'original' | 'exposed') => {
		try {
			const session = await browser.newCDPSession(page);
			sessions.push(session);
			const documents = new Map<string, string | null>();
			session.on('Page.frameNavigated', ({ frame }) =>
				add(source, 'frameNavigated', { frameId: frame.id, path: sanitize(frame.url) })
			);
			session.on('Page.frameStartedLoading', ({ frameId }) =>
				add(source, 'frameStartedLoading', { frameId })
			);
			session.on('Page.frameStoppedLoading', ({ frameId }) =>
				add(source, 'frameStoppedLoading', { frameId })
			);
			session.on('Page.lifecycleEvent', ({ frameId, name }) =>
				add(source, 'lifecycleEvent', { frameId, value: name })
			);
			session.on('Runtime.executionContextCreated', ({ context: execution }) =>
				add(source, 'executionContextCreated', {
					value: execution.id,
					path: originClass(execution.origin)
				})
			);
			session.on('Runtime.executionContextDestroyed', ({ executionContextId }) =>
				add(source, 'executionContextDestroyed', { value: executionContextId })
			);
			session.on('Network.requestWillBeSent', ({ type, requestId, request }) => {
				if (type !== 'Document') return;
				const path = sanitize(request.url);
				documents.set(requestId, path);
				add(source, 'documentRequested', { requestId, path });
			});
			session.on('Network.responseReceived', ({ type, requestId, response }) => {
				if (type !== 'Document') return;
				documents.set(requestId, sanitize(response.url));
				add(source, 'documentResponse', {
					requestId,
					path: documents.get(requestId),
					status: response.status
				});
			});
			session.on('Network.loadingFinished', ({ requestId }) => {
				if (!documents.has(requestId)) return;
				add(source, 'documentFinished', { requestId, path: documents.get(requestId) });
				documents.delete(requestId);
			});
			session.on('Network.loadingFailed', ({ requestId, errorText }) => {
				if (!documents.has(requestId)) return;
				add(source, 'documentFailed', {
					requestId,
					path: documents.get(requestId),
					value: /^net::[A-Z_]+$/.test(errorText) ? errorText : 'other'
				});
				documents.delete(requestId);
			});
			await Promise.all([
				session.send('Page.enable'),
				session.send('Runtime.enable'),
				session.send('Network.enable')
			]);
			await session.send('Page.setLifecycleEventsEnabled', { enabled: true });
			const info = await session.send('Target.getTargetInfo').catch(() => null);
			attached.push(source);
			add(source, 'attached', {
				targetId: info?.targetInfo.targetId,
				path: sanitize(page.url())
			});
		} catch {
			add(source, 'attachFailed');
		}
	};
	let root: Awaited<ReturnType<BrowserContext['newCDPSession']>> | undefined;
	try {
		root = await browser.browser()?.newBrowserCDPSession();
		if (root) {
			sessions.push(root);
			root.on('Target.targetCreated', ({ targetInfo }) =>
				add('browser', 'targetCreated', {
					targetId: targetInfo.targetId,
					openerId: targetInfo.openerId,
					path: sanitize(targetInfo.url),
					value: targetInfo.type
				})
			);
			root.on('Target.targetInfoChanged', ({ targetInfo }) =>
				add('browser', 'targetInfoChanged', {
					targetId: targetInfo.targetId,
					openerId: targetInfo.openerId,
					path: sanitize(targetInfo.url),
					value: targetInfo.type
				})
			);
			root.on('Target.targetDestroyed', ({ targetId }) =>
				add('browser', 'targetDestroyed', { targetId })
			);
			root.on('Target.targetCrashed', ({ targetId, status }) =>
				add('browser', 'targetCrashed', { targetId, value: status })
			);
			await root.send('Target.setDiscoverTargets', { discover: true });
		}
		if (!root) add('browser', 'discoveryUnavailable');
	} catch {
		add('browser', 'discoveryUnavailable');
	}
	await attach(original, 'original');
	const onPage = (page: Page) => {
		if (page === original) return;
		pending.push(attach(page, 'exposed'));
	};
	browser.on('page', onPage);
	return {
		events,
		attached,
		get dropped() {
			return dropped;
		},
		async close() {
			browser.off('page', onPage);
			await Promise.allSettled(pending);
			if (root)
				await root.send('Target.setDiscoverTargets', { discover: false }).catch(() => undefined);
			await Promise.allSettled(sessions.map((session) => session.detach()));
		}
	};
}

export async function writeOcuFailureEvidence(
	record: {
		pending: Promise<void>[];
		active: Page;
		browser: BrowserContext;
		events: unknown[];
		anchorPath: string | null;
		gestures: OcuClickProbe[];
		protocol?: Awaited<ReturnType<typeof watchOcuProtocol>>;
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
	const observed = record.protocol?.events ?? [];
	const attachedIds = new Set(
		observed
			.filter((event) => event.kind === 'attached')
			.map((event) => event.targetId)
			.filter((id): id is string => !!id)
	);
	const unattachedTargets =
		!record.protocol || observed.some((event) => event.kind === 'discoveryUnavailable')
			? null
			: observed
					.filter(
						(event) =>
							event.kind === 'targetCreated' &&
							(event.value === 'page' || event.value === 'tab') &&
							event.targetId &&
							!attachedIds.has(event.targetId)
					)
					.map(({ targetId, path, openerId, value }) => ({
						targetId,
						path,
						openerId,
						type: value
					}));
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
				protocol: record.protocol && {
					events: record.protocol.events,
					attached: record.protocol.attached,
					dropped: record.protocol.dropped,
					unattachedTargets,
					attachmentIdentityUnknown: observed.some(
						(event) => event.kind === 'attached' && !event.targetId
					)
				},
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
