import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { collectOfficeDiagnostics } from './verify-office-diagnostics.mjs';

const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let browser;
let currentFormat = 'browser';
let currentCheck = 'startup';
let activePage;
const artifactRoot = path.dirname(config.result);
const diagnosticPages = [];
const results = [];

function diagnosticCounts(rows) {
	return {
		expected_policy_denials: rows.reduce(
			(count, row) => count + (row.latest?.expectedPolicyDenials.length ?? 0),
			0
		),
		unexpected_console_errors: rows.reduce(
			(count, row) => count + (row.latest?.unexpectedConsoleErrors.length ?? 0),
			0
		),
		page_errors: rows.reduce((count, row) => count + (row.latest?.pageErrors.length ?? 0), 0)
	};
}

function persistDiagnostics() {
	fs.writeFileSync(
		path.join(artifactRoot, 'browser-diagnostics.log'),
		JSON.stringify(
			diagnosticPages.map(({ format, generation, latest }) => ({ format, generation, ...latest })),
			null,
			2
		) + '\n',
		{ mode: 0o600 }
	);
	fs.writeFileSync(
		path.join(artifactRoot, 'browser-diagnostics.json'),
		JSON.stringify(
			{
				document_server_origin: config.document_server_origin,
				formats: ['DOCX', 'XLSX', 'PPTX'].map((format) => {
					const rows = diagnosticPages.filter((row) => row.format === format);
					return {
						format,
						...diagnosticCounts(rows),
						opens: rows.map((row) => ({
							generation: row.generation,
							collection_started: Boolean(row.latest),
							...diagnosticCounts([row])
						}))
					};
				})
			},
			null,
			2
		) + '\n',
		{ mode: 0o600 }
	);
}

async function requireCleanDiagnostics(opened) {
	const diagnostic = await opened.diagnostics.drain();
	if (diagnostic.unexpectedConsoleErrors.length || diagnostic.pageErrors.length)
		throw new Error(
			'browser reported unexpected console or page errors; see private diagnostic log'
		);
}

function recordPrivateFailure(error, label) {
	try {
		fs.appendFileSync(
			path.join(artifactRoot, 'browser-failure.log'),
			`[${currentFormat} ${currentCheck}] ${label}\n${error?.stack ?? String(error)}\n`,
			{ mode: 0o600 }
		);
	} catch {
		console.error(`${currentFormat} ${currentCheck}: private diagnostic recording failed`);
	}
}

async function captureFailure() {
	if (!activePage || activePage.isClosed()) return;
	try {
		await activePage.screenshot({
			path: path.join(artifactRoot, `${currentFormat.toLowerCase()}-failure.png`),
			timeout: 5000
		});
	} catch (error) {
		recordPrivateFailure(error, 'failure screenshot unavailable');
	}
}

async function state(page, predicate, timeout = 90000) {
	await page.waitForFunction(predicate, null, { timeout });
	const last = await page.evaluate(() => window.officeStates.at(-1));
	if (last?.reason || ['error', 'refused', 'conflict', 'orphaned'].includes(last?.state)) {
		throw new Error(`production host refused the operation: ${JSON.stringify(last)}`);
	}
	return last;
}

async function collaborationSetup(editor) {
	const input = editor.locator('#id-dlg-username-caption input');
	if (!(await input.isVisible())) return;
	const dialog = editor.locator('.modal-dlg').filter({ has: input });
	const name = 'OCU office verification';
	await input.fill(name);
	if ((await input.inputValue()) !== name)
		throw new Error('collaboration name input does not match the intended name');
	await dialog.locator('.dlg-btn[result="ok"]').click();
	await input.waitFor({ state: 'hidden', timeout: 10000 });
}

