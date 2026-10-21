import { expect, type Page } from '@playwright/test';
import { openAuthenticatedPage, test } from './ocu-auth';
import {
	POPUP_DOCUMENT_EXPRESSION,
	context,
	sourceTargetContext,
	tracePath,
	type PopupDocument
} from './ocu-fixtures';
import { popupTrace, tracePopupEvent, type PopupTrace } from './ocu-popup-trace';
import {
	cdpDeadline,
	openBrowserCdp,
	retireBrowserTargets,
	type BrowserCdpController,
	type CdpTargetSession
} from '../scripts/ocu-target-bridge.mjs';

type AttachedEvent = {
	sessionId: string;
	waitingForDebugger: boolean;
	targetInfo: { targetId: string; type: string; browserContextId?: string };
};

type ProbeState = {
	targetId?: string;
	probe?: CdpTargetSession;
	requestSent: boolean;
	pageExposed: boolean;
	last?: PopupDocument;
	outcome: 'A' | 'B';
};

/** Attach handler: enables the probe domains on the popup and deliberately never resumes it. */
function releaseProbeAttachment(
	root: BrowserCdpController,
	trace: PopupTrace,
	state: ProbeState,
	canonical: string,
	accept: (info: AttachedEvent['targetInfo']) => boolean,
	registry: {
		sessions: Map<string, CdpTargetSession>;
		jobs: Set<Promise<void>>;
		paused: Set<string>;
	},
	selectedTarget: PromiseWithResolvers<string>
) {
	return ({ targetInfo, sessionId, waitingForDebugger }: AttachedEvent) => {
		const selected = state.targetId === undefined && accept(targetInfo);
		trace.mark('target.attached', { selected, waitingForDebugger, type: targetInfo.type });
		if (waitingForDebugger) registry.paused.add(sessionId);
		if (selected) state.targetId = targetInfo.targetId;
		const job = (async () => {
			const attached = root.session(
				sessionId,
				selected
					? (method, params) => {
							tracePopupEvent(trace, method, params, canonical, tracePath);
							if (
								method === 'Network.requestWillBeSent' &&
								params.type === 'Document' &&
								params.request?.url === canonical
							)
								state.requestSent = true;
						}
					: undefined
			);
			registry.sessions.set(sessionId, attached);
			if (!selected) {
				// Foreign targets belong to the browser; only the probe's own popup stays paused.
				if (waitingForDebugger) {
					await attached.send('Runtime.runIfWaitingForDebugger');
					registry.paused.delete(sessionId);
				}
				return;
			}
			await Promise.all([
				attached.send('Runtime.enable'),
				attached.send('Page.enable'),
				attached.send('Network.enable')
			]);
			// No Runtime.runIfWaitingForDebugger from this session: the experiment asks whether
			// another client's resume (Playwright's) releases the document on this host.
			trace.mark('probe.enabled', { waitingForDebugger });
			state.probe = attached;
			selectedTarget.resolve(targetInfo.targetId);
		})();
		registry.jobs.add(job);
		void job
			.catch(() => selectedTarget.reject(new Error('Release probe attachment failed')))
			.finally(() => registry.jobs.delete(job));
	};
}

