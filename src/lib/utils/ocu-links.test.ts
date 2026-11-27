import { describe, expect, it } from 'vitest';

import { encodeOcuFilePath, recogniseOcuLink } from './ocu-links';

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

describe('encodeOcuFilePath', () => {
	it("encodes each segment as OCU's quote(path, safe='/') does, keeping the slashes", () => {
		// Python: quote('温度 (1).png', safe='/') and quote("a!b'c*.png", safe='/').
		expect(encodeOcuFilePath('温度 (1).png')).toBe('%E6%B8%A9%E5%BA%A6%20%281%29.png');
		expect(encodeOcuFilePath("plots/a!b'c*.png")).toBe('plots/a%21b%27c%2A.png');
		expect(encodeOcuFilePath('100%.png')).toBe('100%25.png');
		expect(encodeOcuFilePath('a#b?.png')).toBe('a%23b%3F.png');
	});

	it.each([
		['a parent segment', '../x.png'],
		['an inner parent segment', 'a/../x.png'],
		['a dot segment', 'a/./x.png'],
		['an empty segment', 'a//x.png'],
		['a leading slash', '/x.png'],
		['a trailing slash', 'dir/'],
		['an empty path', ''],
		['a backslash', 'a\\x.png']
	])('returns null for %s', (_label, path) => {
		expect(encodeOcuFilePath(path)).toBeNull();
	});
});