async function open(context, file, generation) {
	const page = await context.newPage();
	activePage = page;
	const record = { format: currentFormat, generation, page };
	diagnosticPages.push(record);
	persistDiagnostics();
	const diagnostics = await collectOfficeDiagnostics(page, {
		pageId: `${currentFormat.toLowerCase()}-open-${generation}`,
		documentServerOrigin: config.document_server_origin,
		onUpdate: (latest) => {
			record.latest = latest;
			persistDiagnostics();
		}
	});
	record.collector = diagnostics;
	await page.goto(`${config.origin}/__verify_office__`);
	const createdResponse = page.waitForResponse(
		(response) =>
			response.url().endsWith(`/documents/${file.file_id}/sessions`) &&
			response.request().method() === 'POST'
	);
	await page.evaluate(
		({ chat, fileId, generation }) => {
			window.officeStates = [];
			window.addEventListener('message', (event) => {
				const frame = document.querySelector('iframe');
				if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
				if (event.data?.type === 'ocu:office-ready') {
					frame.contentWindow.postMessage(
						{ type: 'ocu:office-open', chat_id: chat, file_id: fileId, generation },
						location.origin
					);
				} else if (event.data?.type === 'ocu:office-state') window.officeStates.push(event.data);
			});
			const frame = document.createElement('iframe');
			frame.name = 'office-host';
			frame.title = 'Real Office host';
			frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
			frame.setAttribute('allow', '');
			frame.style.cssText = 'border:0;width:100vw;height:100vh';
			frame.src = `/preview/${chat}?embed=office`;
			document.body.style.margin = '0';
			document.body.append(frame);
		},
		{ chat: config.chat, fileId: file.file_id, generation }
	);
	const created = await (await createdResponse).json();
	await state(page, () => {
		const last = window.officeStates.at(-1);
		return last?.state === 'editing' || last?.reason;
	});
	await page.waitForFunction(() => document.querySelector('iframe') !== null);
	const deadline = Date.now() + 90000;
	let editor;
	while (Date.now() < deadline) {
		editor = page.frames().find((frame) => frame.name() === 'frameEditor');
		if (editor) break;
		await page.waitForTimeout(100);
	}
	if (!editor) throw new Error('real editor frame unavailable');
	const openingCheck = currentCheck;
	currentCheck = 'native editor readiness';
	const host = editor.parentFrame();
	if (!host) throw new Error('native editor parent frame unavailable');
	await host.waitForFunction(() => window.__verifyOfficeNativeReady === true, null, {
		timeout: 90000
	});
	await diagnostics.capturePolicy(editor);
	// The editor task posts readiness before constructing its guest prompt; inspect after that task.
	currentCheck = 'collaboration setup';
	await collaborationSetup(editor);
	currentCheck = openingCheck;
	return { page, editor, diagnostics, generation, documentKey: created.document_key };
}

async function command(opened, command) {
	await opened.page.evaluate(
		({ chat, generation, command }) => {
			document.querySelector('iframe').contentWindow.postMessage(
				{
					type: 'ocu:office-command',
					chat_id: chat,
					generation,
					command
				},
				location.origin
			);
		},
		{ chat: config.chat, generation: opened.generation, command }
	);
}

async function cell(opened, address) {
	const name = opened.editor.locator('input#ce-cell-name, #ce-cell-name input, #name-box input');
	if ((await name.count()) !== 1) throw new Error('spreadsheet native name box unavailable');
	await name.fill(address);
	await name.press('Enter');
}

async function dismissSynchronizationTip(editor) {
	// The tip's only button, by structure: its label follows the editor language.
	const tip = editor.locator('.synch-tip-root:visible .btn-div');
	if (await tip.isVisible()) await tip.click();
}

async function edit(opened, format) {
	await opened.page.bringToFront();
	const box = await opened.editor.frameElement().then((element) => element.boundingBox());
	if (!box) throw new Error('editor frame has no visible bounds');
	if (format === 'xlsx') {
		await cell(opened, 'A2');
		await dismissSynchronizationTip(opened.editor);
		const formulaBar = opened.editor.locator('#ce-cell-content');
		await formulaBar.click();
		await formulaBar.press('ControlOrMeta+a');
		await formulaBar.press('4');
		await formulaBar.press('Enter');
	} else if (format === 'docx') {
		await opened.page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.35);
		await opened.page.keyboard.press('ControlOrMeta+Home');
		await opened.page.keyboard.type('OCU_DOCX_EDIT ');
	} else {
		await dismissSynchronizationTip(opened.editor);
		const viewer = await opened.editor.locator('#id_viewer').boundingBox();
		if (!viewer) throw new Error('native slide viewer unavailable');
		await opened.page.mouse.dblclick(
			viewer.x + viewer.width * 0.5,
			viewer.y + viewer.height * 0.42
		);
		await opened.page.keyboard.press('End');
		const selected = await opened.editor.locator('#status-label-pages').innerText();
		// "Slide 1 of 3" or 「幻灯片第1张，共3张」: compare the numbers, not the language.
		if (selected.match(/\d+/g)?.join(',') !== '1,3')
			throw new Error('native title interaction navigated away from first slide');
		await opened.page.keyboard.type(' OCU_PPTX_EDIT');
		await opened.page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.85);
	}
	await state(
		opened.page,
		() => window.officeStates.some((row) => row.dirty) || window.officeStates.at(-1)?.reason,
		30000
	);
}