async function pollProjection(trace: PopupTrace, state: ProbeState, grantedPath: string) {
	const probe = state.probe;
	if (!probe) throw new Error('Release probe session missing');
	const deadline = Date.now() + 20_000;
	do {
		const polled = await probe
			.send('Runtime.evaluate', { expression: POPUP_DOCUMENT_EXPRESSION, returnByValue: true })
			.then((result) => {
				if (result.exceptionDetails || typeof result.result?.value !== 'string')
					throw new Error('Release probe DOM evaluation failed');
				return JSON.parse(result.result.value) as PopupDocument;
			})
			.catch((error: unknown) => {
				// A paused renderer may not answer within the bridge deadline; that is itself a reading.
				trace.mark('poll', { error: String(error) });
				return undefined;
			});
		if (polled) {
			state.last = polled;
			trace.mark('poll', {
				readyState: polled.readyState,
				collector: polled.collector,
				posted: polled.posted,
				path: polled.path,
				proof: polled.proof,
				requestSent: state.requestSent,
				pageExposed: state.pageExposed
			});
			if (
				polled.path === grantedPath &&
				polled.proof === 'null|blocked|blocked|blocked' &&
				polled.readyState === 'complete'
			) {
				state.outcome = 'A';
				return;
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	} while (Date.now() < deadline);
}

function outcomeFields(state: ProbeState) {
	return {
		outcome: state.outcome,
		requestSent: state.requestSent,
		pageExposed: state.pageExposed,
		readyState: state.last?.readyState ?? null,
		proof: state.last?.proof ?? null,
		collector: state.last?.collector ?? null,
		posted: state.last?.posted ?? null,
		path: state.last?.path ?? null
	};
}

/**
 * Release-semantics experiment (#95, design.md Decision 4). Diagnostic only: collected through
 * `make verify-ui-ocu-repeat SPEC=ocu-popup-release.e2e.ts REPEAT=n`, never by the default run.
 * Outcome A: the document completes without the probe's resume (the first resume, Playwright's,
 * releases the target). Outcome B: the document stays paused until cleanup (every attached client
 * must resume). Both are valid results; the test records the outcome and fails only on plumbing.
 */
test('popup release semantics: paused SVG popup never resumed from the probe session', async ({
	page,
	context: browser
}) => {
	test.setTimeout(120_000);
	const owner = browser.browser();
	if (!owner) throw new Error('Release probe requires a Chromium browser');
	await openAuthenticatedPage(page, `/c/${context.chats.link}`);
	const svgLink = page.getByRole('link', { name: 'Open scripted SVG' });
	await expect(svgLink).toBeVisible();
	const canonical = new URL(`/ocu/files/${context.chats.link}/diagram.svg`, context.origin).href;
	const grantedPath = `/ocu/f/[grant]/${context.chats.link}/diagram.svg`;
	const trace = popupTrace();
	const root = await openBrowserCdp(owner);
	const registry = {
		sessions: new Map<string, CdpTargetSession>(),
		jobs: new Set<Promise<void>>(),
		paused: new Set<string>()
	};
	const state: ProbeState = { requestSent: false, pageExposed: false, outcome: 'B' };
	let existing = new Set<string>();
	let contextId = '';
	const selectedTarget = Promise.withResolvers<string>();
	void selectedTarget.promise.catch(() => undefined);
	const onPage = (opened: Page) => {
		state.pageExposed = true;
		trace.mark('page.event', { path: tracePath(opened.url()) });
	};
	const onAttached = releaseProbeAttachment(
		root,
		trace,
		state,
		canonical,
		(info) =>
			!existing.has(info.targetId) && info.type === 'page' && info.browserContextId === contextId,
		registry,
		selectedTarget
	);
	browser.on('page', onPage);
	root.on('Target.attachedToTarget', onAttached);
	let cleanup: string[] = [];
	let recorded: ReturnType<typeof outcomeFields> | undefined;
	try {
		await root.send('Target.setDiscoverTargets', { discover: true });
		const { targetInfos } = await root.send('Target.getTargets');
		existing = new Set(targetInfos.map(({ targetId }: { targetId: string }) => targetId));
		contextId = await sourceTargetContext(browser, page, targetInfos);
		await root.send('Target.setAutoAttach', {
			autoAttach: true,
			waitForDebuggerOnStart: true,
			flatten: true,
			filter: [{ type: 'page', exclude: false }, { exclude: true }]
		});
		trace.mark('click.start');
		await svgLink.click({ modifiers: ['ControlOrMeta'] });
		trace.mark('click.end');
		await cdpDeadline(selectedTarget.promise, 'release-probe-target-timeout', 10_000);
		await pollProjection(trace, state, grantedPath);
	} finally {
		// Snapshot before cleanup: retireBrowserTargets resumes the paused session and the request then goes out.
		recorded = outcomeFields(state);
		trace.mark('outcome', recorded);
		browser.off('page', onPage);
		try {
			cleanup = await retireBrowserTargets(
				root,
				registry.sessions,
				registry.jobs,
				registry.paused,
				state.targetId,
				false,
				true
			);
		} catch {
			cleanup.push('target retirement');
		} finally {
			root.off('Target.attachedToTarget', onAttached);
			trace.mark('retired', { errors: cleanup });
			trace.close();
			await root.close().catch(() => cleanup.push('root socket'));
		}
	}
	const summary = `popup-release outcome ${JSON.stringify(recorded)} trace=${trace.file}`;
	test.info().annotations.push({ type: 'popup-release-outcome', description: summary });
	process.stdout.write(`${summary}\n`);
	expect(cleanup, 'release probe retired its target and sessions').toEqual([]);
	expect(root.eventErrors, 'release probe root protocol observers remain healthy').toBe(0);
});
