import { test, expect, type Browser } from '@playwright/test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer as createSocket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadConfigFromFile, type ViteDevServer } from 'vite';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const dependencies = [
	'@tiptap/extension-bubble-menu',
	'@tiptap/extension-table',
	'prosemirror-state'
];

async function loadCachePolicy(root: string, harness: string, cacheDir: string | undefined) {
	const values = {
		OCU_UI_PROXY_HARNESS: harness,
		OCU_UI_VITE_CACHE_DIR: cacheDir,
		OCU_UI_SVELTEKIT_OUT_DIR: join(root, 'svelte-kit')
	};
	const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
	try {
		for (const [key, value] of Object.entries(values)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		const loaded = await loadConfigFromFile(
			{ command: 'serve', mode: 'development' },
			join(repoRoot, 'vite.config.ts'),
			repoRoot
		);
		if (!loaded) throw new Error('Repository Vite configuration was not loaded');
		return loaded.config.cacheDir;
	} finally {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

async function freePort() {
	const socket = createSocket();
	try {
		await new Promise<void>((resolve, reject) => {
			socket.once('error', reject);
			socket.listen(0, '127.0.0.1', resolve);
		});
		const address = socket.address();
		if (!address || typeof address === 'string') throw new Error('TCP port was not allocated');
		return address.port;
	} finally {
		if (socket.listening) {
			await new Promise<void>((resolve, reject) =>
				socket.close((error) => (error ? reject(error) : resolve()))
			);
		}
	}
}

async function startServer(
	root: string,
	cacheDir: string | undefined,
	servers: Set<ViteDevServer>,
	include?: string[]
) {
	const server = await createServer({
		root,
		configFile: false,
		cacheDir,
		// A discovers lazily; B legitimately replaces the shared optimizer generation.
		optimizeDeps: { entries: [], ...(include ? { include, force: true } : {}) },
		// Vite treats port 0 as its default port, not an ephemeral allocation.
		server: { host: '127.0.0.1', port: await freePort(), strictPort: true }
	});
	servers.add(server);
	await server.listen();
	return server;
}

async function visit(browser: Browser, server: ViteDevServer, stage: string) {
	const page = await browser.newPage();
	try {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		const origin = server.resolvedUrls?.local[0];
		if (!origin) throw new Error(`${stage}: Vite did not expose a local URL`);
		const response = await page.goto(origin);
		expect(response?.ok(), `${stage}: fixture HTTP status`).toBe(true);
		await expect
			.poll(
				async () => ({
					errors: [...errors],
					completion: await page.getByRole('status').innerText(),
					visible: await page.getByRole('status').isVisible()
				}),
				{ message: `${stage}: real dependencies evaluate without page errors` }
			)
			.toEqual({ errors: [], completion: 'Dependencies evaluated', visible: true });
	} finally {
		await page.close();
	}
}

test('owned UI optimizer cache preserves dependency evaluation in a reused default frontend', async ({
	browser
}) => {
	let root = await mkdtemp(join(tmpdir(), 'vite-cache-e2e-'));
	const servers = new Set<ViteDevServer>();
	const failures: unknown[] = [];
	try {
		root = await realpath(root);
		await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
		// Keep node_modules itself real: Vite's default .vite cache must stay in this owned root.
		await mkdir(join(root, 'node_modules'));
		for (const dependency of ['@tiptap', 'prosemirror-state', 'prosemirror-tables']) {
			await symlink(
				join(repoRoot, 'node_modules', dependency),
				join(root, 'node_modules', dependency)
			);
		}
		await writeFile(
			join(root, 'index.html'),
			'<!doctype html><html><body><output role="status"></output><script type="module" src="/entry.js"></script></body></html>'
		);
		await writeFile(
			join(root, 'entry.js'),
			dependencies.map((dependency) => `import '${dependency}';`).join('\n') +
				'\ndocument.querySelector("output").textContent = "Dependencies evaluated";\n'
		);
		const privateCache = join(root, 'harness-cache');
		const defaultCache = await loadCachePolicy(root, 'false', privateCache);
		const harnessCache = await loadCachePolicy(root, 'true', privateCache);
		const first = await startServer(root, defaultCache, servers);
		await visit(browser, first, 'cold default frontend');
		const second = await startServer(root, harnessCache, servers, [
			...[...dependencies].reverse(),
			'prosemirror-tables'
		]);
		await visit(browser, second, 'cold owned frontend');
		await second.close();
		servers.delete(second);
		await visit(browser, first, 'cached default frontend');
		first.moduleGraph.invalidateAll();
		await visit(browser, first, 'invalidated default frontend');
	} catch (error) {
		failures.push(error);
	}
	const results = await Promise.allSettled([...servers].map((server) => server.close()));
	results.push(...(await Promise.allSettled([rm(root, { recursive: true, force: true })])));
	failures.push(
		...results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
	);
	if (failures.length === 1) throw failures[0];
	if (failures.length > 1) throw new AggregateError(failures, 'Vite cache fixture failed');
});

for (const [name, cacheDir] of [
	['missing', undefined],
	['empty', '']
] as const) {
	test(`owned UI frontend rejects ${name} optimizer cache during configuration loading`, async () => {
		let root = await mkdtemp(join(tmpdir(), 'vite-cache-boundary-e2e-'));
		try {
			root = await realpath(root);
			let configError: unknown;
			try {
				await loadCachePolicy(root, 'true', cacheDir);
			} catch (error) {
				configError = error;
			}
			expect(
				configError,
				'missing cache prerequisite must fail during configuration loading'
			).toBeInstanceOf(Error);
			expect(String(configError)).toContain('OCU_UI_VITE_CACHE_DIR');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
}
