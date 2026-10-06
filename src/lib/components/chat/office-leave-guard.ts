import { onMount } from 'svelte';
import type { BeforeNavigate } from '@sveltejs/kit';
import { get, writable } from 'svelte/store';
import { toast } from 'svelte-sonner';
import {
	chatId as activeChat,
	config,
	showControls,
	showArtifacts,
	showEmbeds,
	showCallOverlay
} from '$lib/stores';
import { ocuWorkspaces, type OcuWorkspaceState } from '$lib/stores/ocu';
import { ocuOffice, type OcuOfficeState } from '$lib/stores/ocu-office';
import { WorkspaceRequestError, workspaceFilesEnabled } from '$lib/apis/ocu';
import {
	getOfficeSessionStatus,
	listOfficeVersions,
	type OfficeSessionStatus
} from '$lib/apis/ocu/office';
import { officeEditorFrame, type OfficeEditorController } from './office-editor-frame';
import { isSavedChatId } from '$lib/utils/chatId';

export const OFFICE_LEAVE_BUDGET = 15_000;
const POLL_DELAY = 1000;
const FOLLOWED_STATES: Record<string, true> = {
	opening: true,
	editing: true,
	saving: true,
	closing: true,
	closed: true,
	conflict: true,
	error: true,
	orphaned: true
};
type Translate = (key: string, values?: Record<string, string>) => string;
export type OfficeCloseReport = {
	chat: string;
	file: string;
	name: string;
	generation: number;
	outcome: 'saving' | 'saved' | 'saved_as' | 'conflict' | 'failed' | 'unconfirmed';
	reason?: string;
	path?: string;
};
export type OfficeLeaveSnapshot = {
	holding: Record<string, boolean>;
	reports: Record<string, OfficeCloseReport>;
};
type Attachment = {
	node: HTMLIFrameElement;
	editor: OfficeEditorController;
	chat: string;
	file: string;
	name: string;
	generation: number;
	workspace?: OcuWorkspaceState;
	closeSent?: boolean;
	session?: string;
	priorSessions?: Record<string, true>;
	retire: () => void;
	translate: Translate;
};
type DepartureAuthority = {
	owner: Attachment;
	identity: Pick<OfficeCloseReport, 'chat' | 'file' | 'name' | 'generation'>;
	uncertainAcceptance?: boolean;
};
type Operation = {
	owner: Attachment;
	authority: DepartureAuthority;
	source?: OcuWorkspaceState;
	panelGone: boolean;
	session: string;
	deadline: number;
	accepted: boolean;
	finished: boolean;
	reason?: string;
	continuation?: () => void;
	cancel?: () => void;
	poll?: ReturnType<typeof setTimeout>;
	timeout?: ReturnType<typeof setTimeout>;
};
type NotificationId = string | number;
type Notification = (
	report: OfficeCloseReport,
	translate: Translate,
	id?: NotificationId
) => NotificationId | void;

export function officeCloseText(report: OfficeCloseReport, t: Translate) {
	const values = { name: report.name, reason: report.reason ?? '' };
	switch (report.outcome) {
		case 'saving':
			return t('Saving Office changes: {{name}}', values);
		case 'saved':
			return t('Office changes saved: {{name}}', values);
		case 'saved_as':
			return t('Office changes saved as a new file: {{name}}', {
				name: report.path?.split('/').pop() ?? ''
			});
		case 'conflict':
			return t('Office conflict waiting; open {{name}} to resolve it', values);
		case 'failed':
			return t('Office save failed for {{name}}: {{reason}}', values);
		case 'unconfirmed':
			return t('Office save unconfirmed: {{name}}', values);
	}
}

