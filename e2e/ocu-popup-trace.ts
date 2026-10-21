import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from '@playwright/test';

const popupTraceDirectory = '.run/ui-evidence/popup-trace';

export type PopupTrace = {
	file: string;
	mark: (kind: string, fields?: Record<string, unknown>) => void;
	close: () => void;
};

export type PopupTraceEvent = {
	type?: string;
	request?: { url: string };
	redirectResponse?: { url: string; status: number };
	response?: { url: string; status: number };
	context?: { id?: number; auxData?: { isDefault?: boolean } };
	frame?: { url?: string; parentId?: string };
};

// testId is stable across --repeat-each, so the key carries the repetition: the HTML and SVG
// observations of one repetition get n = 1 and 2 and the next repetition starts again at 1.
const observations = new Map<string, number>();

/**
 * One JSONL trace per native popup observation under the UI evidence directory. Callers pass
 * already sanitized fields (`sanitizedLocation` for URLs, `redactOcu` for free text); the writer
 * adds only the wall clock. `t` is ISO, `ms` the same instant as the documents' `Date.now()`.
 */
export function popupTrace(): PopupTrace {
	const info = test.info();
	const key = `${info.testId}:${info.repeatEachIndex}`;
	const n = (observations.get(key) ?? 0) + 1;
	observations.set(key, n);
	const title = info.titlePath.join('-').replace(/[^A-Za-z0-9_-]+/g, '-');
	fs.mkdirSync(popupTraceDirectory, { recursive: true });
	const file = path.join(popupTraceDirectory, `${title}-${info.repeatEachIndex}-${n}.jsonl`);
	// Truncate: names repeat across harness runs and a trace describes this observation only.
	const fd = fs.openSync(file, 'w');
	let open = true;
	return {
		file,
		mark(kind, fields = {}) {
			if (!open) return;
			const now = Date.now();
			const row = { t: new Date(now).toISOString(), ms: now, kind, ...fields };
			fs.writeSync(fd, `${JSON.stringify(row)}\n`);
		},
		close() {
			if (!open) return;
			open = false;
			fs.closeSync(fd);
		}
	};
}

/** Chat ids are harness secrets like grants: `/ocu/files/<chat>/…` and `/ocu/f/[grant]/<chat>/…` lose the id. */
export function redactChat(path: string | null): string | null {
	return path?.replace(/^(\/ocu\/(?:files|f\/\[grant\]))\/[^/]+\//, '$1/[chat]/') ?? null;
}

/** Marks for the session events of the observed target; `sanitize` keeps grants out of the trace. */
export function tracePopupEvent(
	trace: PopupTrace,
	method: string,
	event: PopupTraceEvent,
	canonical: string,
	sanitize: (url: string) => string | null
) {
	if (method === 'Runtime.executionContextCreated')
		trace.mark('context.created', {
			id: event.context?.id ?? null,
			isDefault: event.context?.auxData?.isDefault ?? null
		});
	if (method === 'Page.frameNavigated')
		trace.mark('frame.navigated', {
			path: sanitize(event.frame?.url ?? ''),
			child: Boolean(event.frame?.parentId)
		});
	if (event.type !== 'Document') return;
	if (method === 'Network.requestWillBeSent' && event.request?.url === canonical)
		trace.mark('request', { path: sanitize(canonical) });
	if (method === 'Network.requestWillBeSent' && event.redirectResponse)
		trace.mark('redirect', {
			status: event.redirectResponse.status,
			from: sanitize(event.redirectResponse.url),
			path: sanitize(event.request?.url ?? '')
		});
	if (method === 'Network.responseReceived' && event.response)
		trace.mark('response', { status: event.response.status, path: sanitize(event.response.url) });
}
