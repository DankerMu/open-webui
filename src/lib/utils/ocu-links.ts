const PATH_ONLY_ORIGIN = 'http://ocu.invalid';

export const recogniseOcuLink = (href: string, base: string, chatId: string): string | null => {
	if (!href || !base || !chatId) return null;

	let baseUrl: URL;
	let pathOnlyBase = false;
	try {
		baseUrl = new URL(base);
	} catch {
		try {
			baseUrl = new URL(base, PATH_ONLY_ORIGIN);
			pathOnlyBase = true;
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

	if (!pathOnlyBase && hrefUrl.origin !== baseUrl.origin) return null;

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

/**
 * The URL path of a file under a chat's OCU outputs: each segment encoded as OCU's
 * `quote(path, safe='/')` does (encodeURIComponent leaves `!'()*`). Null for an empty, `.` or `..`
 * segment or a backslash, which name no file of the outputs.
 */
export const encodeOcuFilePath = (path: string): string | null => {
	const segments = path.split('/');
	if (segments.some((s) => !s || s === '.' || s === '..' || s.includes('\\'))) return null;
	return segments
		.map((segment) =>
			encodeURIComponent(segment).replace(
				/[!'()*]/g,
				(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
			)
		)
		.join('/');
};
