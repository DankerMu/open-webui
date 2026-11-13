import { expect, type Page } from '@playwright/test';
import { admin, openAuthenticatedPage, post, test } from './ocu-auth';
import { evidence } from './ocu-fixtures';
import {
	DEEP_LINK,
	INVOICE,
	INVOICE_FIXTURE,
	PERSONAL_DEEP_LINK,
	SKILLS_PATH,
	STUB_MODEL,
	STUB_REPLY,
	byCy,
	collectErrors,
	enableStubProvider,
	openInChinese,
	removeQuietly,
	uploadRaw
} from './ocu-skill-fixtures';

const DISPLAY_NAME_PATH = `${SKILLS_PATH}/${INVOICE}/display-name`;
const DISPLAY_NAME = '发票生成';
// One character over the server's 32-character limit (design.md Decision 3, rule 1).
const TOO_LONG = '发'.repeat(33);
const TOO_LONG_REASON = 'display name must be at most 32 characters';

const displayNameSaved = (page: Page) =>
	page.waitForResponse(
		(response) =>
			new URL(response.url()).pathname === DISPLAY_NAME_PATH &&
			response.request().method() === 'POST'
	);

test('admin tab: a saved display name survives a reload; a rejected one keeps the typed text', async ({
	page
}) => {
	const checkErrors = collectErrors(page, DISPLAY_NAME_PATH);
	await openInChinese(page);
	const api = await admin(page);
	await removeQuietly(api, `${SKILLS_PATH}/${INVOICE}`);
	try {
		await uploadRaw(api, INVOICE_FIXTURE);

		await page.goto(DEEP_LINK);
		const field = byCy(page, `ocu-skills-display-name-input-${INVOICE}`);
		const save = byCy(page, `ocu-skills-display-name-save-${INVOICE}`);
		await expect(field).toHaveValue('');
		await field.fill(DISPLAY_NAME);
		const saved = displayNameSaved(page);
		await save.click();
		expect((await saved).status()).toBe(200);

		await page.reload();
		await expect(page.locator('#chat-input')).toBeVisible();
		await page.goto(DEEP_LINK);
		await expect(field).toHaveValue(DISPLAY_NAME);
		await page.screenshot({
			path: `${evidence}/ocu-skill-display-name-admin.png`,
			fullPage: true
		});

		await field.fill(TOO_LONG);
		const rejected = displayNameSaved(page);
		await save.click();
		expect((await rejected).status()).toBe(400);
		await expect(
			page.locator('[data-sonner-toast]').filter({ hasText: TOO_LONG_REASON })
		).toBeVisible();
		await expect(field).toHaveValue(TOO_LONG);
		const listed = await api.request.get(`${SKILLS_PATH}/admin`, { headers: api.headers });
		expect(listed.status()).toBe(200);
		expect((await listed.json()).find((skill: { name: string }) => skill.name === INVOICE)).toEqual(
			expect.objectContaining({ name: INVOICE, display_name: DISPLAY_NAME })
		);
	} finally {
		await removeQuietly(api, `${SKILLS_PATH}/${INVOICE}`);
	}
	checkErrors(1);
});

test('personal tab: a display name set through the API shows first, the English name second', async ({
	page
}) => {
	const checkErrors = collectErrors(page, DISPLAY_NAME_PATH);
	await openInChinese(page);
	const api = await admin(page);
	await removeQuietly(api, `${SKILLS_PATH}/${INVOICE}`);
	try {
		// The first upload grants every user read, so the admin's personal tab lists the skill.
		await uploadRaw(api, INVOICE_FIXTURE);
		await post(api, DISPLAY_NAME_PATH, { display_name: DISPLAY_NAME });

		await page.goto(PERSONAL_DEEP_LINK);
		await expect(byCy(page, `ocu-skills-pref-name-${INVOICE}`)).toHaveText(DISPLAY_NAME);
		await expect(byCy(page, `ocu-skills-pref-slug-${INVOICE}`)).toHaveText(INVOICE);
		await page.screenshot({
			path: `${evidence}/ocu-skill-display-name-personal.png`,
			fullPage: true,
			animations: 'disabled'
		});
	} finally {
		await removeQuietly(api, `${SKILLS_PATH}/${INVOICE}`);
	}
	checkErrors(0);
});

test('slash menu: the display name is offered, inserted, sent in the marker and shown in the bubble', async ({
	page
}) => {
	// Admin set-up, the stub completion and the restore outlast 60 s on slow runners.
	test.setTimeout(120_000);
	const checkErrors = collectErrors(page, DISPLAY_NAME_PATH);
	await openInChinese(page);
	const api = await admin(page);
	const openai = await enableStubProvider(api);
	let chatId: string | null = null;
	let restore: PromiseSettledResult<unknown>[] = [];
	try {
		await removeQuietly(api, `${SKILLS_PATH}/${INVOICE}`);
		await uploadRaw(api, INVOICE_FIXTURE);
		await post(api, DISPLAY_NAME_PATH, { display_name: DISPLAY_NAME });
		// A fresh load picks up the provider; the locale stays Chinese from openInChinese.
		await openAuthenticatedPage(page, `/?models=${STUB_MODEL}`);
		const input = page.locator('#chat-input');
		await expect(input).toBeVisible();

		await input.click();
		await page.keyboard.type('/发票');
		const row = byCy(page, `ocu-skills-slash-${INVOICE}`);
		await expect(row).toBeVisible();
		await expect(row).toHaveAttribute('data-selected', 'true');
		await expect(row).toContainText(DISPLAY_NAME);
		await expect(row).toContainText(INVOICE);
		await page.keyboard.press('Enter');
		await expect(input.locator('[data-type="mention"]')).toHaveText(`$${DISPLAY_NAME}`);
		await page.keyboard.type(' 做发票');

		const completion = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === '/api/chat/completions' &&
				response.request().method() === 'POST'
		);
		await page.locator('#send-message-button').click();
		const answer = await completion;
		chatId = (await answer.json()).chat_id;
		expect(typeof chatId).toBe('string');
		const body = answer.request().postDataJSON();
		expect(body.user_message.content).toContain(`<$ocu--${INVOICE}|${DISPLAY_NAME}>`);
		const messages = page.locator('#messages-container');
		await expect(messages.getByText(STUB_REPLY)).toBeVisible();

		await expect(messages.locator('.mention', { hasText: `$${DISPLAY_NAME}` })).toBeVisible();
		await expect(messages.getByText(`$ocu--${INVOICE}`)).toHaveCount(0);
		await page.screenshot({
			path: `${evidence}/ocu-skill-display-name-slash.png`,
			fullPage: true,
			animations: 'disabled'
		});
	} finally {
		// Restore everything even when one step fails; a failure of the case itself still wins.
		restore = await Promise.allSettled([
			...(chatId ? [removeQuietly(api, `/api/v1/chats/${chatId}`)] : []),
			removeQuietly(api, `${SKILLS_PATH}/${INVOICE}`),
			post(api, '/openai/config/update', openai)
		]);
	}
	const failed = restore.find((result) => result.status === 'rejected');
	if (failed) throw failed.reason;
	checkErrors(0);
});