async function readback(opened, format) {
	if (format === 'xlsx') {
		await cell(opened, 'A2');
		const formulaBar = opened.editor.locator('#ce-cell-content');
		await formulaBar.waitFor({ state: 'visible' });
		await opened.editor.waitForFunction(
			() => {
				const element = document.querySelector('#ce-cell-content');
				return (element?.value ?? element?.innerText ?? element?.textContent ?? '').trim() === '4';
			},
			null,
			{ timeout: 5000 }
		);
		const observed = await formulaBar.evaluate(
			(element) => element.value ?? element.innerText ?? element.textContent
		);
		if (observed.trim() !== '4') throw new Error('native input value not 4');
		return { method: 'native name box selection + formula bar', observed: '4' };
	}
	await opened.page.keyboard.press('ControlOrMeta+f');
	const group = opened.editor.locator('div.search-input-group', {
		has: opened.editor.locator('input#search-bar-text')
	});
	if ((await group.count()) !== 1) throw new Error('native editor find search group unavailable');
	const search = group.locator('input#search-bar-text');
	const result = group.locator('div#search-bar-results');
	if ((await search.count()) !== 1 || !(await search.isVisible()))
		throw new Error('native editor find input unavailable');
	if ((await result.count()) !== 1 || !(await result.isVisible()))
		throw new Error('native editor find result unavailable');
	for (const [query, expected] of [
		['OCU_ABSENT_READBACK_172', 0],
		[format === 'docx' ? 'OCU_DOCX_EDIT' : 'OCU_PPTX_EDIT', 1]
	]) {
		await search.fill(query);
		await search.press('Enter');
		await opened.editor.waitForFunction(
			({ query, expected }) => {
				const input = document.querySelector('div.search-input-group input#search-bar-text');
				const result = input
					?.closest('div.search-input-group')
					?.querySelector('div#search-bar-results');
				const visible = (element) => {
					if (!element) return false;
					const bounds = element.getBoundingClientRect();
					return (
						bounds.width > 0 &&
						bounds.height > 0 &&
						getComputedStyle(element).visibility === 'visible'
					);
				};
				return (
					input?.value === query &&
					visible(input) &&
					visible(result) &&
					result.innerText.trim() === `${expected}/${expected}`
				);
			},
			{ query, expected },
			{ timeout: 15000 }
		);
	}
	return { method: 'native editor Find + visible 0/0 then 1/1 results', observed: 'one match' };
}

