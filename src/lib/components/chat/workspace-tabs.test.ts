import { describe, expect, it } from 'vitest';
import { file } from '../../../../test/ocu-workspace-fixtures';
import { pruneTabs, tabAfterClose, withTab } from './workspace-tabs';

describe('workspace file tabs', () => {
	it('appends a newly opened file and keeps the list when it is already open', () => {
		const open = ['a', 'b'];
		expect(withTab(open, 'c')).toEqual(['a', 'b', 'c']);
		expect(open).toEqual(['a', 'b']);
		expect(withTab(open, 'a')).toBe(open);
		expect(withTab([], 'a')).toEqual(['a']);
	});

	it('drops tabs whose file left the listing and keeps the opening order', () => {
		const open = ['c', 'a', 'b'];
		expect(pruneTabs(open, [file('a'), file('b')])).toEqual(['a', 'b']);
		expect(pruneTabs(open, [])).toEqual([]);
		expect(open).toEqual(['c', 'a', 'b']);
	});

	it('returns the same list when every tab is still listed', () => {
		const open = ['b', 'a'];
		expect(pruneTabs(open, [file('a'), file('b'), file('c')])).toBe(open);
	});

	it('activates the right neighbour, else the left one, else nothing after a close', () => {
		expect(tabAfterClose(['a', 'b', 'c'], 'b')).toBe('c');
		expect(tabAfterClose(['a', 'b', 'c'], 'a')).toBe('b');
		expect(tabAfterClose(['a', 'b', 'c'], 'c')).toBe('b');
		expect(tabAfterClose(['a'], 'a')).toBeUndefined();
		expect(tabAfterClose(['a', 'b'], 'x')).toBeUndefined();
		expect(tabAfterClose([], 'x')).toBeUndefined();
	});
});