export function createOfficeLeaveGuard(
	notify: Notification = (report, t, id) => {
		return toast.message(officeCloseText(report, t), {
			id,
			duration: report.outcome === 'saving' ? Infinity : 6000
		});
	}
) {
	const snapshot = writable<OfficeLeaveSnapshot>({ holding: {}, reports: {} });
	const attachments = new Map<string, Attachment>();
	const latest = new Map<string, Attachment>();
	const operations = new Map<string, Operation>();
	const inFlight = new Map<string, Operation>();
	const reports: Record<string, OfficeCloseReport> = {};
	let subscriptions: Array<() => void> = [];
	let shellCount = 0;
	let prompting = false;
	let shown: OfficeCloseReport | undefined;
	let notificationId: NotificationId | undefined;
	let observing = false;
	const key = (chat: string, session: string) => JSON.stringify([chat, session]);
	const currentChat = () => get(activeChat) || (shellCount ? '' : attachments.keys().next().value);
	const mounted = (owner: Attachment) =>
		owner.node.isConnected &&
		owner.editor.admits(owner.generation) &&
		attachments.get(owner.chat) === owner;
	const holding = (chat: string) =>
		[...operations.values()].some(
			(op) =>
				op.authority.owner.chat === chat &&
				!op.accepted &&
				!op.finished &&
				mounted(op.authority.owner)
		);
	const prompt = (event: BeforeUnloadEvent) => {
		event.preventDefault();
		event.returnValue = '';
	};
	function syncPrompt() {
		const owner = attachments.get(currentChat() ?? '');
		const state = owner && get(ocuOffice)[owner.chat];
		const eligible =
			!!owner && mounted(owner) && state?.dirty === true && state.state !== 'refused';
		if (eligible === prompting) return;
		prompting = eligible;
		if (eligible) window.addEventListener('beforeunload', prompt);
		else window.removeEventListener('beforeunload', prompt);
	}
	function hideNotification() {
		if (notificationId !== undefined) toast.dismiss(notificationId);
		notificationId = undefined;
		shown = undefined;
	}
	function presentReport(report: OfficeCloseReport | undefined) {
		if (shown === report) return;
		if (shown?.chat !== report?.chat || shown?.generation !== report?.generation) {
			hideNotification();
		}
		shown = report;
		if (!report) return;
		const id = notify(report, latest.get(report.chat)!.translate, notificationId);
		notificationId = typeof id === 'string' || typeof id === 'number' ? id : undefined;
	}
	function retainedWorkspace(
		chat: string,
		workspace: OcuWorkspaceState,
		state: OfficeLeaveSnapshot
	): OcuWorkspaceState;
	function retainedWorkspace(
		chat: string,
		workspace: OcuWorkspaceState | undefined,
		state: OfficeLeaveSnapshot
	): OcuWorkspaceState | undefined;
	function retainedWorkspace(
		chat: string,
		workspace: OcuWorkspaceState | undefined,
		state: OfficeLeaveSnapshot
	) {
		return state.holding[chat] ? (attachments.get(chat)?.workspace ?? workspace) : workspace;
	}
	function cancelOwnerIntentions(owner: Attachment | undefined) {
		for (const op of operations.values()) {
			if (op.authority.owner !== owner || op.accepted) continue;
			op.cancel?.();
			op.continuation = undefined;
			op.cancel = undefined;
		}
	}
	function publish() {
		const held: Record<string, boolean> = {};
		for (const chat of attachments.keys()) if (holding(chat)) held[chat] = true;
		snapshot.set({ holding: held, reports: { ...reports } });
		presentReport(reports[currentChat() ?? '']);
		syncPrompt();
	}
	function report(
		op: Operation,
		outcome: OfficeCloseReport['outcome'],
		status?: OfficeSessionStatus
	) {
		const { owner, identity } = op.authority;
		if (latest.get(owner.chat) !== owner) return;
		reports[owner.chat] = {
			...identity,
			name:
				outcome === 'conflict' && status?.saved_as
					? status.saved_as.path.split('/').pop() || identity.name
					: identity.name,
			outcome,
			reason: status?.reason ?? op.reason,
			path: status?.saved_as?.path
		};
	}
	function release(op: Operation) {
		if (op.accepted) return;
		op.accepted = true;
		const continuation = op.continuation;
		op.continuation = undefined;
		op.cancel = undefined;
		if (mounted(op.authority.owner)) op.authority.owner.retire();
		publish();
		continuation?.();
	}
	function finish(
		op: Operation,
		outcome: OfficeCloseReport['outcome'],
		status?: OfficeSessionStatus
	) {
		if (op.finished) return;
		op.finished = true;
		clearTimeout(op.poll);
		clearTimeout(op.timeout);
		report(op, outcome, status);
		// Expiry releases only the currently authorized intention, never a late read.
		release(op);
		operations.delete(key(op.owner.chat, op.session));
		publish();
		stopWatching();
	}
	const authorized = (op: Operation) => !op.finished && Date.now() < op.deadline;
	function validSessionStatus(op: Operation, status: OfficeSessionStatus) {
		return status.session_id === op.session && Object.hasOwn(FOLLOWED_STATES, status.state);
	}
	function closedOutcome(file: string, status: OfficeSessionStatus): OfficeCloseReport['outcome'] {
		const published =
			Number.isSafeInteger(status.save_seq) &&
			status.save_seq >= 1 &&
			status.last_committed_seq >= status.save_seq &&
			status.last_published_seq >= status.save_seq;
		if (!published) return 'unconfirmed';
		if (status.saved_as) return 'saved_as';
		return status.file_id === file ? 'saved' : 'unconfirmed';
	}
	async function followConflict(
		op: Operation,
		authority: DepartureAuthority,
		status: OfficeSessionStatus
	) {
		const versions = await listOfficeVersions('/ocu', op.owner.chat, status.file_id);
		if (!authorized(op) || authority !== op.authority) return;
		if (versions.open_session?.session_id === op.session && versions.open_session.editor_ended) {
			finish(op, 'conflict', status);
		}
	}
	function handleSessionStatus(
		op: Operation,
		authority: DepartureAuthority,
		status: OfficeSessionStatus
	) {
		switch (status.state) {
			case 'conflict':
				return followConflict(op, authority, status);
			case 'error':
			case 'orphaned':
				finish(op, 'failed', status);
				break;
			case 'closed':
				finish(op, closedOutcome(authority.identity.file, status), status);
				break;
			case 'closing':
				release(op);
				break;
		}
	}
	async function poll(op: Operation) {
		if (!authorized(op)) return;
		const sessionKey = key(op.owner.chat, op.session);
		if (inFlight.has(sessionKey)) {
			op.poll = setTimeout(() => void poll(op), POLL_DELAY);
			return;
		}
		inFlight.set(sessionKey, op);
		const authority = op.authority;
		try {
			const status = await getOfficeSessionStatus('/ocu', op.owner.chat, op.session);
			if (authorized(op) && authority === op.authority) {
				if (!validSessionStatus(op, status)) op.reason = 'invalid_response';
				// Shared-session snapshots cannot establish replacement-frame delivery or publication.
				else if (!authority.uncertainAcceptance) {
					const pending = handleSessionStatus(op, authority, status);
					if (pending) await pending;
				}
			}
		} catch (failure) {
			if (authorized(op) && authority === op.authority) {
				op.reason = failure instanceof WorkspaceRequestError ? failure.reason : 'request_failed';
			}
		} finally {
			if (inFlight.get(sessionKey) === op) inFlight.delete(sessionKey);
		}
		if (authorized(op)) op.poll = setTimeout(() => void poll(op), POLL_DELAY);
	}
	function postCloseOnce(owner: Attachment) {
		if (owner.closeSent || !owner.node.isConnected) return;
		owner.closeSent = true;
		owner.editor.close();
	}
	function workspacePanelHidden() {
		return (
			shellCount > 0 &&
			(!get(showControls) || get(showArtifacts) || get(showEmbeds) || get(showCallOverlay))
		);
	}
	function joinDeparture(
		op: Operation,
		owner: Attachment,
		continuation?: () => void,
		cancel?: () => void
	) {
		const replacement = op.authority.owner !== owner;
		if (replacement) {
			op.cancel?.();
			op.continuation = undefined;
			op.cancel = undefined;
			op.authority = {
				owner,
				uncertainAcceptance: true,
				identity: {
					chat: owner.chat,
					file: owner.file,
					name: owner.name,
					generation: owner.generation
				}
			};
			op.accepted = false;
			op.source = get(ocuWorkspaces)[owner.chat];
			op.deadline = Date.now() + OFFICE_LEAVE_BUDGET;
			clearTimeout(op.timeout);
			op.timeout = setTimeout(() => finish(op, 'unconfirmed'), OFFICE_LEAVE_BUDGET);
		}
		if (continuation) {
			op.cancel?.();
			op.continuation = continuation;
			op.cancel = cancel;
		}
		if (replacement) {
			report(op, 'saving');
			postCloseOnce(owner);
			publish();
		}
		if (op.accepted) {
			const run = op.continuation;
			op.continuation = undefined;
			op.cancel = undefined;
			owner.retire();
			run?.();
		}
	}
	function startDeparture(
		owner: Attachment,
		session: string,
		continuation?: () => void,
		cancel?: () => void
	) {
		owner.session = session;
		const op: Operation = {
			owner,
			authority: {
				owner,
				uncertainAcceptance:
					owner.priorSessions?.[session] === true ||
					get(ocuOffice)[owner.chat]?.state === 'closing',
				identity: {
					chat: owner.chat,
					file: owner.file,
					name: owner.name,
					generation: owner.generation
				}
			},
			source: get(ocuWorkspaces)[owner.chat],
			panelGone: workspacePanelHidden(),
			session,
			deadline: Date.now() + OFFICE_LEAVE_BUDGET,
			accepted: false,
			finished: false,
			continuation,
			cancel
		};
		operations.set(key(owner.chat, session), op);
		report(op, 'saving');
		op.timeout = setTimeout(() => finish(op, 'unconfirmed'), OFFICE_LEAVE_BUDGET);
		postCloseOnce(owner);
		publish();
		void poll(op);
	}
	function depart(chat: string, continuation?: () => void, cancel?: () => void, forced = false) {
		const owner = attachments.get(chat);
		const state = get(ocuOffice)[chat];
		if (
			!owner ||
			!(forced ? owner.editor.admits(owner.generation) : mounted(owner)) ||
			state?.state === 'refused' ||
			!state?.sessionId
		) {
			if (owner) owner.retire();
			continuation?.();
			return;
		}
		const op = operations.get(key(chat, state.sessionId));
		if (op) joinDeparture(op, owner, continuation, cancel);
		else startDeparture(owner, state.sessionId, continuation, cancel);
	}
	function pendingDeparture(owner: Attachment) {
		for (const op of operations.values()) {
			if (op.authority.owner === owner && !op.accepted) return op;
		}
	}
	function synchronizeIntention(
		op: Operation,
		workspace: OcuWorkspaceState | undefined,
		panelGone: boolean
	) {
		if (
			op.source?.selectedFileId === workspace?.selectedFileId &&
			op.source?.view === workspace?.view &&
			op.source?.open === workspace?.open &&
			op.panelGone === panelGone
		)
			return;
		op.cancel?.();
		op.continuation = undefined;
		op.cancel = undefined;
		op.source = workspace;
		op.panelGone = panelGone;
	}
	function workspaceDepartureRequested(
		owner: Attachment,
		workspace: OcuWorkspaceState | undefined,
		panelGone: boolean
	) {
		return (
			!!workspace &&
			(workspace.view !== 'files' ||
				workspace.selectedFileId !== owner.file ||
				!workspace.files.some((file) => file.file_id === owner.file) ||
				!workspace.open ||
				panelGone)
		);
	}
	function observeAttachment(owner: Attachment) {
		if (!mounted(owner)) return;
		owner.session = get(ocuOffice)[owner.chat]?.sessionId ?? owner.session;
		const workspace = get(ocuWorkspaces)[owner.chat];
		const panelGone = workspacePanelHidden();
		const op = pendingDeparture(owner);
		if (op) synchronizeIntention(op, workspace, panelGone);
		if (workspaceDepartureRequested(owner, workspace, panelGone)) depart(owner.chat);
		else if (!holding(owner.chat)) owner.workspace = workspace;
	}
	function observe() {
		if (observing) return;
		observing = true;
		for (const owner of attachments.values()) observeAttachment(owner);
		observing = false;
		publish();
	}
	function watch() {
		if (subscriptions.length) return;
		subscriptions = [
			ocuOffice,
			ocuWorkspaces,
			activeChat,
			showControls,
			showArtifacts,
			showEmbeds,
			showCallOverlay
		].map((store) => store.subscribe(observe));
	}
	function stopWatching() {
		if (shellCount || attachments.size || operations.size) return;
		for (const unsubscribe of subscriptions) unsubscribe();
		subscriptions = [];
		if (prompting) window.removeEventListener('beforeunload', prompt);
		prompting = false;
	}
	return {
		snapshot,
		depart,
		mount() {
			shellCount++;
			watch();
			return () => {
				shellCount = Math.max(0, shellCount - 1);
				if (!shellCount) hideNotification();
				stopWatching();
			};
		},
		attach(
			node: HTMLIFrameElement,
			options: Omit<Attachment, 'node' | 'generation' | 'workspace'>
		) {
			const owner: Attachment = {
				...options,
				node,
				generation: get(ocuOffice)[options.chat].generation,
				workspace: get(ocuWorkspaces)[options.chat],
				priorSessions: {}
			};
			const previousSession = latest.get(owner.chat)?.session;
			if (previousSession) owner.priorSessions![previousSession] = true;
			attachments.set(owner.chat, owner);
			for (const op of operations.values()) {
				if (op.owner.chat !== owner.chat) continue;
				owner.priorSessions![op.session] = true;
				op.cancel?.();
				op.continuation = undefined;
				op.cancel = undefined;
			}
			for (const op of inFlight.values()) {
				if (op.owner.chat === owner.chat) owner.priorSessions![op.session] = true;
			}
			latest.set(owner.chat, owner);
			delete reports[owner.chat];
			watch();
			publish();
			return () => {
				if (attachments.get(owner.chat) !== owner) return;
				depart(owner.chat, undefined, undefined, true);
				cancelOwnerIntentions(owner);
				attachments.delete(owner.chat);
				publish();
				stopWatching();
			};
		},
		synchronize(
			node: HTMLIFrameElement,
			options: {
				chat: string;
				name: string;
				available: boolean;
				state?: OcuOfficeState['state'];
				retire: () => void;
			}
		) {
			const owner = attachments.get(options.chat);
			if (!owner || owner.node !== node) return;
			if (!holding(owner.chat)) owner.name = options.name;
			if (!options.available) {
				depart(owner.chat, undefined, undefined, true);
				options.retire();
			} else if (
				options.state === 'refused' ||
				(options.state === 'closed' && !holding(owner.chat))
			)
				options.retire();
		},
		close(chat: string, forced = false) {
			const owner = attachments.get(chat);
			cancelOwnerIntentions(owner);
			depart(chat, undefined, undefined, forced);
		},
		workspace: retainedWorkspace,
		panelRetained(chat: string | null, state: OfficeLeaveSnapshot) {
			const owner = attachments.get(chat ?? '');
			const session = owner && get(ocuOffice)[owner.chat];
			// Keep visibility stable even if its store subscriber runs before the departure observer.
			return (
				!!state.holding[chat ?? ''] ||
				(!!owner && mounted(owner) && !!session?.sessionId && session.state !== 'refused')
			);
		},
		action<T extends unknown[], R>(
			chat: (...args: NoInfer<T>) => string | null,
			run: (...args: T) => R,
			shouldLeave: (...args: NoInfer<T>) => boolean = () => true
		) {
			return (...args: T): Promise<Awaited<R> | undefined> => {
				const { promise, resolve, reject } = Promise.withResolvers<Awaited<R> | undefined>();
				const ownerChat = chat(...args) ?? '';
				const continuation = () => {
					try {
						Promise.resolve(run(...args)).then(resolve, reject);
					} catch (failure) {
						reject(failure);
					}
				};
				if (shouldLeave(...args) || holding(ownerChat))
					depart(ownerChat, continuation, () => resolve(undefined));
				else continuation();
				return promise;
			};
		},
		dispose() {
			for (const op of operations.values()) {
				clearTimeout(op.poll);
				clearTimeout(op.timeout);
				op.finished = true;
				op.cancel?.();
			}
			operations.clear();
			attachments.clear();
			latest.clear();
			inFlight.clear();
			for (const chat of Object.keys(reports)) delete reports[chat];
			shellCount = 0;
			for (const unsubscribe of subscriptions) unsubscribe();
			subscriptions = [];
			if (prompting) window.removeEventListener('beforeunload', prompt);
			prompting = false;
			hideNotification();
			snapshot.set({ holding: {}, reports: {} });
		}
	};
}

