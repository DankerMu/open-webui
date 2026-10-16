import { randomUUID } from 'node:crypto';

const UNLOAD_REFUSAL = 'Permissions policy violation: unload is not allowed in this document.';

function origin(url) {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

function documentPolicy(policies, pageId, frameId, documentId, expectedOrigin, child = false) {
	const matches = policies.filter(
		(row) => row.pageId === pageId && row.frameId === frameId && row.documentId === documentId
	);
	const signature = (row) =>
		JSON.stringify([row.documentUrl, row.unloadAllowed, child ? row.ancestry : null]);
	const policy = matches[0];
	if (
		!policy ||
		policy.unloadAllowed !== false ||
		origin(policy.documentUrl) !== expectedOrigin ||
		matches.some((row) => signature(row) !== signature(policy))
	)
		return undefined;
	return policy;
}

function childProvenance(nativeEntry, expectedOrigin) {
	const { provenance, entry, frameId, documentId } = nativeEntry;
	const stack = entry.stackTrace.callFrames;
	return (
		Array.isArray(provenance) &&
		provenance.length === stack.length &&
		provenance.every(
			(row, index) =>
				row.frameId === frameId &&
				row.executionContextUniqueId === documentId &&
				row.scriptId === stack[index].scriptId &&
				row.scriptUrl === stack[index].url &&
				origin(row.scriptUrl) === expectedOrigin
		)
	);
}

function validAncestry(chain) {
	if (!Array.isArray(chain) || chain.length < 2) return false;
	if (
		chain.some(
			(row, index) =>
				!row ||
				typeof row.frameId !== 'string' ||
				!row.frameId ||
				typeof row.documentId !== 'string' ||
				!row.documentId ||
				(index < chain.length - 1 && row.parentFrameId !== chain[index + 1]?.frameId)
		)
	)
		return false;
	const frameIds = new Set(chain.map((row) => row.frameId));
	return (
		frameIds.size === chain.length &&
		new Set(chain.map((row) => row.documentId)).size === chain.length &&
		!frameIds.has(chain.at(-1).parentFrameId)
	);
}

function ownedChildPolicy(observations, nativeEntry) {
	const { pageId, editorFrameId, editorDocumentId, documentServerOrigin, policies } = observations;
	const { frameId, documentId } = nativeEntry;
	if (
		typeof documentId !== 'string' ||
		!documentId ||
		typeof editorDocumentId !== 'string' ||
		!editorDocumentId ||
		!childProvenance(nativeEntry, documentServerOrigin)
	)
		return undefined;
	const policy = documentPolicy(policies, pageId, frameId, documentId, documentServerOrigin, true);
	const chain = policy?.ancestry;
	if (!validAncestry(chain)) return undefined;
	if (
		chain[0].frameId !== frameId ||
		chain[0].documentId !== documentId ||
		chain.at(-1).frameId !== editorFrameId ||
		chain.at(-1).documentId !== editorDocumentId ||
		!documentPolicy(policies, pageId, editorFrameId, editorDocumentId, documentServerOrigin)
	)
		return undefined;
	return policy;
}

// A native delivery is evidence for one console observation, never a text allowlist.
export function classifyOfficeDiagnostics({
	pageId,
	editorFrameId,
	editorDocumentId,
	documentServerOrigin,
	consoleErrors,
	nativeEntries,
	policies,
	pageErrors
}) {
	const expectedPolicyDenials = [];
	const consumed = new Set();
	const deliveries = new Set();
	for (const nativeEntry of nativeEntries) {
		const { entry, frameId, documentId } = nativeEntry;
		if (
			!editorFrameId ||
			nativeEntry.pageId !== pageId ||
			entry.source !== 'violation' ||
			entry.level !== 'error' ||
			entry.text !== UNLOAD_REFUSAL ||
			!Number.isFinite(entry.timestamp) ||
			origin(entry.url) !== documentServerOrigin ||
			!entry.stackTrace?.callFrames?.some((frame) => frame.scriptId && frame.url === entry.url)
		)
			continue;
		const identity = JSON.stringify([
			pageId,
			frameId,
			documentId,
			entry.timestamp,
			entry.source,
			entry.level,
			entry.text,
			entry.url,
			entry.lineNumber,
			entry.stackTrace
		]);
		if (deliveries.has(identity)) continue;
		deliveries.add(identity);
		const policy =
			frameId === editorFrameId
				? policies.find(
						(row) =>
							row.pageId === pageId &&
							row.frameId === frameId &&
							row.unloadAllowed === false &&
							origin(row.documentUrl) === documentServerOrigin &&
							(documentId === undefined
								? row.documentId === undefined
								: row.documentId === documentId)
					)
				: ownedChildPolicy(
						{ pageId, editorFrameId, editorDocumentId, documentServerOrigin, policies },
						nativeEntry
					);
		if (!policy) continue;
		const index = consoleErrors.findIndex(
			(row, index) =>
				!consumed.has(index) &&
				row.pageId === pageId &&
				row.text === UNLOAD_REFUSAL &&
				row.source !== 'javascript' &&
				(row.frameId === undefined || row.frameId === frameId) &&
				row.location?.url === entry.url &&
				row.location.lineNumber === entry.lineNumber &&
				row.location.columnNumber === (entry.columnNumber ?? 0)
		);
		if (index === -1) continue;
		consumed.add(index);
		expectedPolicyDenials.push({ consoleError: consoleErrors[index], nativeEntry, policy });
	}
	return {
		expectedPolicyDenials,
		unexpectedConsoleErrors: consoleErrors.filter((_, index) => !consumed.has(index)),
		pageErrors
	};
}

// Attach before navigation. snapshot() keeps raw document proof private.
export async function collectOfficeDiagnostics(
	page,
	{ pageId, documentServerOrigin, onUpdate = () => {} }
) {
	if (!documentServerOrigin || origin(documentServerOrigin) !== documentServerOrigin)
		throw new Error('diagnostic collection requires the configured DocumentServer origin');
	const consoleErrors = [];
	const nativeObservations = [];
	const policies = [];
	const pageErrors = [];
	const sessions = [];
	const frames = new Map();
	const pending = new Set();
	const observationErrors = [];
	let editorFrameId;
	let editorDocumentId;
	let sequence = 0;

	function snapshot() {
		const observations = {
			pageId,
			editorFrameId,
			editorDocumentId,
			documentServerOrigin,
			consoleErrors,
			nativeEntries: nativeObservations,
			policies,
			pageErrors
		};
		return { observations, ...classifyOfficeDiagnostics(observations) };
	}

	function changed() {
		onUpdate(snapshot());
	}

	function current(lifetime) {
		return !lifetime.retired && lifetime.session.lifetimes.get(lifetime.context.id) === lifetime;
	}

	function frameContexts(frameId) {
		const contexts = new Map();
		for (const session of sessions) {
			for (const lifetime of session.lifetimes.values()) {
				const context = lifetime.context;
				if (current(lifetime) && context.auxData?.isDefault && context.auxData.frameId === frameId)
					contexts.set(context.uniqueId, lifetime);
			}
		}
		return [...contexts.values()];
	}

	function ancestry(context) {
		const rows = [];
		const witnesses = [];
		const visited = new Set();
		let frameId = context.auxData.frameId;
		while (frameId) {
			if (visited.has(frameId)) return undefined;
			visited.add(frameId);
			const candidates = frameContexts(frameId);
			if (candidates.length !== 1) break;
			const lifetime = candidates[0];
			if (!lifetime.context.uniqueId || lifetime.context.origin !== documentServerOrigin) break;
			const frame = frames.get(frameId);
			rows.push(
				Object.freeze({
					frameId,
					parentFrameId: frame?.parentFrameId,
					documentId: lifetime.context.uniqueId
				})
			);
			witnesses.push({ frameId, frame, lifetime });
			frameId = frame?.parentFrameId;
		}
		return { rows: Object.freeze(rows), witnesses };
	}

	function ancestryCurrent(proof) {
		return proof?.witnesses.every(
			(row) => frames.get(row.frameId) === row.frame && current(row.lifetime)
		);
	}

	async function observePolicy(lifetime) {
		const context = lifetime.context;
		const { result, exceptionDetails } = await lifetime.session.client.send('Runtime.evaluate', {
			uniqueContextId: context.uniqueId,
			expression:
				"JSON.stringify({documentUrl:location.href,unloadAllowed:(document.permissionsPolicy ?? document.featurePolicy)?.allowsFeature('unload') ?? null})",
			returnByValue: true
		});
		if (!current(lifetime) || !ancestryCurrent(lifetime.ancestry)) return;
		if (exceptionDetails) throw new Error('diagnostic unload policy observation failed');
		policies.push(
			Object.freeze({
				pageId,
				frameId: context.auxData.frameId,
				documentId: context.uniqueId,
				...JSON.parse(result.value),
				ancestry: lifetime.ancestry.rows
			})
		);
		changed();
	}

	function schedulePolicy(lifetime) {
		const task = observePolicy(lifetime)
			.catch((error) => {
				if (current(lifetime)) observationErrors.push(error);
			})
			.finally(() => pending.delete(task));
		pending.add(task);
	}

	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const argumentCount = message.args().length;
		consoleErrors.push({
			id: `${pageId}-console-${++sequence}`,
			pageId,
			text: message.text(),
			location: message.location(),
			argumentCount,
			source: argumentCount ? 'javascript' : 'native-log'
		});
		changed();
	});
	page.on('pageerror', (error) => {
		pageErrors.push({
			id: `${pageId}-pageerror-${++sequence}`,
			pageId,
			message: error.message,
			stack: error.stack
		});
		changed();
	});

	function retainNative(entry, session) {
		const owners = (entry.stackTrace?.callFrames ?? []).map((frame) => {
			const script = session.scripts.get(frame.scriptId);
			return script && script.url === frame.url && !script.ambiguous ? script.lifetime : undefined;
		});
		const owner = owners[0];
		const proven =
			owner?.context.uniqueId &&
			owners.every(
				(candidate) =>
					candidate?.context.uniqueId === owner.context.uniqueId &&
					current(candidate) &&
					ancestryCurrent(candidate.ancestry)
			);
		nativeObservations.push({
			pageId,
			entry,
			frameId: proven ? owner.context.auxData?.frameId : undefined,
			documentId: proven ? owner.context.uniqueId : undefined,
			provenance: owners.map((lifetime, index) => ({
				scriptId: entry.stackTrace.callFrames[index].scriptId,
				scriptUrl: entry.stackTrace.callFrames[index].url,
				executionContextId: lifetime?.context.id,
				executionContextUniqueId: lifetime?.context.uniqueId,
				frameId: lifetime?.context.auxData?.frameId
			}))
		});
		changed();
	}

	function seedFrames(tree, parentFrameId) {
		const frame = tree.frame;
		if (!frames.has(frame.id))
			frames.set(frame.id, { parentFrameId: frame.parentId ?? parentFrameId });
		for (const child of tree.childFrames ?? []) seedFrames(child, frame.id);
	}

	async function attach(target) {
		const client = await page.context().newCDPSession(target);
		const session = { client, lifetimes: new Map(), scripts: new Map() };
		sessions.push(session);
		client.on('Page.frameAttached', ({ frameId, parentFrameId }) => {
			frames.set(frameId, { parentFrameId });
		});
		client.on('Page.frameNavigated', ({ frame }) => {
			frames.set(frame.id, {
				parentFrameId: frame.parentId ?? frames.get(frame.id)?.parentFrameId
			});
		});
		client.on('Page.frameDetached', ({ frameId }) => frames.delete(frameId));
		client.on('Runtime.executionContextCreated', ({ context }) => {
			const previous = session.lifetimes.get(context.id);
			if (previous) previous.retired = true;
			const lifetime = { context, session, retired: false };
			session.lifetimes.set(context.id, lifetime);
			if (
				context.uniqueId &&
				context.auxData?.isDefault &&
				context.origin === documentServerOrigin
			) {
				lifetime.ancestry = ancestry(context);
				if (lifetime.ancestry) schedulePolicy(lifetime);
			}
		});
		client.on(
			'Runtime.executionContextDestroyed',
			({ executionContextId, executionContextUniqueId }) => {
				const lifetime = session.lifetimes.get(executionContextId);
				if (
					lifetime &&
					(!executionContextUniqueId || executionContextUniqueId === lifetime.context.uniqueId)
				)
					lifetime.retired = true;
			}
		);
		client.on('Runtime.executionContextsCleared', () => {
			for (const lifetime of session.lifetimes.values()) lifetime.retired = true;
		});
		client.on('Debugger.scriptParsed', (script) => {
			const lifetime = session.lifetimes.get(script.executionContextId);
			const previous = session.scripts.get(script.scriptId);
			session.scripts.set(script.scriptId, {
				url: script.url,
				lifetime: lifetime && current(lifetime) ? lifetime : undefined,
				ambiguous: previous?.ambiguous || (previous && previous.lifetime !== lifetime)
			});
		});
		client.on('Log.entryAdded', ({ entry }) => {
			if (entry.level === 'error') retainNative(entry, session);
		});
		await client.send('Page.enable');
		seedFrames((await client.send('Page.getFrameTree')).frameTree);
		await client.send('Runtime.enable');
		await client.send('Debugger.enable');
		await client.send('Log.enable');
		return session;
	}

	await attach(page);
	changed();

	async function capturePolicy(editor) {
		const marker = `__verifyOfficeDiagnostics_${randomUUID()}`;
		await editor.evaluate((key) => {
			window[key] = true;
		}, marker);
		const observed = [];
		async function observe(session) {
			for (const lifetime of session.lifetimes.values()) {
				const context = lifetime.context;
				if (!current(lifetime) || !context.auxData?.isDefault || !context.uniqueId) continue;
				let response;
				try {
					response = await session.client.send('Runtime.evaluate', {
						uniqueContextId: context.uniqueId,
						expression: `globalThis[${JSON.stringify(marker)}] === true ? JSON.stringify({documentUrl:location.href,unloadAllowed:(document.permissionsPolicy ?? document.featurePolicy)?.allowsFeature('unload') ?? null}) : null`,
						returnByValue: true
					});
				} catch (error) {
					if (!current(lifetime)) continue;
					throw error;
				}
				if (!current(lifetime)) continue;
				if (response.exceptionDetails)
					throw new Error('diagnostic unload policy observation failed');
				if (response.result.value === null) continue;
				observed.push(
					Object.freeze({
						pageId,
						frameId: context.auxData.frameId,
						documentId: context.uniqueId,
						...JSON.parse(response.result.value)
					})
				);
			}
		}
		try {
			for (const session of sessions) await observe(session);
			if (!observed.length) {
				const session = await attach(editor);
				session.editor = editor;
				await observe(session);
			}
			if (
				new Set(observed.map((row) => row.frameId)).size !== 1 ||
				new Set(observed.map((row) => row.documentId)).size !== 1 ||
				!observed[0]?.frameId ||
				!observed[0]?.documentId
			)
				throw new Error('diagnostic editor frame identity is ambiguous or unavailable');
			editorFrameId = observed[0].frameId;
			editorDocumentId = observed[0].documentId;
			policies.push(...observed);
		} finally {
			await editor.evaluate((key) => {
				delete window[key];
			}, marker);
		}
		changed();
		return snapshot();
	}

	async function drain() {
		for (const session of sessions) {
			if (page.isClosed() || session.editor?.isDetached()) continue;
			try {
				await session.client.send('Runtime.getIsolateId');
			} catch (error) {
				if (!page.isClosed() && !session.editor?.isDetached()) throw error;
			}
		}
		while (pending.size) await Promise.all([...pending]);
		if (observationErrors.length) throw observationErrors[0];
		changed();
		return snapshot();
	}

	return { capturePolicy, drain, snapshot };
}
