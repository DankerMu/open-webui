import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/** @template T @param {Promise<T>} work @param {string} label @param {number} [timeout] */
export function cdpDeadline(work, label, timeout = 3_000) {
	const gate = Promise.withResolvers();
	const timer = setTimeout(() => gate.reject(new Error(label)), timeout);
	return Promise.race([work, gate.promise]).finally(() => clearTimeout(timer));
}

/**
 * @typedef {object} CdpTargetSession
 * @property {string} sessionId
 * @property {number} eventErrors
 * @property {(method: string, params?: object) => Promise<any>} send
 * @property {() => Promise<void>} detach
 */

/**
 * @typedef {object} BrowserCdpController
 * @property {(method: string, params?: object) => Promise<any>} send
 * @property {(sessionId: string, onEvent?: (method: string, params: any) => void) => CdpTargetSession} session
 * @property {(method: string, listener: (params: any) => void) => void} on
 * @property {(method: string, listener: (params: any) => void) => void} off
 * @property {number} eventErrors
 * @property {() => Promise<void>} close
 */

/** @param {string[]} command */
async function managedProfileDirectory(command) {
	const profiles = command.filter((value) => value.startsWith('--user-data-dir='));
	if (
		profiles.length !== 1 ||
		!command.includes('--remote-debugging-port=0') ||
		!command.includes('--enable-automation') ||
		command.some(
			(value) =>
				value.startsWith('--remote-debugging-address') &&
				value !== '--remote-debugging-address=127.0.0.1'
		)
	)
		throw new Error('managed loopback launch required');
	const profile = profiles[0].slice('--user-data-dir='.length);
	const [resolved, temporary, stat] = await Promise.all([
		fs.realpath(profile),
		fs.realpath(os.tmpdir()),
		fs.lstat(profile)
	]);
	if (
		!/^playwright_chromiumdev_profile-[A-Za-z0-9]+$/.test(path.basename(resolved)) ||
		path.dirname(resolved) !== temporary ||
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		(stat.mode & 0o077) !== 0 ||
		stat.uid !== process.getuid?.()
	)
		throw new Error('private managed profile required');
	return { resolved, uid: stat.uid };
}

/** @param {import('@playwright/test').Browser} browser */
async function managedBrowserEndpoint(browser) {
	const attachment = browser.newBrowserCDPSession();
	let metadata;
	try {
		metadata = await cdpDeadline(attachment, 'Private CDP metadata unavailable');
	} catch {
		// A late attachment must still detach; its owning browser also retires on test failure.
		void attachment.then((session) => session.detach()).catch(() => undefined);
		throw new Error('Private CDP metadata unavailable');
	}
	try {
		const { arguments: command } = await cdpDeadline(
			metadata.send('Browser.getBrowserCommandLine'),
			'Private CDP metadata deadline exceeded'
		);
		const { resolved, uid } = await managedProfileDirectory(command);
		const activePort = path.join(resolved, 'DevToolsActivePort');
		const portStat = await fs.lstat(activePort);
		if (
			!portStat.isFile() ||
			portStat.isSymbolicLink() ||
			portStat.uid !== uid ||
			portStat.size > 256
		)
			throw new Error('managed endpoint metadata required');
		const rows = (await fs.readFile(activePort, 'utf8')).trim().split('\n');
		const [port, route] = rows;
		if (
			rows.length !== 2 ||
			!/^[1-9]\d{0,4}$/.test(port) ||
			Number(port) > 65535 ||
			!/^\/devtools\/browser\/[a-f0-9-]+$/.test(route)
		)
			throw new Error('loopback endpoint required');
		return `ws://127.0.0.1:${port}${route}`;
	} finally {
		await cdpDeadline(metadata.detach(), 'Private CDP metadata retirement failed');
	}
}

/**
 * Own a private flattened CDP connection to this Playwright-managed browser only.
 * @param {import('@playwright/test').Browser} browser
 * @returns {Promise<BrowserCdpController>}
 */
