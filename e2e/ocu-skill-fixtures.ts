import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { openAuthenticatedPage, post, type Admin } from './ocu-auth';
import { context } from './ocu-fixtures';

// smoke/fixtures/ocu-invoice-builder.zip (sha256 d421e2f8c090b3cf6b43784077603066e39462964a6ef193b92fec7a2333080c)
// holds one SKILL.md named invoice-builder; it was built from the repo root with:
//   python3 -c "import zipfile; i = zipfile.ZipInfo('SKILL.md', date_time=(1980, 1, 1, 0, 0, 0)); i.compress_type = zipfile.ZIP_DEFLATED; i.external_attr = 0o100644 << 16; z = zipfile.ZipFile('smoke/fixtures/ocu-invoice-builder.zip', 'w'); z.writestr(i, '---\nname: invoice-builder\ndescription: Invoice builder, uploaded and deleted by the slash menu e2e case.\n---\nNo instructions.\n'); z.close()"
export const INVOICE_FIXTURE = path.resolve('smoke/fixtures/ocu-invoice-builder.zip');
export const INVOICE = 'invoice-builder';
export const DEEP_LINK = '/?settings=admin%3Aocu-skills';
export const PERSONAL_DEEP_LINK = '/?settings=ocu_skills';
export const SKILLS_PATH = '/api/v1/ocu/skills';
export const UPLOAD_PATH = `${SKILLS_PATH}/upload`;
// The OCU stub provider answers every completion with this reply (scripts/ocu_stub_model.py).
export const STUB_MODEL = 'ocu-stub-model';
export const STUB_REPLY = 'Stub reply. Saw: no OCU system prompt.';

export const byCy = (page: Page, cy: string) => page.locator(`[data-cy="${cy}"]`);

/**
 * Page errors and console errors. A 400 resource line from `rejectedPath` is the expected trace of
 * a rejection the case provokes; the returned check takes how many of them must have appeared.
 */
export function collectErrors(page: Page, rejectedPath: string) {
	const errors: { text: string; url: string }[] = [];
	page.on('pageerror', (error) => errors.push({ text: String(error), url: '' }));
	page.on('console', (message) => {
		if (message.type() === 'error')
			errors.push({ text: message.text(), url: message.location().url });
	});
	return (expectedRejections: number) => {
		const rejected = (error: { text: string; url: string }) =>
			new URL(error.url || 'about:blank').pathname === rejectedPath &&
			/^Failed to load resource: the server responded with a status of 400(?:\b|\s|\()/.test(
				error.text
			);
		expect(errors.filter(rejected)).toHaveLength(expectedRejections);
		expect(errors.filter((error) => !rejected(error))).toEqual([]);
	};
}

/** Sign in, switch to Chinese on `/` and reload; a deep link must come after the reload. */
export async function openInChinese(page: Page) {
	await openAuthenticatedPage(page);
	await page.evaluate(() => localStorage.setItem('locale', 'zh-CN'));
	await page.reload();
	await expect(page.locator('#chat-input')).toBeVisible();
}

export async function removeQuietly(api: Admin, url: string) {
	const response = await api.request.delete(url, { headers: api.headers });
	expect([200, 404], url).toContain(response.status());
}

export async function uploadRaw(api: Admin, fixture: string) {
	// Raw ZIP bytes: the `post` helper sends JSON.
	const uploaded = await api.request.post(UPLOAD_PATH, {
		data: readFileSync(fixture),
		headers: { ...api.headers, 'Content-Type': 'application/zip' }
	});
	expect(uploaded.status()).toBe(200);
}

/** Point the OpenAI connection at the OCU stub provider; returns the previous config to restore. */
export async function enableStubProvider(api: Admin): Promise<unknown> {
	const response = await api.request.get('/openai/config', { headers: api.headers });
	expect(response.status()).toBe(200);
	const previous = await response.json();
	await post(api, '/openai/config/update', {
		ENABLE_OPENAI_API: true,
		OPENAI_API_BASE_URLS: [`${context.stub}/v1`],
		OPENAI_API_KEYS: ['ocu-stub'],
		OPENAI_API_CONFIGS: {}
	});
	return previous;
}
