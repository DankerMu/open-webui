import { expect, type Page } from '@playwright/test';
import { openAuthenticatedPage, test } from './ocu-auth';
import {
	FIXTURE_COLLECTOR_SOURCE,
	context,
	evidence,
	observeNativeOcuPopup,
	records,
	type GrantedDocument
} from './ocu-fixtures';
import {
	ResourceObserver,
	expectResources,
	shortOwnerSession,
	expireDocument,
	assertCanonicalState,
	type EvaluateDocument,
	type ShortOwnerSession
} from './ocu-resource-fixtures';

async function openFiles(page: Page, scenario: string) {
	await openAuthenticatedPage(page, `/c/${context.chats[scenario]}`);
	const panel = page.getByRole('region', { name: 'Workspace Files' });
	if (!(await panel.isVisible())) {
		if (!(await page.locator('#controls-container').isVisible()))
			await page.locator('button[aria-label="Controls"]').click();
		await page.getByRole('button', { name: 'Workspace Files', exact: true }).click();
	}
	await expect(panel).toBeVisible();
	return panel;
}

test.beforeEach(async ({ context: browser }) => {
	await browser.addInitScript(FIXTURE_COLLECTOR_SOURCE);
});

for (const mode of ['sidebar', 'direct'] as const) {
	test(`A-T01 ${mode} resources lose expired authority and recover through canonical navigation`, async ({
		page,
		context: browser
	}) => {
		test.setTimeout(120_000);
		const observer = new ResourceObserver(browser);
		let direct: Page | undefined;
		let session: ShortOwnerSession | undefined;
		try {
			const chat = context.chats.normal;
			const panel = await openFiles(page, 'normal');
			// Warm imports and assets before starting the signed lifetime, without preminting.
			await panel.getByRole('button', { name: 'page.html' }).click();
			await expectResources((expression) =>
				page
					.frameLocator('iframe[title="page.html"]')
					.locator('body')
					.evaluate((_body, code) => eval(code), expression)
			);
			await panel.getByRole('button', { name: 'diagram.svg' }).click();
			direct = mode === 'direct' ? await browser.newPage() : undefined;
			const canonical = `/ocu/files/${chat}/page.html${mode === 'sidebar' ? '?revision=1' : ''}`;
			const evaluate: EvaluateDocument = direct
				? (expression) => direct!.evaluate((code) => eval(code), expression)
				: (expression) =>
						page
							.frameLocator('iframe[title="page.html"]')
							.locator('body')
							.evaluate((_body, code) => eval(code), expression);
			session = await shortOwnerSession(browser);
			let document: GrantedDocument;
			try {
				const offset = records().length,
					responseOffset = observer.responses.length;
				if (direct) await direct.goto(canonical);
				else await panel.getByRole('button', { name: 'page.html' }).click();
				await expectResources(evaluate);
				document = await observer.document(canonical, responseOffset);
				await observer.resources(document, offset);
			} finally {
				await session.restore();
			}
			const target =
				direct ??
				(await (await page.locator('iframe[title="page.html"]').elementHandle())!.contentFrame());
			expect(target !== null, 'fresh document remains attached').toBe(true);
			await observer.attach(target!);
			await observer.denials(evaluate);
			await expireDocument(observer, evaluate, document, session.expiry);
			await (direct ?? page).screenshot({
				path: `${evidence}/workspace-${mode}-expired.png`,
				fullPage: true
			});
			await assertCanonicalState(page, chat);
			const responseOffset = observer.responses.length,
				offset = records().length;
			if (direct) await direct.goto(canonical);
			else {
				await expect(page.locator('iframe[title="page.html"]')).toHaveAttribute('src', canonical);
				await panel.getByRole('button', { name: 'diagram.svg' }).click();
				await panel.getByRole('button', { name: 'page.html' }).click();
			}
			await expectResources(evaluate);
			const reopened = await observer.document(canonical, responseOffset);
			expect(reopened.url !== document.url, 'canonical reopen issues distinct authorization').toBe(
				true
			);
			await observer.resources(reopened, offset);
			await assertCanonicalState(page, chat);
			await (direct ?? page).screenshot({
				path: `${evidence}/workspace-${mode}-reopened.png`,
				fullPage: true
			});
			observer.assertErrors();
		} finally {
			const retired = await Promise.allSettled([session?.restore(), observer.close()]);
			const pages = await Promise.allSettled([direct?.close()]);
			expect(
				[...retired, ...pages].every((result) => result.status === 'fulfilled'),
				'resource session and pages retired'
			).toBe(true);
		}
	});
}

test('A-T01 native message popup keeps its document through expiry and reopens the canonical link', async ({
	page,
	context: browser
}) => {
	test.setTimeout(120_000);
	const observer = new ResourceObserver(browser);
	let session: ShortOwnerSession | undefined;
	try {
		const panel = await openFiles(page, 'link');
		const chat = context.chats.link,
			canonical = `/ocu/files/${chat}/page.html`;
		const link = page.getByRole('link', { name: 'Open generated workspace file' });
		await expect(link).toHaveAttribute('href', canonical);
		await expect(link).toHaveAttribute('target', '_blank');
		await link.click();
		await expectResources((expression) =>
			page
				.frameLocator('iframe[title="page.html"]')
				.locator('body')
				.evaluate((_body, code) => eval(code), expression)
		);
		await panel.getByRole('button', { name: 'diagram.svg' }).click();
		session = await shortOwnerSession(browser);
		let previousUrl = '';
		const offset = records().length;
		const popup = await observeNativeOcuPopup(
			browser,
			page,
			canonical,
			'html',
			() => link.click({ modifiers: ['ControlOrMeta'] }),
			`${evidence}/workspace-popup-fresh.png`,
			async (owned) => {
				try {
					await expectResources(owned.evaluate);
					await observer.resources(owned.grant, offset);
					previousUrl = owned.grant.url;
				} finally {
					await session!.restore();
				}
				await owned.screenshot(`${evidence}/workspace-popup-fresh.png`);
				await observer.denials(owned.evaluate);
				await expireDocument(observer, owned.evaluate, owned.grant, session!.expiry);
				await owned.screenshot(`${evidence}/workspace-popup-expired.png`);
				await assertCanonicalState(page, chat);
				observer.assertErrors(owned.errors);
			},
			observer.onNetwork
		);
		await expect(link).toHaveAttribute('href', canonical);
		const reopenOffset = records().length;
		const reopened = await observeNativeOcuPopup(
			browser,
			page,
			canonical,
			'html',
			() => link.click({ modifiers: ['ControlOrMeta'] }),
			`${evidence}/workspace-popup-reopened.png`,
			async (owned) => {
				await expectResources(owned.evaluate);
				expect(
					owned.grant.url !== previousUrl,
					'canonical message reopen issues distinct authorization'
				).toBe(true);
				await observer.resources(owned.grant, reopenOffset);
				await owned.screenshot(`${evidence}/workspace-popup-reopened.png`);
			},
			observer.onNetwork
		);
		expect(reopened.targetId !== popup.targetId, 'old native target retired before reopening').toBe(
			true
		);
		observer.assertErrors(reopened.errors);
		await assertCanonicalState(page, chat);
	} finally {
		const retired = await Promise.allSettled([session?.restore(), observer.close()]);
		expect(
			retired.every((result) => result.status === 'fulfilled'),
			'native resource session and observers retired'
		).toBe(true);
	}
});
