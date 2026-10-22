import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	expect,
	test,
	type BrowserContext,
	type CDPSession,
	type ConsoleMessage,
	type Frame,
	type Page,
	type Request,
	type Response,
	type WebError
} from '@playwright/test';
import {
	context,
	records,
	assertGrantedFile,
	isGrantedFile,
	captureBrowserTargetPaths,
	evidence,
	type GrantedDocument,
	type OcuClickProbe
} from './ocu-fixtures';
import {
	WireRows,
	describeRefusal,
	formatBufferHits,
	matchesRefusal,
	redactOcu,
	type Refusal
} from './ocu-wire-rows';

export type EvaluateDocument = (expression: string) => Promise<unknown>;
const RESOURCE_NAMES = [
	'style.css',
	'relative.png',
	'font.ttf',
	'classic.js',
	'module.js',
	'data.json'
];
const RESOURCE_EXPRESSION = `(() => {
 const text = id => document.getElementById(id)?.textContent;
 const font = document.getElementById('font'), control = document.getElementById('font-control');
 const image = document.getElementById('relative-image');
 const inlineImage = document.getElementById('image');
 return {
  proof: text('proof'), inline: getComputedStyle(document.getElementById('inline')).color,
  inlineImage: [inlineImage.complete, inlineImage.naturalWidth, inlineImage.naturalHeight],
  styled: getComputedStyle(document.getElementById('styled')).color,
  image: [image.complete, image.naturalWidth, image.naturalHeight],
  font: text('font-loaded'), appliedFont: getComputedStyle(font).fontFamily,
  loadedFace: [...document.fonts].some(face => face.family === 'ResourceFixture' && face.status === 'loaded'),
  differentMetrics: Math.abs(font.getBoundingClientRect().width-control.getBoundingClientRect().width)>1,
  classic: text('classic'), module: text('module'), fetched: text('fetch')
 };
})()`;

export async function expectResources(evaluate: EvaluateDocument) {
	await evaluate(`document.getElementById('relative-image').decode()`);
	await expect
		.poll(() => evaluate(RESOURCE_EXPRESSION))
		.toEqual({
			proof: 'null|blocked|blocked|blocked',
			inline: 'rgb(0, 128, 0)',
			inlineImage: [true, 1, 1],
			styled: 'rgb(17, 34, 51)',
			image: [true, 1, 1],
			font: 'loaded',
			appliedFont: 'ResourceFixture, monospace',
			loadedFace: true,
			differentMetrics: true,
			classic: 'classic-loaded',
			module: 'ocu-stub-module',
			fetched: 'relative-fetch-loaded'
		});
	await evaluate(`document.getElementById('run').click()`);
	expect(await evaluate(`document.getElementById('clicked').textContent`)).toBe('clicked');
}