export const officeLeaveGuard = createOfficeLeaveGuard();
export const officeLeaveSnapshot = officeLeaveGuard.snapshot;
export const guardOfficeAction = officeLeaveGuard.action;
export const retainOfficeWorkspace = officeLeaveGuard.workspace;
export const retainOfficePanel = (
	visible: boolean,
	chat: string | null,
	state: OfficeLeaveSnapshot
) => visible || !!state.holding[chat ?? ''];
export const allowOfficeSiblingPanel = (
	visible: boolean,
	chat: string | null,
	state: OfficeLeaveSnapshot
) => visible && !state.holding[chat ?? ''];
export function mountOfficeLeaveGuard() {
	onMount(() => officeLeaveGuard.mount());
}
export const closeOfficeEditor = officeLeaveGuard.close;

export function officeFileAdmitted(
	targetChat: string,
	file: string,
	currentChat: string,
	enabled: boolean
) {
	const workspace = get(ocuWorkspaces)[targetChat];
	const flags = get(config);
	return (
		enabled &&
		targetChat === currentChat &&
		isSavedChatId(targetChat) &&
		targetChat !== 'default' &&
		workspace?.view === 'files' &&
		workspace.selectedFileId === file &&
		workspace.files.some((item) => item.file_id === file) &&
		workspace.baseUrl === '/ocu' &&
		workspaceFilesEnabled(flags) &&
		!!flags?.features &&
		'enable_ocu_office_edit' in flags.features &&
		flags.features.enable_ocu_office_edit === true
	);
}