try {
	browser = await chromium.connectOverCDP(config.cdp_endpoint, { timeout: 30000 });
	const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
	await context.addInitScript(() => {
		window.__verifyOfficeNativeReady = false;
		window.addEventListener('message', (event) => {
			const editor = [...document.querySelectorAll('iframe')].find(
				(frame) => event.source === frame.contentWindow
			);
			if (!editor || event.origin !== new URL(editor.src, location.href).origin) return;
			let message;
			try {
				message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
			} catch {
				return;
			}
			if (message?.event === 'onDocumentReady') window.__verifyOfficeNativeReady = true;
		});
	});
	await context.route(`${config.origin}/**`, async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/__verify_office__') {
			await route.fulfill({
				contentType: 'text/html',
				body: '<!doctype html><html><body></body></html>'
			});
		} else {
			await route.continue({
				headers: { ...route.request().headers(), Authorization: `Bearer ${config.token}` }
			});
		}
	});
	for (const format of ['docx', 'xlsx', 'pptx']) {
		currentFormat = format.toUpperCase();
		currentCheck = 'open';
		const file = config.files[format];
		const opened = await open(context, file, 1);
		const original = await opened.page.evaluate(() => window.officeStates.at(-1));
		currentCheck = 'keyboard edit';
		await edit(opened, format);
		if (format === 'xlsx' || format === 'pptx') {
			currentCheck = 'native input readback';
			await readback(opened, format);
		}
		currentCheck = 'broker publication';
		const saved = opened.page.waitForResponse(
			(response) => response.url().endsWith('/save') && response.request().method() === 'POST'
		);
		await command(opened, 'save');
		const saveResponse = await saved;
		if (saveResponse.status() !== 202) throw new Error('production broker rejected save');
		const save = await saveResponse.json();
		await opened.page.waitForFunction(
			async ({ chat, session, sequence }) => {
				const response = await fetch(`/api/office/${chat}/sessions/${session}`);
				if (!response.ok) return false;
				const status = await response.json();
				return status.last_published_seq >= sequence;
			},
			{ chat: config.chat, session: original.session_id, sequence: save.save_seq },
			{ timeout: 90000 }
		);
		await opened.diagnostics.capturePolicy(opened.editor);
		await command(opened, 'close');
		await state(
			opened.page,
			() => window.officeStates.at(-1)?.state === 'closed' || window.officeStates.at(-1)?.reason
		);
		await requireCleanDiagnostics(opened);
		await opened.page.close();
		currentCheck = 'fresh editor reopen';
		const fresh = await open(context, file, 2);
		const reopened = await fresh.page.evaluate(() => window.officeStates.at(-1));
		if (reopened.session_id === original.session_id)
			throw new Error('reopen reused the closed session');
		if (!fresh.documentKey || fresh.documentKey === opened.documentKey)
			throw new Error('reopen reused the editor document key');
		const observation = await readback(fresh, format);
		currentCheck = 'fresh editor screenshot';
		const screenshot = `${format}-fresh-reopen.png`;
		await fresh.page.screenshot({ path: path.join(artifactRoot, screenshot), timeout: 5000 });
		currentCheck = 'fresh editor close';
		await fresh.diagnostics.capturePolicy(fresh.editor);
		await command(fresh, 'close');
		await state(
			fresh.page,
			() => window.officeStates.at(-1)?.state === 'closed' || window.officeStates.at(-1)?.reason
		);
		await requireCleanDiagnostics(fresh);
		await fresh.page.close();
		results.push({
			format: currentFormat,
			published_sequence: save.save_seq,
			fresh_session: true,
			readback: observation,
			fresh_reopen_screenshot: screenshot
		});
	}
} catch (error) {
	// Signed editor/source URLs stay in owned private diagnostics until post-retirement redaction.
	process.exitCode = 1;
	recordPrivateFailure(error, 'primary browser failure');
	await captureFailure();
	console.error(`${currentFormat} ${currentCheck}: real browser operation failed`);
} finally {
	for (const record of diagnosticPages) {
		if (!record.collector || record.page.isClosed()) continue;
		try {
			await requireCleanDiagnostics({ diagnostics: record.collector });
		} catch (error) {
			process.exitCode = 1;
			recordPrivateFailure(error, 'diagnostic finalization failed');
		}
	}
	if (browser) {
		try {
			await browser.close();
		} catch (error) {
			process.exitCode = 1;
			recordPrivateFailure(error, 'browser teardown failed');
			console.error(`${currentFormat} ${currentCheck}: real browser operation failed`);
		}
	}
	const finalCounts = diagnosticCounts(diagnosticPages);
	if (finalCounts.unexpected_console_errors || finalCounts.page_errors) {
		process.exitCode = 1;
		recordPrivateFailure(
			new Error('unexpected diagnostics retained after browser teardown'),
			'final browser diagnostics'
		);
		console.error(`${currentFormat} ${currentCheck}: real browser operation failed`);
	}
	persistDiagnostics();
	if (!process.exitCode && results.length === 3) {
		for (const result of results)
			result.diagnostics = diagnosticCounts(
				diagnosticPages.filter((row) => row.format === result.format)
			);
		fs.writeFileSync(config.result, JSON.stringify(results, null, 2) + '\n', { mode: 0o600 });
	}
}
