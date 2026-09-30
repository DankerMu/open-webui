import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { attachCdpTarget, cdpDeadline } from './ocu-target-bridge.mjs';

const proofScript = `
let storage='blocked',parentAccess='blocked',cookie='blocked';
try { localStorage.getItem('fixture'); storage='leaked'; } catch {}
try { window.parent.localStorage.getItem('fixture'); parentAccess='leaked'; } catch {}
try { cookie=document.cookie ? 'leaked' : 'blocked'; } catch {}
document.querySelector('#proof').textContent=[self.origin,storage,parentAccess,cookie].join('|');
window.parent.postMessage({type:'fixture',storage,parentAccess,cookie},'*');
`;
const documents = {
	html: `<!doctype html><span id="proof"></span><script>${proofScript}</script>`,
	svg: `<svg xmlns="http://www.w3.org/2000/svg"><text id="proof">waiting</text><script><![CDATA[${proofScript}]]></script></svg>`
};
const expression = `JSON.stringify({path:location.pathname,readyState:document.readyState,
 proof:document.querySelector('#proof')?.textContent??null,
 collectorInstalled:Array.isArray(window.fixtureEvents),events:window.fixtureEvents??null})`;

function serve(request, response) {
	const url = new URL(request.url, 'http://127.0.0.1');
	if (url.pathname === '/source') {
		response.writeHead(200, {
			'Content-Type': 'text/html',
			'Set-Cookie': 'fixture=present; Path=/; SameSite=Lax'
		});
		response.end(`<a target="_blank" href="/file?${url.searchParams}">Open</a>`);
		return;
	}
	const type = url.searchParams.get('type');
	if (url.pathname !== '/file' || !Object.hasOwn(documents, type)) {
		response.writeHead(404);
		response.end();
		return;
	}
	response.writeHead(200, {
		'Content-Type': type === 'svg' ? 'image/svg+xml' : 'text/html',
		'X-Content-Type-Options': 'nosniff',
		...(url.searchParams.get('variant') === 'sandbox'
			? { 'Content-Security-Policy': 'sandbox allow-scripts allow-forms' }
			: {})
	});
	response.end(documents[type]);
}

async function documentState(bridge) {
	const deadline = Date.now() + 3000;
	let document;
	do {
		const result = await bridge.send('Runtime.evaluate', { expression, returnByValue: true });
		if (result.exceptionDetails || typeof result.result?.value !== 'string')
			throw new Error('evaluation-failed');
		document = JSON.parse(result.result.value);
		if (document.readyState === 'complete' && document.events?.length) return document;
		await new Promise((resolve) => setTimeout(resolve, 25));
	} while (Date.now() < deadline);
	return document;
}

function matches(document, variant, origin) {
	const access = variant === 'sandbox' ? 'blocked' : 'leaked';
	const event = document.events?.[0];
	return (
		document.path === '/file' &&
		document.readyState === 'complete' &&
		document.proof ===
			[variant === 'sandbox' ? 'null' : origin, access, access, access].join('|') &&
		document.collectorInstalled &&
		document.events.length === 1 &&
		event.origin === (variant === 'sandbox' ? 'null' : origin) &&
		event.type === 'fixture' &&
		event.storage === access &&
		event.parentAccess === access &&
		event.cookie === access
	);
}

async function attempt(browser, origin, type, variant, index) {
	const context = await browser.newContext();
	let root, bridge, onCreated;
	const row = { type, variant, index };
	try {
		await context.addInitScript(() => {
			window.fixtureEvents = [];
			window.addEventListener('message', (event) => {
				if (event.data?.type === 'fixture')
					window.fixtureEvents.push({ origin: event.origin, ...event.data });
			});
		});
		const source = await context.newPage();
		const query = new URLSearchParams({ type, variant, index: String(index) });
		await source.goto(`${origin}/source?${query}`);
		root = await browser.newBrowserCDPSession();
		await root.send('Target.setDiscoverTargets', { discover: true });
		const { targetInfos } = await root.send('Target.getTargets');
		const sourceInfo = targetInfos.find((info) => info.url === source.url());
		if (!sourceInfo?.browserContextId) throw new Error('source-identity-missing');
		const existing = new Set(targetInfos.map((info) => info.targetId));
		const created = Promise.withResolvers();
		const candidates = new Set();
		created.promise.catch(() => {});
		onCreated = ({ targetInfo }) => {
			if (
				existing.has(targetInfo.targetId) ||
				targetInfo.browserContextId !== sourceInfo.browserContextId ||
				!['page', 'tab'].includes(targetInfo.type)
			)
				return;
			candidates.add(targetInfo.targetId);
			created.resolve(targetInfo.targetId);
		};
		root.on('Target.targetCreated', onCreated);
		await source.getByRole('link', { name: 'Open' }).click({ modifiers: ['ControlOrMeta'] });
		const targetId = await cdpDeadline(created.promise, 'target-timeout');
		bridge = await attachCdpTarget(root, targetId);
		await bridge.send('Runtime.enable');
		row.document = await documentState(bridge);
		const info = (await root.send('Target.getTargetInfo', { targetId })).targetInfo;
		row.identity =
			info.url === `${origin}/file?${query}` &&
			info.browserContextId === sourceInfo.browserContextId &&
			candidates.size === 1;
		row.pass = row.identity && matches(row.document, variant, origin);
	} catch (error) {
		row.pass = false;
		row.error = error.name;
	} finally {
		if (onCreated) root.off('Target.targetCreated', onCreated);
		if (bridge) await bridge.detach();
		if (root) await root.detach();
		await context.close();
	}
	return row;
}

const server = createServer(serve);
let browser;
const report = { platform: process.platform, node: process.version, attempts: [] };
try {
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const origin = `http://127.0.0.1:${server.address().port}`;
	browser = await chromium.launch({ headless: true });
	report.browser = browser.version();
	for (const type of ['html', 'svg'])
		for (const variant of ['sandbox', 'plain'])
			for (let index = 0; index < 25; index++)
				report.attempts.push(await attempt(browser, origin, type, variant, index));
} finally {
	if (browser) await browser.close();
	await new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve()))
	);
	await mkdir('.run/ocu-popup-repro', { recursive: true });
	await writeFile('.run/ocu-popup-repro/report.json', JSON.stringify(report, null, 2) + '\n');
}
const failed = report.attempts.filter((row) => !row.pass);
console.log(JSON.stringify({ total: report.attempts.length, failed: failed.length }));
if (failed.length || report.attempts.length !== 100) process.exitCode = 1;
