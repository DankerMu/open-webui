import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { SUPPORTED_ROOTS } from './prepare-pyodide.js';

const TYPES = {
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.zip': 'application/zip',
	'.whl': 'application/octet-stream',
	'.map': 'application/json',
	'.html': 'text/html'
};
const SAFE_FILE = /^[A-Za-z0-9._+-]+$/;
const DEADLINE_MS = 120_000;
const PAGE = `<!doctype html>
<html>
<body>
<script type="module">
import { loadPyodide } from '/pyodide/pyodide.mjs';
window.__pyodideReady = loadPyodide({ indexURL: '/pyodide/', packages: ['micropip'] });
</script>
</body>
</html>`;

function fail(message, extra) {
	console.error(JSON.stringify({ error: message, ...extra }, null, 2));
	process.exitCode = 1;
}

function withDeadline(work, label) {
	const gate = Promise.withResolvers();
	const timer = setTimeout(() => gate.reject(new Error(label)), DEADLINE_MS);
	return Promise.race([work, gate.promise]).finally(() => clearTimeout(timer));
}

async function serveBundle(root) {
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? '/', 'http://127.0.0.1');
			if (url.pathname === '/' || url.pathname === '/index.html') {
				response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				response.end(PAGE);
				return;
			}
			if (!url.pathname.startsWith('/pyodide/')) {
				response.writeHead(404);
				response.end();
				return;
			}
			const name = decodeURIComponent(url.pathname.slice('/pyodide/'.length));
			if (
				name !== basename(name) ||
				name.includes('/') ||
				name.includes('\\') ||
				!SAFE_FILE.test(name)
			) {
				response.writeHead(403);
				response.end();
				return;
			}
			const body = await readFile(resolve(root, name));
			response.writeHead(200, {
				'Content-Type': TYPES[extname(name)] ?? 'application/octet-stream',
				'Cache-Control': 'no-store'
			});
			response.end(body);
		} catch {
			if (!response.headersSent) response.writeHead(404);
			response.end();
		}
	});
	await new Promise((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolveListen());
	});
	return server;
}

async function runOperations(page, packages) {
	return page.evaluate(async (roots) => {
		const pyodide = await window.__pyodideReady;
		const micropip = pyodide.pyimport('micropip');
		await micropip.install(roots);
		const imported = [];
		for (const name of roots) {
			const module =
				name === 'scikit-learn'
					? 'sklearn'
					: name === 'beautifulsoup4'
						? 'bs4'
						: name.replaceAll('-', '_');
			pyodide.pyimport(module);
			imported.push(name);
		}
		const numeric = pyodide.runPython(
			'import numpy as np; import pandas as pd; int(pd.Series([1,2,3]).sum() + np.array([4]).sum())'
		);
		pyodide.runPython(
			'import matplotlib; matplotlib.use("Agg"); import seaborn as sns; import pandas as pd; sns.lineplot(data=pd.DataFrame({"x":[1,2],"y":[3,4]}), x="x", y="y")'
		);
		const plot = pyodide.runPython('len(sns.color_palette())');
		const workbook = pyodide.runPython(
			'from io import BytesIO; from openpyxl import Workbook, load_workbook; wb=Workbook(); wb.active["A1"]="ocu"; buf=BytesIO(); wb.save(buf); load_workbook(BytesIO(buf.getvalue())).active["A1"].value'
		);
		return { imported, numeric, plot, workbook };
	}, packages);
}

async function verifyBundle(root) {
	await stat(resolve(root, 'pyodide-lock.json'));
	const server = await serveBundle(root);
	const origin = `http://127.0.0.1:${server.address().port}`;
	const denied = [];
	const browserErrors = [];
	let browser;
	try {
		browser = await chromium.launch({ headless: true });
		const context = await browser.newContext();
		await context.route('**/*', async (route) => {
			const url = new URL(route.request().url());
			if (url.origin === origin) {
				await route.continue();
				return;
			}
			denied.push(url.href);
			await route.abort('blockedbyclient');
		});
		const page = await context.newPage();
		page.on('pageerror', (error) => browserErrors.push(String(error)));
		page.on('console', (message) => {
			if (message.type() === 'error') browserErrors.push(message.text());
		});
		await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
		const result = await runOperations(page, SUPPORTED_ROOTS);
		return { result, denied, browserErrors, origin };
	} finally {
		if (browser) await browser.close().catch(() => undefined);
		await new Promise((resolveClose) => server.close(() => resolveClose()));
	}
}

const root = resolve(process.argv[2] ?? process.env.BUNDLE ?? 'static/pyodide');

try {
	const proof = await withDeadline(verifyBundle(root), 'pyodide-offline-timeout');
	if (proof.denied.length) fail('nonlocal request observed', { denied: proof.denied });
	else if (proof.browserErrors.length)
		fail('browser error', { browserErrors: proof.browserErrors });
	else if (
		proof.result.numeric !== 10 ||
		Number(proof.result.plot) < 1 ||
		proof.result.workbook !== 'ocu'
	)
		fail('operation mismatch', { result: proof.result });
	else if (proof.result.imported.join(',') !== SUPPORTED_ROOTS.join(','))
		fail('import mismatch', { result: proof.result });
	else
		console.log(
			JSON.stringify({ ok: true, imported: proof.result.imported, origin: proof.origin })
		);
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
