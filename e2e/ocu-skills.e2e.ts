import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { admin, openAuthenticatedPage, post, test, type Admin } from './ocu-auth';
import { evidence } from './ocu-fixtures';

// smoke/fixtures/ocu-smoke-skill.zip holds one SKILL.md named harness-smoke-skill (smoke/ocu-skills.hurl).
const FIXTURE = path.resolve('smoke/fixtures/ocu-smoke-skill.zip');
const SKILL = 'harness-smoke-skill';
const DEEP_LINK = '/?settings=admin%3Aocu-skills';
const PERSONAL_DEEP_LINK = '/?settings=ocu_skills';
const TAB = '工作区 Skills';
const SKILLS_PATH = '/api/v1/ocu/skills';
const UPLOAD_PATH = `${SKILLS_PATH}/upload`;
// The first upload's grant (design Decision 4): every user may read the skill.
const PUBLIC_GRANTS = [{ principal_type: 'user', principal_id: '*', permission: 'read' }];

const byCy = (page: Page, cy: string) => page.locator(`[data-cy="${cy}"]`);
const settingsTabs = (page: Page) => page.locator('#settings-tabs-container').getByRole('tab');
const tabNamed = (page: Page, name: string) =>
	page.locator('#settings-tabs-container').getByRole('tab', { name, exact: true });
const settingsSearch = (page: Page) => page.locator('#search-input-settings-modal');
// Both tabs carry the title TAB; their panel ids tell them apart.
const adminTab = (page: Page) => page.locator('[aria-controls="tab-admin-ocu-skills"]');
const personalTab = (page: Page) => page.locator('[aria-controls="tab-ocu_skills"]');

/** Browser requests to the skill routes; page.request API calls never pass through the page. */
function skillRequests(page: Page) {
	const seen: string[] = [];
	page.on('request', (request) => {
		const { pathname } = new URL(request.url());
		if (pathname.startsWith(SKILLS_PATH)) seen.push(`${request.method()} ${pathname}`);
	});
	return seen;
}

