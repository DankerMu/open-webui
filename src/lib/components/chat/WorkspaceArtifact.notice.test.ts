// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { beginGeneration, ocuWorkspaces, setWorkspacePresentation } from '$lib/stores/ocu';
import { chat, describeBody, json } from '../../../../test/ocu-workspace-fixtures';
import {
	OfficeArtifactHarness,
	htmlFile,
	namedButton,
	namedControl,
	officeDocx
} from './workspace-artifact-office-test';

const harness = new OfficeArtifactHarness();
const REMOVED = 'Selected file was removed';
const banner = () => document.querySelector('[role="alert"]');
const bannerText = () => banner()?.textContent?.replace(/\s+/g, ' ').trim();
const storeNotice = (id = chat) => get(ocuWorkspaces)[id]?.notice;
const isDescribe = (input: string, init?: RequestInit) =>
	input.includes('/workspaces/') && !input.endsWith('/prefs') && init?.method === 'GET';

beforeEach(() => harness.install());
afterEach(() => harness.cleanup());

async function removalNotice(describe: typeof describeBody = describeBody) {
	harness.setListing([officeDocx, htmlFile], describe);
	await harness.open();
	await harness.ready('page.html');
	namedButton('page.html').click();
	await tick();
	harness.setListing([officeDocx], describe, 2);
	namedButton('Refresh workspace files').click();
	await harness.ready(REMOVED);
	expect(storeNotice()).toBe(REMOVED);
}

describe('workspace notice banner', () => {
	it('clears the store notice when the user changes the view', async () => {
		await removalNotice({ ...describeBody, views: ['files', 'browser'] });
		namedButton('Browser').click();
		await tick();
		expect(get(ocuWorkspaces)[chat].view).toBe('browser');
		expect(storeNotice()).toBe('');
		expect(banner()).toBeNull();
	});

	it('dismisses the store notice without a request and moves focus to Refresh', async () => {
		await removalNotice();
		expect(bannerText()).toBe(REMOVED);
		const dismiss = namedButton('Dismiss notice');
		expect(banner()!.contains(dismiss)).toBe(true);
		expect(dismiss.textContent?.trim()).toBe('');
		const requests = harness.calls.length;
		dismiss.focus();
		dismiss.click();
		await tick();
		expect(banner()).toBeNull();
		expect(storeNotice()).toBe('');
		expect(harness.calls).toHaveLength(requests);
		expect(document.activeElement).toBe(namedButton('Refresh workspace files'));
	});

	it('dismisses a local notice while busy and moves focus to the Files view', async () => {
		harness.setListing([officeDocx, htmlFile]);
		await harness.open();
		await harness.ready('page.html');
		const listingOk = harness.scenario;
		const held = Promise.withResolvers<Response>();
		harness.scenario = (input, init) =>
			isDescribe(input, init)
				? held.promise
				: input.endsWith('/prefs') && init?.method === 'PUT'
					? json({ reason: 'ocu_upstream_error' }, 502)
					: listingOk(input, init);
		namedButton('Refresh workspace files').click();
		await tick();
		const refresh = namedButton('Refresh workspace files');
		expect(refresh.disabled).toBe(true);
		namedButton('page.html').click();
		await harness.ready('Selection could not be saved');
		expect(storeNotice()).toBe('');
		const requests = harness.calls.length;
		namedButton('Dismiss notice').click();
		await tick();
		expect(banner()).toBeNull();
		expect(harness.calls).toHaveLength(requests);
		expect(document.activeElement).toBe(namedButton('Files'));
		held.resolve(json(describeBody));
	});

	it('dismisses only this chat and shows a notice a later run writes', async () => {
		const generationB = beginGeneration('B');
		setWorkspacePresentation('B', generationB, { notice: 'Workspace view is unavailable' });
		await removalNotice();
		namedButton('Dismiss notice').click();
		await tick();
		expect(storeNotice()).toBe('');
		expect(storeNotice('B')).toBe('Workspace view is unavailable');
		expect(namedControl('Dismiss notice')).toBeUndefined();
		const listingOk = harness.scenario;
		harness.scenario = (input, init) =>
			input.includes('/api/outputs/')
				? json({ reason: 'inaccessible' }, 503)
				: listingOk(input, init);
		namedButton('Refresh workspace files').click();
		await harness.ready('Refresh failed; existing files remain available');
		expect(bannerText()).toBe('Refresh failed; existing files remain available');
		expect(namedControl('Dismiss notice')).toBeDefined();
	});
});
