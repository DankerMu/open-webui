const PATH_ONLY_ORIGIN = 'http://ocu.invalid';

export const recogniseOcuLink = (href: string, base: string, chatId: string): string | null => {
	if (!href || !base || !chatId) return null;

	let baseUrl: URL;
	try {
		baseUrl = new URL(base);
	} catch {
		try {
			baseUrl = new URL(base, PATH_ONLY_ORIGIN);
		} catch {
			return null;
		}
	}

	let hrefUrl: URL;
	try {
		hrefUrl = new URL(href, baseUrl);
	} catch {
		return null;
	}

	if (hrefUrl.origin !== baseUrl.origin) return null;

	const prefix =
		baseUrl.pathname.length > 1 && baseUrl.pathname.endsWith('/')
			? baseUrl.pathname.slice(0, -1)
			: baseUrl.pathname;
	if (!hrefUrl.pathname.startsWith(`${prefix}/`)) return null;

	const remainder = hrefUrl.pathname.slice(prefix.length);
	const filesPrefix = `/files/${chatId}/`;
	if (!remainder.startsWith(filesPrefix)) return null;

	const rest = remainder.slice(filesPrefix.length);
	return rest === '' ? null : rest;
};