/** Page errors and console errors; the one rejected upload's own 400 resource line is expected. */
function collectErrors(page: Page) {
	const errors: { text: string; url: string }[] = [];
	page.on('pageerror', (error) => errors.push({ text: String(error), url: '' }));
	page.on('console', (message) => {
		if (message.type() === 'error')
			errors.push({ text: message.text(), url: message.location().url });
	});
	return (expectedRejections: number) => {
		const rejected = (error: { text: string; url: string }) =>
			new URL(error.url || 'about:blank').pathname === UPLOAD_PATH &&
			/^Failed to load resource: the server responded with a status of 400(?:\b|\s|\()/.test(
				error.text
			);
		expect(errors.filter(rejected)).toHaveLength(expectedRejections);
		expect(errors.filter((error) => !rejected(error))).toEqual([]);
	};
}

/** Sign in, switch to Chinese on `/` and reload; a deep link must come after the reload. */
async function openInChinese(page: Page) {
	await openAuthenticatedPage(page);
	await page.evaluate(() => localStorage.setItem('locale', 'zh-CN'));
	await page.reload();
	await expect(page.locator('#chat-input')).toBeVisible();
}

async function removeQuietly(api: Admin, url: string) {
	const response = await api.request.delete(url, { headers: api.headers });
	expect([200, 404], url).toContain(response.status());
}

async function search(page: Page, query: string) {
	await settingsSearch(page).fill(query);
}

test('admin tab: upload, reason, stored access, cancelled and confirmed delete', async ({
	page
}) => {
	const requests = skillRequests(page);
	const checkErrors = collectErrors(page);
	await openInChinese(page);
	const api = await admin(page);
	await removeQuietly(api, `${SKILLS_PATH}/${SKILL}`);
	let groupId: string | null = null;
	try {
		await page.goto(DEEP_LINK);
		await expect(adminTab(page)).toHaveAttribute('aria-selected', 'true');
		await expect(personalTab(page)).toHaveAttribute('aria-selected', 'false');
		await expect(byCy(page, 'ocu-skills-notice-revocation')).toBeVisible();
		await expect(byCy(page, 'ocu-skills-notice-replacement')).toBeVisible();

		// Positive control for the workspace-off search: with the flag on, `skills` finds both tabs.
		await search(page, 'skills');
		await expect(settingsTabs(page)).toHaveCount(2);
		await expect(tabNamed(page, TAB)).toHaveCount(2);
		await expect(personalTab(page)).toHaveCount(1);
		await expect(adminTab(page)).toHaveCount(1);
		await search(page, '');
		await expect(tabNamed(page, '数据库')).toBeVisible();

		// A marker set before the upload survives it: the list refreshed without a reload.
		await page.evaluate(() => Object.assign(window, { ocuSkillsMarker: 'before-upload' }));
		const upload = byCy(page, 'ocu-skills-upload');
		await upload.setInputFiles(FIXTURE);
		await expect(byCy(page, `ocu-skills-row-${SKILL}`)).toBeVisible();
		await expect(byCy(page, `ocu-skills-row-${SKILL}`)).toContainText(
			'Harness smoke skill, uploaded and deleted by make smoke.'
		);
		expect(
			await page.evaluate(() => (window as unknown as { ocuSkillsMarker?: string }).ocuSkillsMarker)
		).toBe('before-upload');
		await page.screenshot({ path: `${evidence}/ocu-skills-admin-tab.png`, fullPage: true });

		// The server's 400 reason is shown verbatim.
		const rejection = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === UPLOAD_PATH && response.request().method() === 'POST'
		);
		await upload.setInputFiles({
			name: 'not-a-zip.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('not a zip')
		});
		const rejected = await rejection;
		expect(rejected.status()).toBe(400);
		const detail = (await rejected.json()).detail;
		expect(typeof detail).toBe('string');
		expect(detail).not.toBe('');
		await expect(byCy(page, 'ocu-skills-upload-error')).toHaveText(detail);
		await expect(byCy(page, `ocu-skills-row-${SKILL}`)).toBeVisible();
		await page.screenshot({ path: `${evidence}/ocu-skills-upload-error.png`, fullPage: true });

		// SA-1: narrowed to a group through the API, the reopened editor starts from that grant.
		const groupName = `ocu-skills-e2e-${Date.now()}`;
		groupId = (await post(api, '/api/v1/groups/create', { name: groupName, description: '' })).id;
		const narrowed = await post(api, `${SKILLS_PATH}/${SKILL}/access`, {
			access_grants: [{ principal_type: 'group', principal_id: groupId, permission: 'read' }]
		});
		expect(narrowed.access_grants).toEqual([
			{ principal_type: 'group', principal_id: groupId, permission: 'read' }
		]);
		await page.goto(DEEP_LINK);
		await expect(adminTab(page)).toHaveAttribute('aria-selected', 'true');
		await expect(personalTab(page)).toHaveAttribute('aria-selected', 'false');
		const before = requests.length;
		await byCy(page, `ocu-skills-access-${SKILL}`).click();
		const editor = page.locator('.modal').filter({ hasText: groupName });
		await expect(editor).toBeVisible();
		await expect(editor.locator('select').first()).toHaveValue('private');
		await page.screenshot({ path: `${evidence}/ocu-skills-access.png`, fullPage: true });
		await editor.locator('button').first().click();
		await expect(editor).toBeHidden();
		// Opening and closing the editor is not a change.
		expect(requests.slice(before).filter((request) => request.startsWith('POST'))).toEqual([]);
		const restored = await post(api, `${SKILLS_PATH}/${SKILL}/access`, {
			access_grants: PUBLIC_GRANTS
		});
		expect(restored.access_grants).toEqual(PUBLIC_GRANTS);

		const deletes = () => requests.filter((request) => request.startsWith('DELETE'));
		const confirm = page.getByRole('dialog', { name: '删除 skill' });
		await byCy(page, `ocu-skills-delete-${SKILL}`).click();
		await expect(confirm).toContainText(SKILL);
		await page.screenshot({ path: `${evidence}/ocu-skills-delete-confirm.png`, fullPage: true });
		await confirm.getByRole('button', { name: '取消', exact: true }).click();
		await expect(confirm).toBeHidden();
		expect(deletes()).toEqual([]);
		await expect(byCy(page, `ocu-skills-row-${SKILL}`)).toBeVisible();

		await byCy(page, `ocu-skills-delete-${SKILL}`).click();
		await confirm.getByRole('button', { name: '删除', exact: true }).click();
		await expect(byCy(page, `ocu-skills-row-${SKILL}`)).toHaveCount(0);
		expect(deletes()).toEqual([`DELETE ${SKILLS_PATH}/${SKILL}`]);
		await page.screenshot({ path: `${evidence}/ocu-skills-deleted.png`, fullPage: true });
	} finally {
		await removeQuietly(api, `${SKILLS_PATH}/${SKILL}`);
		if (groupId) await removeQuietly(api, `/api/v1/groups/id/${groupId}/delete`);
	}
	checkErrors(1);
});

