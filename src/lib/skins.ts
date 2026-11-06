import { get } from 'svelte/store';
import { settings, user } from '$lib/stores';
import { updateUserSettings } from '$lib/apis/users';
import { setTheme } from '$lib/utils/theme';

type Skin = {
	id: string;
	mode: 'light' | 'dark';
	overlay: { color: string; alpha: number };
};

// Ids are stored in user settings: renaming one is a breaking change. Order is the requester's 01-09.
export const skins: Skin[] = [
	{ id: 'olive-ops', mode: 'dark', overlay: { color: '#101d13', alpha: 0.18 } },
	{ id: 'snow-plateau', mode: 'light', overlay: { color: '#ffffff', alpha: 0.18 } },
	{ id: 'golden-peaks', mode: 'dark', overlay: { color: '#101c30', alpha: 0.24 } },
	{ id: 'cloud-watch', mode: 'light', overlay: { color: '#f8fbff', alpha: 0.2 } },
	{ id: 'river-hydrology', mode: 'light', overlay: { color: '#f8fbff', alpha: 0.22 } },
	{ id: 'terrain-grid', mode: 'dark', overlay: { color: '#061623', alpha: 0.22 } },
	{ id: 'glacier-lake', mode: 'light', overlay: { color: '#f8fbff', alpha: 0.22 } },
	{ id: 'starfield', mode: 'dark', overlay: { color: '#071322', alpha: 0.2 } },
	{ id: 'minimal-terrain', mode: 'light', overlay: { color: '#ffffff', alpha: 0.12 } }
];

const findSkin = (id?: string | null) => skins.find((skin) => skin.id === id);

const overlayColor = ({ color, alpha }: Skin['overlay']) => {
	const rgb = parseInt(color.slice(1), 16);
	return `rgba(${rgb >> 16}, ${(rgb >> 8) & 255}, ${rgb & 255}, ${alpha})`;
};

// Per user, so another account in the same browser never inherits the skin.
const mirrorKey = () => {
	const userId = get(user)?.id;
	return userId ? `skin:${userId}` : null;
};

const writeMirror = (id?: string | null) => {
	const key = mirrorKey();
	if (!key) {
		return;
	}
	if (findSkin(id)) {
		localStorage.setItem(key, id as string);
	} else {
		localStorage.removeItem(key);
	}
};

// A null or unknown id (a skin removed in a later release) means None.
export const applySkin = (id?: string | null) => {
	if (typeof document === 'undefined') {
		return;
	}

	const root = document.documentElement;
	const skin = findSkin(id);
	if (!skin) {
		root.removeAttribute('data-skin');
		root.style.removeProperty('--skin-image');
		root.style.removeProperty('--skin-overlay');
		return;
	}

	root.dataset.skin = skin.id;
	root.style.setProperty('--skin-image', `url(/skins/${skin.id}.webp)`);
	root.style.setProperty('--skin-overlay', overlayColor(skin.overlay));
};

// Applied before user settings arrive; restoreSkin overrides it once they load.
export const applySkinMirror = () => {
	const key = mirrorKey();
	if (key) {
		applySkin(localStorage.getItem(key));
	}
};

// Loaded settings always win; an absent or unknown skin means None and drops the mirror.
export const restoreSkin = (id?: string | null) => {
	applySkin(id);
	writeMirror(id);
};

// Resolves true only when the server stored the choice. updateUserSettings resolves null
// instead of throwing when fetch rejects or the body is not JSON, so null is a failure too.
// The skin stays applied either way; the caller shows $i18n.t('Failed to update settings')
// on false, because this module carries no display strings.
export const selectSkin = async (id: string | null): Promise<boolean> => {
	applySkin(id);

	const skin = findSkin(id);
	if (skin) {
		setTheme(skin.mode);
	}

	settings.update((current) => ({ ...current, skin: id }));
	writeMirror(id);

	try {
		return (await updateUserSettings(localStorage.token, { ui: get(settings) })) !== null;
	} catch {
		// A rejected save is the same outcome as a null one: report false, keep the session skin.
		return false;
	}
};
