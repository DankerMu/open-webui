import * as fs from 'node:fs';
import { expect, type Page } from '@playwright/test';

const contextFile = process.env.OCU_E2E_CONTEXT;
if (!contextFile) throw new Error('OCU_E2E_CONTEXT is required; run make verify-ui-ocu');
export const context: {
	origin: string;
	chats: Record<string, string>;
	fixtures: string;
	record: string;
	restart: {
		stub: { old_pid: number; new_pid: number };
		backend: { old_pid: number; new_pid: number };
		record_offset: number;
	};
} = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
export const evidence = '.run/ui-evidence';
fs.mkdirSync(evidence, { recursive: true });

export function records() {
	return fs
		.readFileSync(context.record, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export function recordsSince(offset: number) {
	return fs
		.readFileSync(context.record)
		.subarray(offset)
		.toString('utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

export function setScenario(chatId: string, scenario: string) {
	const rows = JSON.parse(fs.readFileSync(context.fixtures, 'utf8'));
	rows[chatId] = scenario;
	const staged = `${context.fixtures}.controls`;
	fs.writeFileSync(staged, JSON.stringify(rows));
	fs.renameSync(staged, context.fixtures);
}

export async function createScenarioChat(
	page: Page,
	scenario: string,
	nativeArtifact = false
): Promise<string> {
	const token = await page.evaluate(() => localStorage.token);
	const message = {
		id: 'fixture-artifact',
		role: 'assistant',
		content:
			'```svg\n<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5"/></svg>\n```',
		parentId: null,
		childrenIds: [],
		timestamp: 1
	};
	const response = await page.request.post('/api/v1/chats/new', {
		headers: { Authorization: `Bearer ${token}` },
		data: {
			chat: {
				title: 'Workspace controls fixture',
				history: nativeArtifact
					? { messages: { [message.id]: message }, currentId: message.id }
					: { messages: {}, currentId: null }
			}
		}
	});
	expect(response.ok()).toBe(true);
	const created = await response.json();
	expect(created.id).toBeTruthy();
	setScenario(created.id, scenario);
	return created.id;
}
