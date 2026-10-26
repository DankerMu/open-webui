import { describe, expect, it } from 'vitest';
import {
	GENERIC,
	currentChoice,
	effortVocabulary,
	reconciledParams,
	withChoice,
	withoutChoice,
	type EffortTransition,
	type Vocabulary
} from './reasoning-effort';
import type { ChatParams } from '$lib/stores/chat-effort';

const QWEN = effortVocabulary(['qwen3.8-27b']) as Vocabulary;
const QWEN_ALWAYS = effortVocabulary(['qwen3.8-2.4t-a95b']) as Vocabulary;
const DEEPSEEK = effortVocabulary(['deepseek-v4.1-flash-1017']) as Vocabulary;
const OFF = { reasoning_effort: null, thinking: { type: 'disabled' } };
const level = (value: string) => ({ reasoning_effort: value, thinking: null });

// One reconciliation step as the selector runs it: the transition records the params it left.
function step(
	params: ChatParams,
	vocabulary: Vocabulary | null | undefined,
	previous?: EffortTransition
) {
	const next = reconciledParams(params, vocabulary, previous);
	return { next, previous: vocabulary === undefined ? previous : { vocabulary, params: next } };
}

describe('effortVocabulary', () => {
	it('maps the measured families and falls back to the generic vocabulary', () => {
		expect(QWEN).toEqual({ levels: ['off', 'low', 'medium', 'high', 'xhigh'], default: 'medium' });
		expect(QWEN_ALWAYS).toEqual({ levels: ['low', 'medium', 'high', 'xhigh'], default: 'medium' });
		expect(DEEPSEEK).toEqual({ levels: ['off', 'high', 'max'], default: 'high' });
		expect(effortVocabulary(['deepseek-flash-guan'])).toBe(DEEPSEEK);
		expect(effortVocabulary(['DMXAPI-deepseek-v4-flash'])).toBe(DEEPSEEK);
		expect(effortVocabulary(['Qwen3.8-Flash'])).toBe(QWEN);
		expect(GENERIC).toEqual({ levels: ['low', 'medium', 'high', 'xhigh'] });
		expect(GENERIC.default).toBeUndefined();
	});

	it('treats -cc variants, unmeasured ids and unmatched ids as generic', () => {
		for (const id of [
			'qwen3.8-27b-cc',
			'deepseek-v4-pro-cc',
			'DMXAPI-ds-v4-p-0813',
			'gpt-4o',
			'qwen3-32b'
		])
			expect(effortVocabulary([id])).toBe(GENERIC);
	});

	it('is undefined without a model and null for several', () => {
		expect(effortVocabulary([])).toBeUndefined();
		expect(effortVocabulary([''])).toBeUndefined();
		expect(effortVocabulary(['qwen3.8-27b', 'gpt-4o'])).toBeNull();
	});
});

describe('currentChoice', () => {
	it('reads a known level, the disabled switch, or nothing', () => {
		expect(currentChoice({ reasoning_effort: 'xhigh' })).toBe('xhigh');
		expect(currentChoice({ reasoning_effort: 'max', thinking: null })).toBe('max');
		expect(currentChoice(OFF)).toBe('off');
		expect(currentChoice({})).toBeUndefined();
		expect(currentChoice({ reasoning_effort: '' })).toBeUndefined();
	});

	it('lets free text and a valid level win over a disabled switch', () => {
		expect(
			currentChoice({ reasoning_effort: 'minimal', thinking: { type: 'disabled' } })
		).toBeUndefined();
		expect(currentChoice({ reasoning_effort: 'low', thinking: { type: 'disabled' } })).toBe('low');
	});
});

describe('withChoice / withoutChoice', () => {
	it('maps Off and levels to the request shape and keeps other keys', () => {
		expect(withChoice({ temperature: 0.2, reasoning_effort: 'high' }, 'off')).toEqual({
			temperature: 0.2,
			...OFF
		});
		expect(withChoice({ temperature: 0.2, ...OFF }, 'high')).toEqual({
			temperature: 0.2,
			...level('high')
		});
	});

	it('returns the same reference when the shape is already in place', () => {
		const off = { ...OFF };
		const high = level('high');
		expect(withChoice(off, 'off')).toBe(off);
		expect(withChoice(high, 'high')).toBe(high);
		expect(withChoice({ reasoning_effort: 'high' }, 'high')).toEqual(level('high'));
	});

	it('deletes both keys, or returns the same reference when neither is present', () => {
		expect(withoutChoice({ temperature: 1, ...OFF })).toEqual({ temperature: 1 });
		expect(withoutChoice({ reasoning_effort: 'low' })).toEqual({});
		const plain = { temperature: 1 };
		expect(withoutChoice(plain)).toBe(plain);
	});
});