export function officeLeaveFrame(
	node: HTMLIFrameElement,
	options: {
		editor: OfficeEditorController;
		chat: string;
		file: string;
		name: string;
		retire: () => void;
		translate: Translate;
		available: boolean;
		state?: OcuOfficeState['state'];
	}
) {
	const frame = officeEditorFrame(node, options.editor);
	const generation = get(ocuOffice)[options.chat].generation;
	const retire = () => {
		if (get(ocuOffice)[options.chat]?.generation === generation) options.retire();
	};
	const detach = officeLeaveGuard.attach(node, { ...options, retire });
	return {
		update(next: typeof options) {
			officeLeaveGuard.synchronize(node, { ...next, retire });
		},
		destroy() {
			detach();
			frame.destroy();
		}
	};
}

type OfficeNavigation = Pick<BeforeNavigate, 'willUnload' | 'cancel'> & {
	to: { url: URL } | null;
	from?: { url: URL } | null;
	type?: BeforeNavigate['type'];
	delta?: number;
	event?: Event;
};
type OfficePopstate = OfficeNavigation & { type: 'popstate'; delta: number };

function isPopstate(navigation: OfficeNavigation): navigation is OfficePopstate {
	return navigation.type === 'popstate' && navigation.delta !== undefined;
}

export function registerOfficeNavigation(
	register: (callback: (navigation: OfficeNavigation) => void) => void,
	navigate: (url: string) => Promise<void>
) {
	let admitted: OfficeNavigation | undefined;
	let cancelPending: (() => void) | undefined;
	let disposed = false;
	register((navigation) => {
		if (disposed) return;
		const target = navigation.to?.url.href;
		if (
			target &&
			admitted?.to?.url.href === target &&
			admitted.type === navigation.type &&
			admitted.delta === navigation.delta
		) {
			admitted = undefined;
			return;
		}
		cancelPending?.();
		admitted = undefined;
		if (navigation.willUnload || !target) return;
		const chat = get(activeChat);
		const state = get(officeLeaveSnapshot);
		const editor = get(ocuOffice)[chat];
		if (!editor?.sessionId || editor.state === 'refused') return;
		const traversal = isPopstate(navigation);
		const origin = navigation.from?.url.href;
		// Kit stores the entry index in popstate state; equal URLs need not be equal entries.
		const index = (navigation.event as PopStateEvent | undefined)?.state?.['sveltekit:history'];
		const originIndex = typeof index === 'number' ? index - (navigation.delta ?? 0) : undefined;
		let active = true;
		let accepted = false;
		let rolledBack = !traversal;
		const cancel = () => {
			active = false;
			window.removeEventListener('popstate', onRollback);
			if (cancelPending === cancel) cancelPending = undefined;
		};
		const replay = () => {
			if (!active || !accepted || !rolledBack) return;
			cancel();
			admitted = navigation;
			if (traversal) window.history.go(navigation.delta);
			else void navigate(target);
		};
		const onRollback = (event: PopStateEvent) => {
			if (event === navigation.event || window.location.href !== origin) return;
			if (originIndex !== undefined && event.state?.['sveltekit:history'] !== originIndex) return;
			rolledBack = true;
			window.removeEventListener('popstate', onRollback);
			// Let Kit consume its undo event before requesting the original traversal.
			queueMicrotask(replay);
		};
		cancelPending = cancel;
		if (traversal) window.addEventListener('popstate', onRollback);
		let synchronous = true;
		let immediate = false;
		officeLeaveGuard.depart(
			chat,
			() => {
				if (synchronous) immediate = true;
				else {
					accepted = true;
					replay();
				}
			},
			cancel
		);
		synchronous = false;
		if (!immediate || state.holding[chat]) navigation.cancel();
		else cancel();
	});
	return () => {
		disposed = true;
		cancelPending?.();
		admitted = undefined;
	};
}