export async function openBrowserCdp(browser) {
	let endpoint;
	try {
		endpoint = await managedBrowserEndpoint(browser);
	} catch {
		throw new Error('Private CDP endpoint discovery failed');
	}
	let socket;
	try {
		socket = new global.WebSocket(endpoint);
	} catch {
		throw new Error('Private CDP connection unavailable');
	}
	const opened = Promise.withResolvers();
	const ended = Promise.withResolvers();
	void opened.promise.catch(() => undefined);
	let closed = false;
	let nextId = 0;
	let eventErrors = 0;
	/** @type {Map<number, { sessionId?: string, resolve: (value: any) => void, reject: (error: Error) => void }>} */
	const pending = new Map();
	/** @type {Map<string, Set<(params: any) => void>>} */
	const listeners = new Map();
	/** @type {Map<string, { closed: boolean, errors: number, onEvent?: (method: string, params: any) => void }>} */
	const sessions = new Map();
	const retire = () => {
		closed = true;
		for (const waiter of pending.values()) waiter.reject(new Error('Private CDP transport closed'));
		pending.clear();
		for (const session of sessions.values()) session.closed = true;
		sessions.clear();
		listeners.clear();
	};
	/** @param {string} sessionId */
	const retireSession = (sessionId) => {
		const session = sessions.get(sessionId);
		if (session) session.closed = true;
		sessions.delete(sessionId);
		for (const [id, waiter] of pending) {
			if (waiter.sessionId !== sessionId) continue;
			waiter.reject(new Error('Private CDP target detached'));
			pending.delete(id);
		}
	};
	const onOpen = () => opened.resolve();
	const onClose = () => {
		retire();
		opened.reject(new Error('Private CDP connection closed'));
		ended.resolve();
	};
	const onError = () => {
		retire();
		opened.reject(new Error('Private CDP transport failed'));
		try {
			socket.close();
		} catch {
			eventErrors++;
		}
	};
	/** @param {any} message */
	const deliverEvent = (message) => {
		if (message.sessionId) {
			const session = sessions.get(message.sessionId);
			if (!session?.onEvent) return;
			try {
				session.onEvent(message.method, message.params ?? {});
			} catch {
				session.errors++;
			}
			return;
		}
		for (const listener of listeners.get(message.method) ?? []) {
			try {
				listener(message.params ?? {});
			} catch {
				eventErrors++;
			}
		}
	};
	/** @param {MessageEvent} event */
	const onMessage = (event) => {
		let message;
		try {
			message = JSON.parse(event.data);
		} catch {
			onError();
			return;
		}
		if (!message || typeof message !== 'object') {
			onError();
			return;
		}
		if (typeof message.id === 'number') {
			const waiter = pending.get(message.id);
			if (!waiter) return;
			pending.delete(message.id);
			if (message.sessionId !== waiter.sessionId)
				waiter.reject(new Error('Private CDP response identity mismatch'));
			else if (message.error) waiter.reject(new Error('Private CDP request refused'));
			else waiter.resolve(message.result);
			return;
		}
		if (message.method === 'Target.detachedFromTarget') {
			if (typeof message.params?.sessionId !== 'string') {
				onError();
				return;
			}
			retireSession(message.params.sessionId);
		}
		deliverEvent(message);
	};
	socket.addEventListener('open', onOpen);
	socket.addEventListener('close', onClose);
	socket.addEventListener('error', onError);
	socket.addEventListener('message', onMessage);
	const removeListeners = () => {
		socket.removeEventListener('open', onOpen);
		socket.removeEventListener('close', onClose);
		socket.removeEventListener('error', onError);
		socket.removeEventListener('message', onMessage);
	};
	const close = async () => {
		retire();
		try {
			if (socket.readyState !== global.WebSocket.CLOSED) socket.close();
			else ended.resolve();
			await cdpDeadline(ended.promise, 'Private CDP socket retirement deadline exceeded');
		} catch {
			throw new Error('Private CDP socket retirement failed');
		} finally {
			if (socket.readyState === global.WebSocket.CLOSED) removeListeners();
			else socket.addEventListener('close', removeListeners, { once: true });
		}
	};
	try {
		await cdpDeadline(opened.promise, 'Private CDP connection deadline exceeded');
	} catch {
		try {
			await close();
		} catch {
			throw new AggregateError(
				[
					new Error('Private CDP connection unavailable'),
					new Error('Private CDP socket retirement failed')
				],
				'Private CDP connection and retirement failed'
			);
		}
		throw new Error('Private CDP connection unavailable');
	}
	/** @param {string} method @param {object} [params] @param {string} [sessionId] */
	const send = async (method, params = {}, sessionId) => {
		if (closed || socket.readyState !== global.WebSocket.OPEN)
			throw new Error('Private CDP transport unavailable');
		if (sessionId && sessions.get(sessionId)?.closed !== false)
			throw new Error('Private CDP target unavailable');
		const id = ++nextId;
		const waiter = Promise.withResolvers();
		void waiter.promise.catch(() => undefined);
		pending.set(id, { ...waiter, sessionId });
		try {
			socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
		} catch {
			waiter.reject(new Error('Private CDP request unavailable'));
		}
		try {
			return await cdpDeadline(waiter.promise, 'Private CDP request deadline exceeded');
		} finally {
			pending.delete(id);
			waiter.reject(new Error('Private CDP request retired'));
		}
	};
	return {
		send,
		get eventErrors() {
			return eventErrors;
		},
		on(method, listener) {
			const handlers = listeners.get(method) ?? new Set();
			handlers.add(listener);
			listeners.set(method, handlers);
		},
		off(method, listener) {
			listeners.get(method)?.delete(listener);
		},
		session(sessionId, onEvent) {
			if (closed || sessions.has(sessionId))
				throw new Error('Private CDP session adoption refused');
			const state = { closed: false, errors: 0, onEvent };
			sessions.set(sessionId, state);
			return {
				sessionId,
				get eventErrors() {
					return state.errors;
				},
				send: (method, params) => send(method, params, sessionId),
				async detach() {
					if (state.closed) return;
					try {
						await send('Target.detachFromTarget', { sessionId });
					} finally {
						retireSession(sessionId);
					}
				}
			};
		},
		close
	};
}

