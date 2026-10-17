import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(
	readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
	{ version: '1.2' }
);
const guardSteps = workflow.jobs['layer6-diff-size-guard'].steps.filter(
	(step) => typeof step.run === 'string'
);
if (guardSteps.length !== 1) {
	throw new Error('Expected one PR diff size guard run block in .github/workflows/ci.yml');
}
const guard = guardSteps[0].run;

const owned = [];
afterEach(async () => {
	await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const lines = (count, prefix = 'included') =>
	Array.from({ length: count }, (_, index) => `${prefix} line ${index + 1}\n`).join('');

async function writeFiles(repo, files) {
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(repo, path)), { recursive: true });
		await writeFile(join(repo, path), content);
	}
}

async function runGuard(before, after) {
	const root = await mkdtemp(join(tmpdir(), 'ci-diff-size-'));
	owned.push(root);
	const repo = join(root, 'repo');
	const home = join(root, 'home');
	await mkdir(repo);
	await mkdir(home);
	const env = {
		PATH: '/usr/bin:/bin',
		HOME: home,
		LC_ALL: 'C',
		GIT_CONFIG_NOSYSTEM: '1',
		GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_TERMINAL_PROMPT: '0',
		GIT_ALLOW_PROTOCOL: '',
		GIT_AUTHOR_NAME: 'Diff size fixture',
		GIT_AUTHOR_EMAIL: 'diff-size@example.invalid',
		GIT_COMMITTER_NAME: 'Diff size fixture',
		GIT_COMMITTER_EMAIL: 'diff-size@example.invalid'
	};
	const git = (...args) =>
		execFileSync('git', args, { cwd: repo, env, encoding: 'utf8', timeout: 10_000 });
	git('init', '--quiet', '--template=', '--initial-branch=main');
	git('config', 'core.hooksPath', '/dev/null');
	await copyFile(new URL('../constraints.yaml', import.meta.url), join(repo, 'constraints.yaml'));
	await writeFiles(repo, before);
	git('add', '.');
	git('commit', '--quiet', '-m', 'Create diff fixture');
	const baseSha = git('rev-parse', 'HEAD').trim();
	for (const path of Object.keys(before)) {
		await rm(join(repo, path));
	}
	await writeFiles(repo, after);
	git('add', '-A');
	git('commit', '--quiet', '-m', 'Apply fixture changes');

	return spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', guard], {
		cwd: repo,
		env: { ...env, BASE_SHA: baseSha },
		encoding: 'utf8',
		timeout: 10_000
	});
}

describe('PR diff size guard', () => {
	it.each([
		{
			name: 'rejects a whole-file deletion of 401 included lines',
			before: { 'src/lib/diff-size-fixture.txt': lines(401) },
			after: {},
			count: 401,
			status: 1
		},
		{
			name: 'accepts a whole-file deletion at the 400-line boundary',
			before: { 'src/lib/diff-size-fixture.txt': lines(400) },
			after: {},
			count: 400,
			status: 0
		},
		{
			name: 'combines whole-file deletions and additions in the same limit',
			before: { 'deleted.txt': lines(200, 'deleted') },
			after: { 'added.txt': lines(201, 'fresh content with distinct longer text') },
			count: 401,
			status: 1
		},
		{
			name: 'counts deletions within a file that remains present',
			before: { 'modified.txt': lines(402) },
			after: { 'modified.txt': lines(1) },
			count: 401,
			status: 1
		},
		{
			name: 'excludes lockfile, snapshot and i18n deletions at the included boundary',
			before: {
				'included.txt': lines(400),
				'nested/dependency.lock': lines(401),
				'nested/package-lock.json': lines(401),
				'src/widget/__snapshots__/fixture.snap': lines(401),
				'src/lib/i18n/fixture.json': lines(401)
			},
			after: {},
			count: 400,
			status: 0
		},
		{
			name: 'ignores whitespace-only edits alongside a boundary deletion',
			before: { 'deleted.txt': lines(400), 'kept.txt': 'kept line\n' },
			after: { 'kept.txt': '  kept   line  \n' },
			count: 400,
			status: 0
		}
	])(
		'$name',
		async ({ before, after, count, status }) => {
			const result = await runGuard(before, after);
			expect(result.error).toBeUndefined();
			expect(result.signal).toBeNull();
			const observed = result.stdout.match(/:\s*(\d+)\s+\([^:\n]*:\s*(\d+)\)/);
			expect(observed).not.toBeNull();
			expect(observed.slice(1).map(Number)).toEqual([count, 400]);
			expect(result.status).toBe(status);
		},
		30_000
	);
});