test('personal tab: the switch persists through toggle and reload', async ({ page }) => {
	const requests = skillRequests(page);
	const checkErrors = collectErrors(page);
	await openInChinese(page);
	const api = await admin(page);
	await removeQuietly(api, `${SKILLS_PATH}/${SKILL}`);
	try {
		// Raw ZIP bytes: the `post` helper sends JSON.
		const uploaded = await api.request.post(UPLOAD_PATH, {
			data: readFileSync(FIXTURE),
			headers: { ...api.headers, 'Content-Type': 'application/zip' }
		});
		expect(uploaded.status()).toBe(200);

		await page.goto(PERSONAL_DEEP_LINK);
		await expect(personalTab(page)).toHaveAttribute('aria-selected', 'true');
		await expect(adminTab(page)).toHaveAttribute('aria-selected', 'false');
		await expect(byCy(page, 'ocu-skills-pref')).toBeVisible();
		const toggle = page.getByRole('switch', { name: SKILL, exact: true });
		await expect(byCy(page, `ocu-skills-pref-row-${SKILL}`)).toBeVisible();
		await expect(byCy(page, `ocu-skills-pref-row-${SKILL}`)).toContainText(
			'Harness smoke skill, uploaded and deleted by make smoke.'
		);
		await expect(byCy(page, `ocu-skills-pref-switch-${SKILL}`).getByRole('switch')).toBeVisible();
		await expect(toggle).toBeChecked();

		// Space is pressed while the first toggle is held. Chromium blurs the switch once its fieldset
		// disables it, so no keydown reaches it here; the component test sends one that does.
		const TOGGLE_ROUTE = `**${SKILLS_PATH}/${SKILL}/toggle`;
		let release!: () => void;
		const released = new Promise<void>((done) => (release = done));
		let held!: () => void;
		const holding = new Promise<void>((done) => (held = done));
		await page.route(TOGGLE_ROUTE, async (route) => {
			held();
			await released;
			await route.continue();
		});
		const toggled = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === `${SKILLS_PATH}/${SKILL}/toggle` &&
				response.request().method() === 'POST'
		);
		await toggle.focus();
		await toggle.click();
		await holding;
		await page.keyboard.press('Space');
		release();
		const answer = await toggled;
		await page.unroute(TOGGLE_ROUTE);
		expect(answer.request().postDataJSON()).toEqual({ enabled: false });
		expect(answer.status()).toBe(200);
		expect(requests.filter((request) => request.startsWith('POST'))).toEqual([
			`POST ${SKILLS_PATH}/${SKILL}/toggle`
		]);
		await expect(toggle).not.toBeChecked();

		await page.reload();
		await expect(page.locator('#chat-input')).toBeVisible();
		await page.goto(PERSONAL_DEEP_LINK);
		await expect(personalTab(page)).toHaveAttribute('aria-selected', 'true');
		await expect(byCy(page, `ocu-skills-pref-row-${SKILL}`)).toBeVisible();
		await expect(toggle).not.toBeChecked();
		// After the reload, with the modal fade and switch transition finished: the stored state.
		await page.screenshot({
			path: `${evidence}/ocu-skills-personal.png`,
			fullPage: true,
			animations: 'disabled'
		});

		const listed = await api.request.get(`${SKILLS_PATH}/`, { headers: api.headers });
		expect(listed.status()).toBe(200);
		expect((await listed.json()).find((skill: { name: string }) => skill.name === SKILL)).toEqual(
			expect.objectContaining({ name: SKILL, enabled: false })
		);
	} finally {
		await removeQuietly(api, `${SKILLS_PATH}/${SKILL}`);
	}
	checkErrors(0);
});

test('workspace off: no skills tab and no skill request, even on the deep links', async ({
	page
}) => {
	// Installed before the first navigation, so no page of this case ever sees the flag on.
	await page.route('**/api/config', async (route) => {
		const response = await route.fetch();
		const body = await response.json();
		body.features = { ...body.features, enable_ocu_workspace: false };
		await route.fulfill({ response, json: body });
	});
	const requests = skillRequests(page);
	const checkErrors = collectErrors(page);
	await openInChinese(page);

	await page.goto('/?settings=general');
	await expect(settingsSearch(page)).toBeVisible();
	// Step 1, empty search: the admin section rendered, without the skills tab.
	await expect(tabNamed(page, '数据库')).toBeVisible();
	await expect(tabNamed(page, TAB)).toHaveCount(0);
	// Step 2: `skills` is one of the tab's keywords; nothing matches it while the flag is off.
	await search(page, 'skills');
	await expect(page.getByText('未找到匹配项')).toBeVisible();
	await expect(tabNamed(page, TAB)).toHaveCount(0);
	await page.screenshot({ path: `${evidence}/ocu-skills-workspace-off.png`, fullPage: true });

	await page.goto(DEEP_LINK);
	await expect(settingsSearch(page)).toBeVisible();
	await expect(tabNamed(page, '数据库')).toBeVisible();
	await expect(page.locator('[data-cy^="ocu-skills-"]')).toHaveCount(0);
	await page.screenshot({
		path: `${evidence}/ocu-skills-workspace-off-deep-link.png`,
		fullPage: true
	});

	// The personal deep link: the modal opens (positive control), without the tab or its content.
	await page.goto(PERSONAL_DEEP_LINK);
	await expect(settingsSearch(page)).toBeVisible();
	await expect(tabNamed(page, '数据库')).toBeVisible();
	await expect(page.locator('[data-cy^="ocu-skills-"]')).toHaveCount(0);
	await expect(page.getByRole('tab', { name: TAB })).toHaveCount(0);

	expect(requests).toEqual([]);
	checkErrors(0);
});