/**
 * Retire native observation state without closing any target lacking canonical-request ownership.
 * @param {BrowserCdpController} root
 * @param {Map<string, CdpTargetSession>} sessions
 * @param {Set<Promise<void>>} jobs
 * @param {Set<string>} paused
 * @param {string | undefined} targetId
 * @param {boolean} targetLost
 * @param {boolean} autoAttachStarted
 */
export async function retireBrowserTargets(
	root,
	sessions,
	jobs,
	paused,
	targetId,
	targetLost,
	autoAttachStarted
) {
	const errors = [];
	if (autoAttachStarted) {
		// Stop creating paused targets without detaching sessions that still need resuming.
		await root
			.send('Target.setAutoAttach', {
				autoAttach: true,
				waitForDebuggerOnStart: false,
				flatten: true,
				filter: [{ type: 'page', exclude: false }, { exclude: true }]
			})
			.catch(() => errors.push('target pause gate'));
	}
	while (jobs.size) await Promise.allSettled([...jobs]);
	for (const session of sessions.values()) {
		if (!paused.has(session.sessionId)) continue;
		await session
			.send('Runtime.runIfWaitingForDebugger')
			.then(() => paused.delete(session.sessionId))
			.catch(() => errors.push('target resume'));
	}
	// Disabling flat autoattachment emits detach events consumed by the RPC owner.
	await root
		.send('Target.setAutoAttach', {
			autoAttach: false,
			waitForDebuggerOnStart: false,
			flatten: true
		})
		.catch(() => errors.push('target auto-attachment'));
	while (jobs.size) await Promise.allSettled([...jobs]);
	for (const session of sessions.values())
		await session.detach().catch(() => errors.push('target detach'));
	sessions.clear();
	paused.clear();
	if (targetId) {
		const closed = await root
			.send('Target.closeTarget', { targetId })
			.catch(() => ({ success: false }));
		if (!closed.success && !targetLost) errors.push('target close');
	}
	await root
		.send('Target.setDiscoverTargets', { discover: false })
		.catch(() => errors.push('target discovery'));
	return errors;
}
