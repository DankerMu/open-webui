import { Marked } from 'marked';
import { encodeOcuFilePath, recogniseOcuLink } from '$lib/utils/ocu-links';

export type OcuImageOptions = { chatId?: string; origin?: string };

type OcuImage = { id: string; url: string; name: string };

// The OCU tools whose result lists the images the call wrote, one line each (computer_use_tools.py).
const OCU_IMAGE_TOOLS = new Set(['bash_tool', 'str_replace', 'create_file', 'sub_agent']);
const NEW_IMAGE_LINE = /^New image: \/mnt\/user-data\/files\/(.+)$/gm;

// A plain instance: the image tokens Markdown.svelte renders, without its global extensions.
const markdown = new Marked();

const decodeSegments = (path: string): string[] | null => {
	try {
		return path.split('/').map(decodeURIComponent);
	} catch {
		// A malformed escape (e.g. `100%.png`) names no file we can compare: no match.
		return null;
	}
};

// Paths compare as segment lists: joined, a decoded `%2F` would forge a segment boundary.
const segmentKey = (segments: string[]) => JSON.stringify(segments);

/** The decoded path segments of every markdown image in `texts` that loads a file of the chat. */
function embeddedPaths(texts: string[], chatId: string, origin: string): Set<string> {
	const paths = new Set<string>();
	for (const text of texts) {
		markdown.walkTokens(markdown.lexer(text), (token) => {
			const path =
				token.type === 'image' ? recogniseOcuLink(token.href, `${origin}/ocu`, chatId) : null;
			const segments = path === null ? null : decodeSegments(path);
			if (segments) paths.add(segmentKey(segments));
		});
	}
	return paths;
}

const toImage = (chatId: string, path: string): OcuImage[] => {
	let encoded: string | null;
	try {
		encoded = encodeOcuFilePath(path);
	} catch {
		// encodeURIComponent throws on a lone surrogate, which no outputs file can be named.
		return [];
	}
	if (encoded === null) return [];
	const url = `/ocu/files/${encodeURIComponent(chatId)}/${encoded}`;
	return [{ id: path, url, name: path.slice(path.lastIndexOf('/') + 1) }];
};

/**
 * A reader of the images an OCU call's result names in `New image:` lines, minus those a message
 * already embeds as a markdown image on this origin. Messages are lexed once, on first need.
 */
export function createOcuImageReader(
	messageTexts: () => string[],
	{ chatId = '', origin = '' }: OcuImageOptions = {}
) {
	let embeds: Set<string> | null = null;
	return (toolName: string, resultText: string): OcuImage[] => {
		if (!chatId || !OCU_IMAGE_TOOLS.has(toolName)) return [];
		const paths = new Set(Array.from(resultText.matchAll(NEW_IMAGE_LINE), (match) => match[1]));
		const images = [...paths].flatMap((path) => toImage(chatId, path));
		if (!images.length || !origin) return images;
		const embedded = (embeds ??= embeddedPaths(messageTexts(), chatId, origin));
		return images.filter((image) => !embedded.has(segmentKey(image.id.split('/'))));
	};
}
