/** @template T @param {Promise<T>} work @param {string} label @param {number} [timeout] */
export function cdpDeadline(work, label, timeout = 3_000) {
	const gate = Promise.withResolvers();
	const timer = setTimeout(() => gate.reject(new Error(label)), timeout);
	return Promise.race([work, gate.promise]).finally(() => clearTimeout(timer));
}

/**
 * @param {import('@playwright/test').CDPSession} root
 * @param {string} targetId
 * @param {{ timeout?: number, onEvent?: (method: string, params: any) => void }} [options]
 */
export async function attachCdpTarget(root, targetId, options = {}) {
	const timeout = options.timeout ?? 3_000;
	const { sessionId } = await cdpDeadline(
		root.send('Target.attachToTarget', {
			targetId,
			flatten: false
		}),
		'attach-timeout',
		timeout
	);
	let nextId = 1;
	let eventErrors = 0;
	/** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
	const pending = new Map();
	/** @param {{sessionId: string, message: string}} event */
	const onMessage = (event) => {
		if (event.sessionId !== sessionId) return;
		let message;
		try {
			message = JSON.parse(event.message);
		} catch {
			return;
		}
		if (typeof message?.id === 'number') {
			const waiter = pending.get(message.id);
			if (!waiter) return;
			pending.delete(message.id);
			if (message.error) waiter.reject(new Error('rpc-error'));
			else waiter.resolve(message.result);
		} else if (typeof message?.method === 'string') {
			try {
				options.onEvent?.(message.method, message.params ?? {});
			} catch {
				eventErrors++;
			}
		}
	};
	root.on('Target.receivedMessageFromTarget', onMessage);
	return {
		sessionId,
		get eventErrors() {
			return eventErrors;
		},
		/** @param {string} method @param {object} [params] */
		async send(method, params = {}) {
			const id = nextId++;
			const waiter = Promise.withResolvers();
			pending.set(id, waiter);
			try {
				return await cdpDeadline(
					(async () => {
						await root.send('Target.sendMessageToTarget', {
							sessionId,
							message: JSON.stringify({ id, method, params })
						});
						return waiter.promise;
					})(),
					'rpc-timeout',
					timeout
				);
			} finally {
				pending.delete(id);
			}
		},
		async detach() {
			root.off('Target.receivedMessageFromTarget', onMessage);
			pending.clear();
			await cdpDeadline(
				root.send('Target.detachFromTarget', { sessionId }),
				'detach-timeout',
				timeout
			);
		}
	};
}
