import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PAGE = `<!doctype html>
<html>
<body>
<script type="module">
import { loadPyodide } from '/pyodide/pyodide.mjs';
window.__pyodideReady = loadPyodide({ indexURL: '/pyodide/', packages: ['micropip'] });
</script>
</body>
</html>`;

export function pngInfo(bytes) {
	const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	if (PNG_SIGNATURE.some((value, index) => data[index] !== value)) {
		throw new Error('plot is not a PNG');
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

function fail(message, extra) {
	console.error(JSON.stringify({ error: message, ...extra }, null, 2));
	process.exitCode = 1;
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
		const plot = pyodide.runPython(`
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from io import BytesIO
fig, ax = plt.subplots()
sns.lineplot(data=pd.DataFrame({"x":[1,2], "y":[3,4]}), x="x", y="y", ax=ax)
line = ax.lines[0]
xs = [float(v) for v in line.get_xdata()]
ys = [float(v) for v in line.get_ydata()]
buf = BytesIO()
fig.canvas.print_png(buf)
png = list(buf.getvalue())
{"x": xs, "y": ys, "png": png, "width": int(fig.canvas.get_width_height()[0]), "height": int(fig.canvas.get_width_height()[1])}
`);
		const workbook = pyodide.runPython(
			'from io import BytesIO; from openpyxl import Workbook, load_workbook; wb=Workbook(); wb.active["A1"]="ocu"; buf=BytesIO(); wb.save(buf); load_workbook(BytesIO(buf.getvalue())).active["A1"].value'
		);
		return { imported, numeric, plot, workbook };
	}, packages);
}

async function closeOwned(browser, server) {
	const failures = [];
	if (browser) await browser.close().catch((error) => failures.push(error));
	await new Promise((resolveClose) => {
		const timer = setTimeout(() => resolveClose(), 3_000);
		server.close(() => {
			clearTimeout(timer);
			resolveClose();
		});
	});
	if (failures.length) throw failures[0];
}

export async function verifyBundle(root, options = {}) {
	const timeout = options.timeout ?? 120_000;
	await stat(resolve(root, 'pyodide-lock.json'));
	const server = await serveBundle(root);
	const origin = `http://127.0.0.1:${server.address().port}`;
	const denied = [];
	const browserErrors = [];
	let browser;
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		closeOwned(browser, server).catch(() => undefined);
	}, timeout);
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
		if (timedOut) throw new Error('pyodide-offline-timeout');
		return { result, denied, browserErrors, origin };
	} catch (error) {
		if (timedOut) throw new Error('pyodide-offline-timeout');
		throw error;
	} finally {
		clearTimeout(timer);
		await closeOwned(browser, server).catch(() => undefined);
	}
}

function plotMatches(plot) {
	if (!plot || JSON.stringify(plot.x) !== '[1,2]' || JSON.stringify(plot.y) !== '[3,4]')
		return false;
	const info = pngInfo(Uint8Array.from(plot.png ?? []));
	return (
		info.width === plot.width && info.height === plot.height && info.width > 0 && info.height > 0
	);
}

const launchedDirectly =
	process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
	const root = resolve(process.argv[2] ?? process.env.BUNDLE ?? 'static/pyodide');
	try {
		const proof = await verifyBundle(root);
		if (proof.denied.length) fail('nonlocal request observed', { denied: proof.denied });
		else if (proof.browserErrors.length)
			fail('browser error', { browserErrors: proof.browserErrors });
		else if (
			proof.result.numeric !== 10 ||
			!plotMatches(proof.result.plot) ||
			proof.result.workbook !== 'ocu'
		)
			fail('operation mismatch', {
				result: {
					numeric: proof.result.numeric,
					workbook: proof.result.workbook,
					plot: {
						x: proof.result.plot?.x,
						y: proof.result.plot?.y,
						width: proof.result.plot?.width,
						height: proof.result.plot?.height
					}
				}
			});
		else if (proof.result.imported.join(',') !== SUPPORTED_ROOTS.join(','))
			fail('import mismatch', { result: proof.result });
		else
			console.log(
				JSON.stringify({ ok: true, imported: proof.result.imported, origin: proof.origin })
			);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}
}