describe('reconciledParams', () => {
	it('first run writes the family default and leaves a generic chat alone', () => {
		expect(reconciledParams({}, QWEN, undefined)).toEqual(level('medium'));
		expect(reconciledParams({}, DEEPSEEK, undefined)).toEqual(level('high'));
		const empty = {};
		expect(reconciledParams(empty, GENERIC, undefined)).toBe(empty);
	});

	it('changes nothing while no model is resolved', () => {
		const empty = {};
		expect(reconciledParams(empty, undefined, undefined)).toBe(empty);
		expect(reconciledParams(empty, undefined, { vocabulary: QWEN, params: empty })).toBe(empty);
	});

	it('never clears a saved value when another chat loads', () => {
		const left = level('medium');
		const saved = level('xhigh');
		expect(reconciledParams(saved, GENERIC, { vocabulary: QWEN, params: left })).toBe(saved);
		const savedOff = { ...OFF };
		expect(reconciledParams(savedOff, QWEN, { vocabulary: GENERIC, params: left })).toBe(savedOff);
		const savedLow = level('low');
		expect(reconciledParams(savedLow, DEEPSEEK, { vocabulary: QWEN, params: left })).toBe(savedLow);
	});

	it('keeps a saved generic pick when the chat id lands before the loaded params and model', () => {
		// Chat.svelte loadChat: chatId first (before the fetch), then models and params together.
		let s = step(level('medium'), QWEN);
		s = step(s.next, QWEN, s.previous);
		s = step(level('xhigh'), GENERIC, s.previous);
		expect(s.next).toEqual(level('xhigh'));
		s = step(level('medium'), QWEN, s.previous);
		expect(s.next).toEqual(level('medium'));
	});

	it('clears a family default carried into a new generic chat', () => {
		// Chat.svelte initNewChat: params = {} lands under the old model, the new model later.
		let s = step(level('medium'), QWEN);
		s = step({}, QWEN, s.previous);
		expect(s.next).toEqual(level('medium'));
		s = step(s.next, GENERIC, s.previous);
		expect(s.next).toEqual({});
	});

	it('resolves model switches within a chat', () => {
		let s = step({}, QWEN);
		expect(s.next).toEqual(level('medium'));
		s = step(s.next, DEEPSEEK, s.previous);
		expect(s.next).toEqual(level('high'));
		s = step(withChoice(s.next, 'max'), DEEPSEEK, s.previous);
		expect(s.next).toEqual(level('max'));
		s = step(s.next, QWEN, s.previous);
		expect(s.next).toEqual(level('medium'));
		s = step(withChoice(s.next, 'off'), QWEN, s.previous);
		s = step(s.next, QWEN_ALWAYS, s.previous);
		expect(s.next).toEqual(level('medium'));
		s = step(s.next, GENERIC, s.previous);
		expect(s.next).toEqual({});
		s = step(withChoice(s.next, 'xhigh'), GENERIC, s.previous);
		s = step(s.next, effortVocabulary(['gpt-4o']), s.previous);
		expect(s.next).toEqual(level('xhigh'));
	});

	it('keeps an Off choice across members of the same family', () => {
		const off = { ...OFF };
		expect(
			reconciledParams(off, effortVocabulary(['qwen3.8-flash']), { vocabulary: QWEN, params: off })
		).toBe(off);
		expect(reconciledParams(off, DEEPSEEK, { vocabulary: QWEN, params: off })).toBe(off);
	});

	it('clears both keys on a switch to several models and then leaves typed values alone', () => {
		const medium = level('medium');
		expect(reconciledParams(medium, null, { vocabulary: QWEN, params: medium })).toEqual({});
		const typed = { reasoning_effort: 'low' };
		expect(reconciledParams(typed, null, { vocabulary: null, params: typed })).toBe(typed);
	});

	it('applies the family default after Controls clears the field or types an unsupported level', () => {
		const cleared = { reasoning_effort: null, thinking: null };
		expect(reconciledParams(cleared, QWEN, { vocabulary: QWEN, params: cleared })).toEqual(
			level('medium')
		);
		const low = { reasoning_effort: 'low', thinking: null };
		expect(reconciledParams(low, DEEPSEEK, { vocabulary: DEEPSEEK, params: low })).toEqual(
			level('high')
		);
		const max = { reasoning_effort: 'max' };
		expect(reconciledParams(max, GENERIC, { vocabulary: GENERIC, params: max })).toBe(max);
	});

	it('leaves free text alone on a family and on a switch to a family', () => {
		const text = { reasoning_effort: 'minimal' };
		expect(reconciledParams(text, QWEN, { vocabulary: QWEN, params: text })).toBe(text);
		expect(reconciledParams(text, DEEPSEEK, { vocabulary: GENERIC, params: text })).toBe(text);
	});

	it('settles: a reconciled result reconciles to itself', () => {
		let s = step({}, QWEN);
		const settled = s.next;
		s = step(settled, QWEN, s.previous);
		expect(s.next).toBe(settled);
	});
});
