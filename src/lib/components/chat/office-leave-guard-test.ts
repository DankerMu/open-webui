import { afterEach, beforeEach, expect, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { chatId } from '$lib/stores';
import { ocuWorkspaces } from '$lib/stores/ocu';
import { chat, json } from '../../../../test/ocu-workspace-fixtures';
import {
	OfficeArtifactHarness,
	officeCommandCalls,
	postOfficeState
} from './workspace-artifact-office-test';
import { officeLeaveGuard, officeLeaveSnapshot } from './office-leave-guard';

export const statusUrl = `/ocu/api/office/${chat}/sessions/sess-1`;
export const versionsUrl = `/ocu/api/office/${chat}/documents/report.docx/versions`;
export const status = (state: string, extra: Record<string, unknown> = {}) =>
	json({
		session_id: 'sess-1',
		file_id: 'report.docx',
		document_key: 'doc-key',
		state,
		reason: null,
		save_seq: 2,
		last_committed_seq: 2,
		last_published_seq: 2,
		workspace_changed: false,
		saved_as: null,
		...extra
	});

export function closingStatus() {
	return status('closing', { last_committed_seq: 1, last_published_seq: 1 });
}

export async function deliver(held: { resolve: (response: Response) => void }, response: Response) {
	const consumed = vi.spyOn(response, 'json');
	held.resolve(response);
	await vi.waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
	await consumed.mock.results[0].value;
	await tick();
}

export function expectUnconfirmedSelection(
	frame: HTMLIFrameElement,
	sent: { mock: { calls: unknown[][] } },
	generation: number
) {
	expect(frame.isConnected).toBe(false);
	expect(get(ocuWorkspaces)[chat].selectedFileId).toBe('page.html');
	expect(get(officeLeaveSnapshot).reports[chat]).toMatchObject({
		outcome: 'unconfirmed',
		generation
	});
	expect(officeCommandCalls(sent)).toHaveLength(1);
}

export function createOfficeGuardTestHarness() {
	const harness = new OfficeArtifactHarness();
	beforeEach(() => {
		harness.install();
		chatId.set(chat);
	});
	afterEach(async () => {
		officeLeaveGuard.dispose();
		await harness.cleanup();
		chatId.set('');
	});
	return {
		harness,
		holdStatus() {
			const held = Promise.withResolvers<Response>();
			const fallback = harness.scenario;
			harness.scenario = (url, init) => (url === statusUrl ? held.promise : fallback(url, init));
			return held;
		},
		async openDirty() {
			const { frame, ...handshake } = await harness.openAcceptedEditor();
			postOfficeState(frame, handshake.openMessage.generation, { dirty: true });
			await tick();
			return { frame, ...handshake };
		}
	};
}
