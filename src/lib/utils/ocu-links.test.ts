import { describe, expect, it } from 'vitest';

import { recogniseOcuLink } from './ocu-links';

describe('recogniseOcuLink', () => {
	it('matches a browser-absolute href against a path-only base by pathname', () => {
		expect(recogniseOcuLink('https://chat.example.com/ocu/files/C/report.html', '/ocu', 'C')).toBe(
			'report.html'
		);
		expect(recogniseOcuLink('https://evil.example/ocu/files/C/x.html', '/ocu', 'C')).toBe('x.html');
	});

	it('rejects a pathname outside a path-only base', () => {
		expect(recogniseOcuLink('https://evil.example/files/C/x.html', '/ocu', 'C')).toBeNull();
	});

	it('rejects a foreign host against an absolute base', () => {
		expect(
			recogniseOcuLink('https://evil.example/ocu/files/C/x.html', 'http://webui/ocu', 'C')
		).toBeNull();
	});

	it('rejects a different chat id', () => {
		expect(recogniseOcuLink('/ocu/files/other/report.html', '/ocu', 'C')).toBeNull();
		expect(
			recogniseOcuLink('http://webui/ocu/files/other/report.html', 'http://webui/ocu', 'C')
		).toBeNull();
	});

	it('returns the file path for a matching filter-generated link', () => {
		expect(recogniseOcuLink('/ocu/files/C/report.html', '/ocu', 'C')).toBe('report.html');
		expect(recogniseOcuLink('http://webui/ocu/files/C/report.html', 'http://webui/ocu', 'C')).toBe(
			'report.html'
		);
	});

	it('returns a nested file path', () => {
		expect(recogniseOcuLink('/ocu/files/C/dir/report.html', '/ocu', 'C')).toBe('dir/report.html');
	});

	it('rejects an empty rest or a missing files segment', () => {
		expect(recogniseOcuLink('/ocu/files/C/', '/ocu', 'C')).toBeNull();
		expect(recogniseOcuLink('/ocu/preview/C/report.html', '/ocu', 'C')).toBeNull();
	});
});
