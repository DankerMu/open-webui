import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

export const SUPPORTED_ROOTS = [
	'micropip',
	'packaging',
	'requests',
	'beautifulsoup4',
	'numpy',
	'pandas',
	'matplotlib',
	'scikit-learn',
	'scipy',
	'regex',
	'sympy',
	'tiktoken',
	'seaborn',
	'pytz',
	'black',
	'openai',
	'openpyxl'
];

const RUNTIME_FILES = [
	'pyodide.js',
	'pyodide.mjs',
	'pyodide.asm.js',
	'pyodide.asm.mjs',
	'pyodide.asm.wasm',
	'python_stdlib.zip',
	'package.json'
];

const DISTRIBUTION_CDN = 'https://cdn.jsdelivr.net/pyodide';
const SAFE_FILE = /^[A-Za-z0-9._+-]+$/;
const HEX_SHA256 = /^[0-9a-f]{64}$/;

export function lockKey(name) {
	return String(name)
		.toLowerCase()
		.replace(/[-_.]+/g, '-');
}

export function packageName(name) {
	return String(name)
		.toLowerCase()
		.replace(/[-_.]+/g, '_');
}

function isSafeFileName(name) {
	return typeof name === 'string' && SAFE_FILE.test(name) && !name.includes('..');
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

export function redactProxyUrl(value) {
	try {
		const url = new URL(value);
		if (url.password || url.username) url.password = url.username = 'redacted';
		return url.toString();
	} catch {
		return '[invalid-proxy]';
	}
}

export function initNetworkProxyFromEnv(env = process.env) {
	const allProxy = env.all_proxy || env.ALL_PROXY;
	const httpsProxy = env.https_proxy || env.HTTPS_PROXY;
	const httpProxy = env.http_proxy || env.HTTP_PROXY;
	const preferred = httpsProxy || allProxy || httpProxy;
	if (!preferred) return null;
	if (!preferred.startsWith('http')) {
		throw new Error('Unsupported proxy scheme; only http(s) proxies are allowed');
	}
	let uri;
	try {
		uri = new URL(preferred).toString();
	} catch {
		throw new Error('Invalid explicit proxy URL');
	}
	setGlobalDispatcher(new ProxyAgent({ uri }));
	console.log(`Initialized network proxy ${redactProxyUrl(uri)} from env`);
	return uri;
}

export function loadSupplementManifest(raw) {
	const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
	if (!data || !Array.isArray(data.packages)) {
		throw new Error('Supplementary manifest must list packages');
	}
	const packages = new Map();
	for (const entry of data.packages) {
		if (!entry?.name || !entry.version || !entry.file_name || !entry.url || !entry.sha256) {
			throw new Error('Supplementary package is missing required fields');
		}
		if (!isSafeFileName(entry.file_name)) {
			throw new Error(`Unsafe supplementary filename: ${entry.file_name}`);
		}
		if (!HEX_SHA256.test(entry.sha256)) {
			throw new Error(`Invalid SHA256 for ${entry.name}`);
		}
		if (!Array.isArray(entry.depends) || !Array.isArray(entry.imports)) {
			throw new Error(`Supplementary package ${entry.name} must declare depends and imports`);
		}
		const key = lockKey(entry.name);
		if (packages.has(key)) throw new Error(`Duplicate supplementary package ${entry.name}`);
		packages.set(key, {
			lock_key: key,
			name: packageName(entry.name),
			version: entry.version,
			file_name: entry.file_name,
			url: entry.url,
			sha256: entry.sha256,
			imports: [...entry.imports],
			depends: [...entry.depends]
		});
	}
	return packages;
}

function catalogEntry(source, entry, lock_key) {
	return {
		source,
		lock_key,
		name: entry.name,
		version: entry.version,
		file_name: entry.file_name,
		sha256: entry.sha256,
		imports: [...(entry.imports ?? [])],
		depends: [...(entry.depends ?? [])],
		install_dir: entry.install_dir ?? 'site',
		package_type: entry.package_type ?? 'package',
		unvendored_tests: Boolean(entry.unvendored_tests),
		url: entry.url ?? null
	};
}

export function loadDistributionCatalog(lock, version) {
	if (!lock?.info || !lock.packages) throw new Error('Distribution lock is missing packages');
	if (lock.info.python?.split('.').slice(0, 2).join('.') !== '3.14') {
		throw new Error(`Unexpected distribution Python ${lock.info.python}`);
	}
	const catalog = new Map();
	for (const [key, entry] of Object.entries(lock.packages)) {
		if (!entry?.file_name || !HEX_SHA256.test(entry.sha256 ?? '')) {
			throw new Error(`Distribution package ${key} is missing integrity metadata`);
		}
		if (!isSafeFileName(entry.file_name)) {
			throw new Error(`Unsafe distribution filename: ${entry.file_name}`);
		}
		const record = {
			...catalogEntry('distribution', { ...entry, name: entry.name ?? key }, key),
			url: `${DISTRIBUTION_CDN}/v${version}/full/${entry.file_name}`
		};
		catalog.set(key, record);
		catalog.set(lockKey(key), record);
		catalog.set(lockKey(entry.name ?? key), record);
	}
	return { info: lock.info, catalog };
}

export function mergeCatalog(distribution, supplements) {
	const catalog = new Map(distribution.catalog);
	for (const [key, entry] of supplements) {
		if (catalog.has(key)) {
			throw new Error(`Supplementary package ${entry.name} collides with the distribution`);
		}
		catalog.set(key, catalogEntry('supplement', entry, key));
	}
	return catalog;
}

function resolveKey(catalog, name) {
	return catalog.get(name) || catalog.get(lockKey(name));
}

export function resolveSupportedClosure(catalog, roots = SUPPORTED_ROOTS) {
	const needed = new Map();
	const queue = [...roots];
	while (queue.length) {
		const requested = queue.shift();
		const entry = resolveKey(catalog, requested);
		if (!entry) throw new Error(`Missing dependency ${requested}`);
		const key = entry.lock_key;
		if (needed.has(key)) continue;
		needed.set(key, entry);
		queue.push(...entry.depends);
	}
	return needed;
}

export function buildLocalLock(info, needed) {
	const packages = {};
	for (const entry of [...needed.values()].sort((a, b) => a.lock_key.localeCompare(b.lock_key))) {
		packages[entry.lock_key] = {
			name: entry.name,
			version: entry.version,
			file_name: entry.file_name,
			install_dir: entry.install_dir,
			sha256: entry.sha256,
			package_type: entry.package_type,
			imports: entry.imports,
			depends: entry.depends,
			unvendored_tests: entry.unvendored_tests
		};
	}
	return { info, packages };
}

export async function verifyBytes(path, expected) {
	const bytes = await readFile(path);
	const actual = sha256(bytes);
	if (actual !== expected) {
		throw new Error(`Hash mismatch for ${path}: expected ${expected}, got ${actual}`);
	}
	return bytes;
}

async function materializeFile(url, dest, expected, cacheDir, fetchImpl) {
	const cached = join(cacheDir, dest.split('/').pop());
	try {
		await verifyBytes(cached, expected);
		await copyFile(cached, dest);
		return;
	} catch {
		await rm(cached, { force: true });
	}
	const response = await fetchImpl(url);
	if (!response.ok) {
		throw new Error(`Download failed for ${url}: ${response.status}`);
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	if (sha256(bytes) !== expected) {
		throw new Error(`Downloaded hash mismatch for ${url}`);
	}
	await mkdir(dirname(cached), { recursive: true });
	await writeAtomic(cached, bytes);
	await copyFile(cached, dest);
}

async function writeAtomic(path, bytes) {
	const tmp = `${path}.partial`;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(tmp, bytes);
	await rename(tmp, path);
}

async function copyRuntime(distDir, dest) {
	for (const name of RUNTIME_FILES) {
		const source = join(distDir, name);
		try {
			await stat(source);
		} catch {
			if (name === 'pyodide.asm.js' || name === 'package.json') continue;
			throw new Error(`Distribution is missing ${name}`);
		}
		await copyFile(source, join(dest, name));
	}
}

export async function publishBundle(stageDir, destDir, options = {}) {
	await stat(stageDir);
	const move = options.rename ?? rename;
	const stamp = `${process.pid}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
	const staged = `${destDir}.next-${stamp}`;
	const backup = `${destDir}.prev-${stamp}`;
	await move(stageDir, staged);
	let replaced = false;
	try {
		try {
			await stat(destDir);
			await move(destDir, backup);
			replaced = true;
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error;
		}
		await move(staged, destDir);
		if (replaced) await rm(backup, { recursive: true, force: true });
	} catch (error) {
		const failures = [error];
		if (replaced) {
			try {
				await rm(destDir, { recursive: true, force: true });
				await move(backup, destDir);
			} catch (restoreError) {
				failures.push(
					new Error(`publication rollback failed; prior bundle remains at ${backup}`, {
						cause: restoreError
					})
				);
			}
		}
		await rm(staged, { recursive: true, force: true }).catch(() => undefined);
		if (failures.length > 1) throw new AggregateError(failures, 'publication failed');
		throw error;
	}
}

export async function preparePyodide(options) {
	const root = options.root ?? process.cwd();
	const distDir = resolve(root, options.distDir ?? 'node_modules/pyodide');
	const destDir = resolve(root, options.destDir ?? 'static/pyodide');
	const cacheDir = resolve(root, options.cacheDir ?? '.run/pyodide-cache');
	const fetchImpl = options.fetch ?? fetch;
	const distPackage = JSON.parse(await readFile(join(distDir, 'package.json'), 'utf8'));
	if (distPackage.version !== '314.0.3') {
		throw new Error(`Expected installed pyodide 314.0.3, found ${distPackage.version}`);
	}
	const distLock = JSON.parse(await readFile(join(distDir, 'pyodide-lock.json'), 'utf8'));
	const supplements = loadSupplementManifest(
		options.supplement ?? (await readFile(join(root, 'scripts/pyodide-supplement.json'), 'utf8'))
	);
	const distribution = loadDistributionCatalog(distLock, distPackage.version);
	const catalog = mergeCatalog(distribution, supplements);
	const needed = resolveSupportedClosure(catalog, options.roots ?? SUPPORTED_ROOTS);
	const lock = buildLocalLock(distribution.info, needed);
	await mkdir(join(root, '.run'), { recursive: true });
	const stageDir = await mkdtemp(join(root, '.run', 'pyodide-stage-'));
	try {
		await mkdir(cacheDir, { recursive: true });
		await copyRuntime(distDir, stageDir);
		for (const entry of needed.values()) {
			await materializeFile(
				entry.url,
				join(stageDir, entry.file_name),
				entry.sha256,
				cacheDir,
				fetchImpl
			);
		}
		await writeAtomic(join(stageDir, 'pyodide-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
		for (const entry of needed.values()) {
			await verifyBytes(join(stageDir, entry.file_name), entry.sha256);
		}
		await publishBundle(stageDir, destDir);
	} catch (error) {
		await rm(stageDir, { recursive: true, force: true });
		throw error;
	}
	return {
		destDir,
		lock,
		packages: [...needed.values()].map(({ name, version, file_name }) => ({
			name,
			version,
			file_name
		}))
	};
}

const launchedDirectly =
	process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (launchedDirectly) {
	try {
		initNetworkProxyFromEnv();
		const result = await preparePyodide({});
		console.log(
			JSON.stringify({
				destination: result.destDir,
				packages: result.packages.length,
				python: result.lock.info.python
			})
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
