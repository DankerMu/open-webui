import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildLocalLock,
	initNetworkProxyFromEnv,
	loadDistributionCatalog,
	loadSupplementManifest,
	mergeCatalog,
	preparePyodide,
	publishBundle,
	resolveSupportedClosure
} from './prepare-pyodide.js';

const sha = 'a'.repeat(64);
const distLock = {
	info: { abi_version: '2026_0', arch: 'wasm32', platform: 'emscripten_5_0_3', python: '3.14.0' },
	packages: {
		micropip: {
			name: 'micropip',
			version: '0.11.1',
			file_name: 'micropip-0.11.1-py3-none-any.whl',
			install_dir: 'site',
			sha256: sha,
			package_type: 'package',
			imports: ['micropip'],
			depends: [],
			unvendored_tests: false
		},
		numpy: {
			name: 'numpy',
			version: '2.4.3',
			file_name: 'numpy-2.4.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
			install_dir: 'site',
			sha256: sha,
			package_type: 'package',
			imports: ['numpy'],
			depends: [],
			unvendored_tests: false
		}
	}
};

const owned = [];
afterEach(async () => {
	await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function tempDir() {
	const path = await mkdtemp(join(tmpdir(), 'pyodide-prep-'));
	owned.push(path);
	return path;
}

describe('offline Pyodide material preparation', () => {
	it('rejects a missing supported dependency before publication', () => {
		const catalog = loadDistributionCatalog(distLock, '314.0.3').catalog;
		expect(() => resolveSupportedClosure(catalog, ['seaborn'])).toThrow(
			/Missing dependency seaborn/
		);
	});

	it('keeps existing black versions and records seaborn dependencies', () => {
		const supplements = loadSupplementManifest({
			packages: [
				{
					name: 'black',
					version: '26.5.1',
					file_name: 'black-26.5.1-py3-none-any.whl',
					url: 'https://files.pythonhosted.org/packages/black.whl',
					sha256: sha,
					imports: ['black'],
					depends: ['micropip']
				},
				{
					name: 'seaborn',
					version: '0.13.2',
					file_name: 'seaborn-0.13.2-py3-none-any.whl',
					url: 'https://files.pythonhosted.org/packages/seaborn.whl',
					sha256: sha,
					imports: ['seaborn'],
					depends: ['numpy']
				}
			]
		});
		const catalog = mergeCatalog(loadDistributionCatalog(distLock, '314.0.3'), supplements);
		const needed = resolveSupportedClosure(catalog, ['black', 'seaborn']);
		const lock = buildLocalLock(distLock.info, needed);
		expect(lock.packages.black.version).toBe('26.5.1');
		expect(lock.packages.seaborn.depends).toEqual(['numpy']);
		expect(lock.packages.numpy.file_name).toContain('numpy-2.4.3');
	});

	it('rejects a cached wheel whose bytes do not match the declared hash', async () => {
		const root = await tempDir();
		const distDir = join(root, 'dist');
		const destDir = join(root, 'static');
		const cacheDir = join(root, 'cache');
		await mkdir(distDir, { recursive: true });
		await mkdir(cacheDir, { recursive: true });
		await writeFile(join(distDir, 'pyodide-lock.json'), JSON.stringify(distLock));
		for (const name of [
			'pyodide.js',
			'pyodide.mjs',
			'pyodide.asm.mjs',
			'pyodide.asm.wasm',
			'python_stdlib.zip'
		]) {
			await writeFile(join(distDir, name), name);
		}
		await writeFile(
			join(distDir, 'package.json'),
			JSON.stringify({ name: 'pyodide', version: '314.0.3' })
		);
		await writeFile(join(cacheDir, distLock.packages.micropip.file_name), 'corrupt-cache');
		await writeFile(join(cacheDir, distLock.packages.numpy.file_name), 'corrupt-cache');
		const fetches = [];
		await expect(
			preparePyodide({
				root,
				distDir,
				destDir,
				cacheDir,
				roots: ['micropip'],
				supplement: { packages: [] },
				fetch: async (url) => {
					fetches.push(url);
					return { ok: false, status: 404 };
				}
			})
		).rejects.toThrow(/Download failed|Hash mismatch/);
		expect(fetches.length).toBeGreaterThan(0);
	});

	it('keeps prior published bytes when the final publication rename fails', async () => {
		const root = await tempDir();
		const dest = join(root, 'static', 'pyodide');
		const stage = join(root, 'stage');
		await mkdir(dest, { recursive: true });
		await mkdir(stage, { recursive: true });
		const prior = 'prior-valid-bundle';
		await writeFile(join(dest, 'marker.txt'), prior);
		await writeFile(join(stage, 'marker.txt'), 'staged-replacement');
		await expect(
			publishBundle(stage, dest, {
				rename: async (from, to) => {
					if (from.startsWith(`${dest}.next-`) && to === dest) {
						throw new Error('forced final publication rename failure');
					}
					const { rename } = await import('node:fs/promises');
					return rename(from, to);
				}
			})
		).rejects.toThrow(/forced final publication rename failure/);
		expect(await readFile(join(dest, 'marker.txt'), 'utf8')).toBe(prior);
	});

	it('preserves an unrecoverable backup across a later publication attempt', async () => {
		const root = await tempDir();
		const dest = join(root, 'static', 'pyodide');
		const first = join(root, 'stage-one');
		const second = join(root, 'stage-two');
		await mkdir(dest, { recursive: true });
		await mkdir(first, { recursive: true });
		await mkdir(second, { recursive: true });
		const prior = 'prior-valid-bundle';
		await writeFile(join(dest, 'marker.txt'), prior);
		await writeFile(join(first, 'marker.txt'), 'staged-one');
		await writeFile(join(second, 'marker.txt'), 'staged-two');
		const { readdir } = await import('node:fs/promises');
		await expect(
			publishBundle(first, dest, {
				rename: async (from, to) => {
					if (to === dest) throw new Error('forced persistent dest unavailability');
					const { rename } = await import('node:fs/promises');
					return rename(from, to);
				}
			})
		).rejects.toThrow();
		const backups = (await readdir(join(root, 'static'))).filter((name) =>
			name.startsWith('pyodide.prev-')
		);
		expect(backups).toHaveLength(1);
		expect(await readFile(join(root, 'static', backups[0], 'marker.txt'), 'utf8')).toBe(prior);
		await expect(
			publishBundle(second, dest, {
				rename: async (from, to) => {
					if (to === dest) throw new Error('forced persistent dest unavailability');
					const { rename } = await import('node:fs/promises');
					return rename(from, to);
				}
			})
		).rejects.toThrow();
		expect(await readFile(join(root, 'static', backups[0], 'marker.txt'), 'utf8')).toBe(prior);
	});

	it('rejects invalid explicit proxy configuration without exposing secrets', () => {
		const secret = 'super-secret-proxy-credential';
		expect(() => initNetworkProxyFromEnv({ HTTPS_PROXY: 'not a url' })).toThrow();
		expect(() =>
			initNetworkProxyFromEnv({ ALL_PROXY: `socks5://user:${secret}@127.0.0.1:1080` })
		).toThrow();
		const logged = [];
		const original = console.log;
		console.log = (message) => logged.push(String(message));
		try {
			expect(
				initNetworkProxyFromEnv({ HTTPS_PROXY: `http://user:${secret}@127.0.0.1:9` })
			).toBeTruthy();
		} finally {
			console.log = original;
		}
		expect(logged.join('\n')).not.toContain(secret);
		expect(initNetworkProxyFromEnv({})).toBeNull();
	});
});
