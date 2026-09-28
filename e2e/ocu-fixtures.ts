import * as fs from 'node:fs';
import { expect, type BrowserContext, type Page } from '@playwright/test';

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