export class ResourceObserver {
	readonly responses: Response[] = [];
	readonly requests: Array<{ url: string; method: string }> = [];
	readonly diagnostics: Array<{ url: string; text: string }> = [];
	private readonly wires = new WireRows((request) => this.requests.push(request));
	private readonly allowances = new Map<string, number>();
	private readonly disposers: Array<() => Promise<void>> = [];
	constructor(readonly browser: BrowserContext) {
		const request = (request: Request) =>
			this.requests.push({ url: request.url(), method: request.method() });
		const response = (response: Response) => this.responses.push(response);
		const consoleError = (message: ConsoleMessage) => {
			if (message.type() === 'error')
				this.diagnostics.push({
					url: redactOcu(message.location().url),
					text: redactOcu(message.text())
				});
		};
		const webError = (error: WebError) =>
			this.diagnostics.push({ url: '', text: redactOcu(error.error().message) });
		browser.on('request', request);
		browser.on('response', response);
		browser.on('console', consoleError);
		browser.on('weberror', webError);
		this.disposers.push(async () => {
			browser.off('request', request);
			browser.off('response', response);
			browser.off('console', consoleError);
			browser.off('weberror', webError);
		});
	}
	onNetwork = (method: string, payload: unknown, session = 'native') =>
		this.wires.observe(method, payload, session);
	async attach(target: Page | Frame) {
		let session: CDPSession;
		try {
			session = await this.browser.newCDPSession(target);
		} catch (error) {
			if (
				!('page' in target) ||
				!String(error).includes('This frame does not have a separate CDP session')
			)
				throw error;
			session = await this.browser.newCDPSession(target.page());
		}
		const sessionId = randomUUID();
		for (const method of [
			'Network.requestWillBeSent',
			'Network.requestWillBeSentExtraInfo',
			'Network.responseReceived',
			'Network.responseReceivedExtraInfo',
			'Network.loadingFinished',
			'Network.loadingFailed'
		])
			session.on(method, (params) => this.onNetwork(method, params, sessionId));
		this.disposers.push(() => session.detach());
		await session.send('Network.enable');
	}
	async document(canonical: string, since = 0) {
		await expect
			.poll(() =>
				this.responses.slice(since).some((response) => isGrantedFile(response.url(), canonical))
			)
			.toBe(true);
		const response = this.responses
			.slice(since)
			.find((response) => isGrantedFile(response.url(), canonical))!;
		const document = await assertGrantedFile(response, canonical);
		expect(document.headers['content-security-policy']).toBe('sandbox allow-scripts allow-forms');
		expect(document.headers['x-content-type-options']).toBe('nosniff');
		return document;
	}
	async resources(document: GrantedDocument, offset: number) {
		for (const name of RESOURCE_NAMES) {
			const url = new URL(name, document.url).href;
			const found = () =>
				this.responses.some((response) => response.url() === url && response.status() === 200) ||
				this.wires.nativeResponses.some(
					(response) => response.url === url && response.status === 200
				);
			await expect.poll(found, name).toBe(true);
			const response = this.responses.find(
				(response) => response.url() === url && response.status() === 200
			);
			const native = this.wires.nativeResponses.find(
				(response) => response.url === url && response.status === 200
			);
			const headers = response?.headers() ?? native!.headers;
			expect(headers['cache-control']).toBe('no-store');
			expect(headers['referrer-policy']).toBe('no-referrer');
			const origin = response ? (await response.request().allHeaders()).origin : native!.origin;
			if (origin === 'null') {
				expect(headers['access-control-allow-origin']).toBe('null');
				expect(headers.vary?.split(',').map((value) => value.trim())).toContain('Origin');
			}
			expect(headers['access-control-allow-credentials']).toBeUndefined();
			const chat = new URL(document.url).pathname.split('/')[4];
			const target = `/files/${chat}/${name}`;
			const arrivals = records()
				.slice(offset)
				.filter(
					(row) => row.record_type === 'arrival' && row.method === 'GET' && row.target === target
				);
			expect(arrivals.length, `${name} reached OCU`).toBeGreaterThan(0);
			for (const row of arrivals) {
				expect(row.token_ok).toBe(true);
				expect(row.identity['x-chat-id']).toBe(chat);
				expect(Boolean(row.identity['x-user-id'])).toBe(true);
				expect(row.identity['x-user-email']).toBe(process.env.OCU_E2E_EMAIL);
				expect(row.credential_headers).toEqual([]);
			}
		}
	}
	async refused(refusal: Refusal, offset: number) {
		const { url, method, status } = refusal;
		const rows = () => [...this.wires.rows.values()];
		try {
			await expect.poll(() => rows().some((row) => matchesRefusal(row, refusal))).toBe(true);
		} catch (error) {
			// Playwright sets testInfo.status only after the body returns, so dump the rows here.
			fs.writeFileSync(
				test.info().outputPath('wire-rows.json'),
				redactOcu(JSON.stringify(rows(), null, 2))
			);
			throw new Error(describeRefusal(refusal, rows()), { cause: error });
		}
		const row = rows().find((row) => matchesRefusal(row, refusal))!;
		expect(row.origin).toBe('null');
		expect(
			row.authorityObserved,
			'exact attempted request has complete authority-header observation'
		).toBe(true);
		expect(row.cookie, 'generated request carries no cookie').toBe(false);
		expect(row.authorization, 'generated request carries no Authorization').toBe(false);
		this.allowances.set(redactOcu(url), status);
		const address = new URL(url);
		const upstream =
			address.pathname.replace(/^\/ocu\/f\/[^/]+\//, '/files/').replace(/^\/ocu\//, '/') +
			address.search;
		expect(
			records()
				.slice(offset)
				.some(
					(row) => row.record_type === 'arrival' && row.method === method && row.target === upstream
				),
			'exact denied request never reached OCU'
		).toBe(false);
	}
	expectedDiagnostic(url: string, text: string) {
		return [...this.allowances].some(
			([target, status]) =>
				(redactOcu(url) === target || redactOcu(text).includes(target)) &&
				(text.includes('CORS policy') ||
					text.includes('net::ERR_FAILED') ||
					new RegExp(`Failed to load resource.*\\b${status}\\b`).test(text))
		);
	}
	async denials(evaluate: EvaluateDocument) {
		const paths = (await evaluate('window.denialProbes')) as string[];
		expect(paths).toHaveLength(3);
		const offset = records().length;
		await evaluate('window.runDenialProbes()');
		expect(await evaluate(`document.getElementById('denials').textContent`)).toBe(
			'blocked|blocked|blocked'
		);
		for (let index = 0; index < paths.length; index++)
			await this.refused(
				{
					probe: index,
					url: new URL(paths[index], context.origin).href,
					method: 'POST',
					status: index === 0 ? 401 : 403,
					visibility: index === 0 ? 'authorization' : 'cors'
				},
				offset
			);
	}
	assertErrors(extra: Array<{ url: string; text: string }> = []) {
		expect(
			[...this.diagnostics, ...extra].filter(({ url, text }) => !this.expectedDiagnostic(url, text))
		).toEqual([]);
	}
	async close() {
		const results = await Promise.allSettled(this.disposers.reverse().map((dispose) => dispose()));
		// Every test, pass or fail: the list reporter prints test stdout into the CI log.
		const hits = this.wires.bufferHits();
		console.log(formatBufferHits(hits));
		test.info().annotations.push({ type: 'wire-buffer-hits', description: JSON.stringify(hits) });
		this.wires.clear();
		expect(
			results.every((result) => result.status === 'fulfilled'),
			'resource observers retired'
		).toBe(true);
	}
}

export type ShortOwnerSession = { expiry: number; restore: () => Promise<void> };

export async function shortOwnerSession(browser: BrowserContext): Promise<ShortOwnerSession> {
	const saved = (await browser.cookies(context.origin)).filter((cookie) => cookie.name === 'token');
	expect(saved.length, 'one normal owner cookie is available for restoration').toBe(1);
	const { promise, resolve, reject } = Promise.withResolvers<{ token: string; exp: number }>();
	// The surviving harness owns the inherited browser group, including abandoned mint chains.
	const child = spawn(context.mint.python, ['scripts/verify-ui-ocu.py', '--mint-session'], {
		stdio: ['pipe', 'pipe', 'pipe'],
		env: { PATH: process.env.PATH, HOME: process.env.HOME }
	});
	let output = '';
	let failure: string | undefined;
	const deadline = setTimeout(() => {
		failure = 'Private session mint deadline exceeded';
		reject(new Error(failure));
	}, 65_000);
	child.stdout.on('data', (chunk) => {
		output += chunk;
	});
	child.stderr.resume();
	child.on('error', () => {
		clearTimeout(deadline);
		reject(new Error('Private session mint unavailable'));
	});
	child.on('close', (code) => {
		clearTimeout(deadline);
		if (failure) return reject(new Error(failure));
		if (code !== 0) return reject(new Error('Private session mint failed'));
		try {
			resolve(JSON.parse(output));
		} catch {
			reject(new Error('Private session metadata invalid'));
		}
	});
	child.stdin.on('error', () => {
		failure = 'Private session input unavailable';
		reject(new Error(failure));
	});
	child.stdin.end(JSON.stringify({ config: context.mint.config }));
	const payload = await promise;
	expect(
		typeof payload.token === 'string' && payload.token.length > 0,
		'private mint returned a session'
	).toBe(true);
	expect(
		Number.isFinite(payload.exp) && payload.exp * 1000 > Date.now(),
		'private mint has valid expiry'
	).toBe(true);
	expect(payload.exp * 1000 - Date.now() <= 21_000, 'private mint stays bounded').toBe(true);
	try {
		await browser.addCookies(saved.map((cookie) => ({ ...cookie, value: payload.token })));
	} catch {
		await browser.addCookies(saved);
		throw new Error('Private session cookie adoption failed');
	}
	return { expiry: payload.exp, restore: () => browser.addCookies(saved) };
}

export async function expireDocument(
	observer: ResourceObserver,
	evaluate: EvaluateDocument,
	document: GrantedDocument,
	expiry: number
) {
	const offset = records().length,
		requestOffset = observer.requests.length;
	expect(expiry * 1000 > Date.now(), 'fresh proof completed before actual session expiry').toBe(
		true
	);
	const crossed = Promise.withResolvers<void>();
	setTimeout(crossed.resolve, expiry * 1000 - Date.now() + 150);
	await crossed.promise;
	expect(Date.now() > expiry * 1000, 'actual signed expiry crossed').toBe(true);
	const nonce = randomUUID();
	const url = new URL(`data.json?expiry=${nonce}`, document.url).href;
	await evaluate(`window.probeExpiredResource(${JSON.stringify(nonce)})`);
	expect(await evaluate(`document.getElementById('expiry').textContent`)).toBe('blocked');
	await observer.refused(
		{ probe: 'expiry', url, method: 'GET', status: 404, visibility: 'cors' },
		offset
	);
	await expectResources(evaluate);
	expect(
		(await evaluate('location.href')) === document.url,
		'loaded document identity survived expiry'
	).toBe(true);
	const canonical = new URL(document.canonical).pathname;
	expect(
		observer.requests
			.slice(requestOffset)
			.some((request) => new URL(request.url).pathname === canonical),
		'expired resource did not automatically reissue canonical authority'
	).toBe(false);
}

export async function assertCanonicalState(page: Page, chat: string) {
	const token = await page.evaluate(() => localStorage.token);
	for (const path of [
		`/api/v1/chats/${chat}`,
		`/api/v1/ocu/workspaces/${chat}`,
		`/ocu/api/outputs/${chat}`
	]) {
		const response = await page.request.get(path, {
			headers: { Authorization: `Bearer ${token}` }
		});
		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body.includes('/ocu/f/'), 'persisted chat/workspace identity remains canonical').toBe(
			false
		);
		if (path.startsWith('/api/v1/chats/') && chat === context.chats.link)
			expect(
				body.includes(`/ocu/files/${chat}/page.html`),
				'saved message retains its canonical link'
			).toBe(true);
		if (path.startsWith('/api/v1/ocu/workspaces/'))
			expect(JSON.parse(body).prefs.view, 'saved workspace remains in Files').toBe('files');
		if (path.startsWith('/ocu/api/outputs/')) {
			const files = JSON.parse(body).files;
			expect(
				files.find((file: { path: string; url: string }) => file.path === 'page.html')?.url ===
					`/ocu/files/${chat}/page.html`
			).toBe(true);
		}
	}
	expect(
		await page.evaluate(() =>
			Object.values(localStorage).some((value) => String(value).includes('/ocu/f/'))
		)
	).toBe(false);
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
					(id) => `/ocu/f/[grant]/${id}/style.css`
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
