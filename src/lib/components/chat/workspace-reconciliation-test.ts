import { expect } from 'vitest';
import { describeBody, file, listing } from '../../../../test/ocu-workspace-fixtures';
import { createWorkspaceReconciliation } from './workspace-reconciliation';

// Deterministic transport and link-click harness for workspace-reconciliation tests.
export type Transport = NonNullable<
	Parameters<typeof createWorkspaceReconciliation>[0]['transport']
>;
export const firstPage = {
	kind: 'listing' as const,
	listing: listing([file('page.html')]),
	etag: 'W/"first"'
};

export function fixture() {
	const describeCalls: string[] = [];
	const listCalls: Array<{ cursor?: string; etag?: string }> = [];
	const writes: Array<{ chatId: string; prefs: object }> = [];
	let launches = 0;
	let refreshes = 0;
	const api: Transport = {
		describe: async (_token, id) => {
			describeCalls.push(id);
			return { ...describeBody };
		},
		list: async (_base, _id, cursor, options) => {
			listCalls.push({ cursor, etag: options?.etag });
			return firstPage;
		},
		launch: async () => {
			launches++;
			return { state: 'running' };
		},
		refresh: async () => {
			refreshes++;
			return { revision: 1 };
		},
		prefs: async (_token, id, prefs) => {
			writes.push({ chatId: id, prefs });
			return { prefs };
		}
	};
	return {
		api,
		describeCalls,
		listCalls,
		writes,
		get launches() {
			return launches;
		},
		get refreshes() {
			return refreshes;
		}
	};
}
export const controller = (api: Transport, visible?: () => boolean) =>
	createWorkspaceReconciliation({
		token: () => 'owner-session',
		translate: (key: string) => key,
		available: () => true,
		transport: api,
		visible
	});

export function clickFileLink(owner: ReturnType<typeof controller>, id: string, path: string) {
	const anchor = document.createElement('a');
	anchor.href = `${window.location.origin}/ocu/files/${id}/${path}`;
	const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
	Object.defineProperty(event, 'target', { value: anchor });
	owner.handleLinkClick(event, id);
	expect(event.defaultPrevented).toBe(true);
}
