import { theme } from '$lib/stores';

const themes = ['dark', 'light', 'oled-dark'];
const GRAY_VARS = ['--color-gray-800', '--color-gray-850', '--color-gray-900', '--color-gray-950'];

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const setGrays = (values: string[]) => {
	GRAY_VARS.forEach((name, index) => {
		document.documentElement.style.setProperty(name, values[index]);
	});
};

const resolveTheme = (_theme: string) => {
	if (_theme === 'system') {
		return prefersDark() ? 'dark' : 'light';
	}

	return _theme === 'oled-dark' ? 'dark' : _theme === 'her' ? 'light' : _theme;
};

const metaColor = (_theme: string) => {
	if (_theme.includes('system')) {
		const systemTheme = prefersDark() ? 'dark' : 'light';
		console.log('Setting system meta theme color: ' + systemTheme);
		return systemTheme === 'light' ? '#ffffff' : '#171717';
	}

	console.log('Setting meta theme color: ' + _theme);
	return _theme === 'dark'
		? '#171717'
		: _theme === 'oled-dark'
			? '#000000'
			: _theme === 'her'
				? '#983724'
				: '#ffffff';
};

export const applyTheme = (_theme: string) => {
	if (typeof document === 'undefined') {
		return;
	}

	const themeToApply = resolveTheme(_theme);

	if (themeToApply === 'dark' && !_theme.includes('oled')) {
		setGrays(['#333', '#262626', '#171717', '#0d0d0d']);
	}

	themes
		.filter((e) => e !== themeToApply)
		.forEach((e) => {
			e.split(' ').forEach((e) => {
				document.documentElement.classList.remove(e);
			});
		});

	themeToApply.split(' ').forEach((e) => {
		document.documentElement.classList.add(e);
	});

	const metaThemeColor = document.querySelector('meta[name="theme-color"]');
	if (metaThemeColor) {
		metaThemeColor.setAttribute('content', metaColor(_theme));
	}

	if (typeof window !== 'undefined' && window.applyTheme) {
		window.applyTheme();
	}

	if (_theme.includes('oled')) {
		setGrays(['#101010', '#050505', '#000000', '#000000']);
		document.documentElement.classList.add('dark');
	}

	console.log(_theme);
};

export const setTheme = (_theme: string) => {
	theme.set(_theme);
	localStorage.setItem('theme', _theme);
	applyTheme(_theme);
};
