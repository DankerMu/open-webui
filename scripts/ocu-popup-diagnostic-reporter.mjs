import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MARKER = 'Native popup fixture event missing: ';
const MAX_ERROR = 4000;
const MAX_LAST_DOCUMENT = 2000;

function secrets() {
	try {
		const parsed = JSON.parse(process.env.PLAYWRIGHT_OCU_POPUP_DIAGNOSTIC_SECRETS || '[]');
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : [];
	} catch {
		return [];
	}
}

function stripAnsi(text) {
	return text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g'), '');
}

function redact(text) {
	let out = text;
	for (const secret of secrets()) out = out.split(secret).join('[redacted]');
	return out;
}

function lastDocumentFrom(message) {
	if (!message.includes(MARKER)) return undefined;
	let payload = message.split(MARKER, 2)[1].trim();
	if (payload.startsWith('{')) {
		let depth = 0;
		for (let index = 0; index < payload.length; index++) {
			if (payload[index] === '{') depth++;
			else if (payload[index] === '}') {
				depth--;
				if (depth === 0) {
					payload = payload.slice(0, index + 1);
					break;
				}
			}
		}
	}
	if (payload.length > MAX_LAST_DOCUMENT) payload = `${payload.slice(0, MAX_LAST_DOCUMENT)}…`;
	return payload;
}

function sanitizeError(error) {
	const raw = typeof error?.message === 'string' ? error.message : '';
	if (!raw.trim()) return null;
	let message = redact(stripAnsi(raw));
	if (message.length > MAX_ERROR) message = `${message.slice(0, MAX_ERROR)}…`;
	const row = { message };
	const lastDocument = lastDocumentFrom(message);
	if (lastDocument !== undefined) row.lastDocument = lastDocument;
	return row;
}

export default class OcuPopupDiagnosticReporter {
	constructor(options = {}) {
		this.outputFile = options.outputFile || process.env.PLAYWRIGHT_OCU_POPUP_DIAGNOSTIC_REPORTER_OUTPUT;
		this.attempts = [];
	}

	printsToStdio() {
		return false;
	}

	flush(status = 'running') {
		if (!this.outputFile) throw new Error('diagnostic reporter requires outputFile');
		mkdirSync(dirname(this.outputFile), { recursive: true });
		writeFileSync(
			this.outputFile,
			`${JSON.stringify(
				{
					acceptance: 'nonacceptance',
					characterization: true,
					status,
					attempts: this.attempts
				},
				null,
				2
			)}\n`
		);
	}

	onTestEnd(test, result) {
		const errors = [];
		for (const item of result.errors ?? []) {
			const sanitized = sanitizeError(item);
			if (sanitized) errors.push(sanitized);
		}
		if (!errors.length) {
			const sanitized = sanitizeError(result.error);
			if (sanitized) errors.push(sanitized);
		}
		this.attempts.push({
			ordinal: this.attempts.length,
			title: test.title,
			repeatEachIndex: Number.isInteger(test.repeatEachIndex) ? test.repeatEachIndex : null,
			retry: result.retry ?? 0,
			status: result.status,
			durationMs: result.duration,
			errors
		});
		this.flush('running');
	}

	onEnd(result) {
		this.flush(result.status);
	}
}
