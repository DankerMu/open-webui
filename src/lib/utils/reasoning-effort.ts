import type { ChatParams } from '$lib/stores/chat-effort';

export type EffortChoice = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Vocabulary = { levels: EffortChoice[]; default?: EffortChoice };
// What the selector left behind on its previous run: the vocabulary and the params object it
// returned. A params object other than that one was replaced from outside (a chat load or reset).
export type EffortTransition = { vocabulary: Vocabulary | null; params: ChatParams };

// Measured on the acceptance instance: DeepSeek V4 accepts high/max (low erratic) and the
// disabled switch; Qwen3.8 accepts low..xhigh (max unrecognised) and the disabled switch.
const DEEPSEEK_V4: Vocabulary = { levels: ['off', 'high', 'max'], default: 'high' };
const QWEN38: Vocabulary = { levels: ['off', 'low', 'medium', 'high', 'xhigh'], default: 'medium' };
// qwen3.8-2.4t-a95b answers HTTP 400 "enable_thinking parameter is restricted to True" to Off.
const QWEN38_ALWAYS_THINKING: Vocabulary = {
	levels: ['low', 'medium', 'high', 'xhigh'],
	default: 'medium'
};
// No default: an unmeasured provider may reject any value, so nothing is sent until picked.
export const GENERIC: Vocabulary = { levels: ['low', 'medium', 'high', 'xhigh'] };

const KNOWN_LEVELS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function effortVocabulary(modelIds: string[]): Vocabulary | null | undefined {
	if (!modelIds.some((id) => id)) return undefined;
	if (modelIds.length > 1) return null;
	const id = modelIds[0].toLowerCase();
	if (id.endsWith('-cc')) return GENERIC;
	if (id === 'qwen3.8-2.4t-a95b') return QWEN38_ALWAYS_THINKING;
	if (id.startsWith('qwen3.8-')) return QWEN38;
	if (id === 'deepseek-flash-guan' || id.includes('deepseek-v4')) return DEEPSEEK_V4;
	return GENERIC;
}

const isDisabledSwitch = (thinking: unknown) =>
	typeof thinking === 'object' &&
	thinking !== null &&
	(thinking as { type?: unknown }).type === 'disabled';

export function currentChoice(params: ChatParams): EffortChoice | undefined {
	const effort = params.reasoning_effort;
	if (typeof effort === 'string' && effort !== '')
		return KNOWN_LEVELS.includes(effort) ? (effort as EffortChoice) : undefined;
	return isDisabledSwitch(params.thinking) ? 'off' : undefined;
}

function isEmpty(params: ChatParams): boolean {
	const effort = params.reasoning_effort;
	return (
		(effort === undefined || effort === null || effort === '') && !isDisabledSwitch(params.thinking)
	);
}

export function withChoice(params: ChatParams, choice: EffortChoice): ChatParams {
	if (choice === 'off') {
		const thinking = params.thinking as Record<string, unknown> | null | undefined;
		const settled =
			params.reasoning_effort === null &&
			isDisabledSwitch(thinking) &&
			Object.keys(thinking as object).length === 1;
		// null, not deletion: it cancels a value inherited from the user's global params.
		return settled ? params : { ...params, reasoning_effort: null, thinking: { type: 'disabled' } };
	}
	if (params.reasoning_effort === choice && params.thinking === null) return params;
	return { ...params, reasoning_effort: choice, thinking: null };
}

export function withoutChoice(params: ChatParams): ChatParams {
	if (!('reasoning_effort' in params) && !('thinking' in params)) return params;
	const rest = { ...params };
	delete rest.reasoning_effort;
	delete rest.thinking;
	return rest;
}

// Rule 3: a model switch within the chat that changes the vocabulary.
function afterSwitch(params: ChatParams, vocabulary: Vocabulary | null): ChatParams {
	if (!vocabulary?.default) return withoutChoice(params);
	const choice = currentChoice(params);
	if (choice === undefined && !isEmpty(params)) return params;
	return withChoice(
		params,
		choice && vocabulary.levels.includes(choice) ? choice : vocabulary.default
	);
}

export function reconciledParams(
	params: ChatParams,
	vocabulary: Vocabulary | null | undefined,
	previous: EffortTransition | undefined
): ChatParams {
	if (vocabulary === undefined) return params;
	const fallback = vocabulary?.default;

	// First run, chat load or reset: saved values stay; a family chat without one gets its default.
	if (!previous || previous.params !== params)
		return fallback && isEmpty(params) ? withChoice(params, fallback) : params;

	if (previous.vocabulary !== vocabulary) return afterSwitch(params, vocabulary);

	// Same vocabulary (a generic-to-generic switch or a Controls edit).
	const choice = currentChoice(params);
	if (fallback && (isEmpty(params) || (choice && !vocabulary!.levels.includes(choice))))
		return withChoice(params, fallback);
	return params;
}
