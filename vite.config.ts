import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

import { viteStaticCopy } from 'vite-plugin-static-copy';

const backendTarget = process.env.WEBUI_BACKEND_URL || 'http://localhost:8080';
const uiProxyHarness = process.env.OCU_UI_PROXY_HARNESS === 'true';
const harnessCacheDir = uiProxyHarness ? process.env.OCU_UI_VITE_CACHE_DIR : undefined;
if (uiProxyHarness && !harnessCacheDir) {
	throw new Error('OCU_UI_VITE_CACHE_DIR is required for the isolated UI harness');
}

export default defineConfig({
	// Keep the harness optimizer from replacing dependency generations used by a live default frontend.
	...(uiProxyHarness ? { cacheDir: harnessCacheDir } : {}),
	plugins: [
		sveltekit(),
		viteStaticCopy({
			targets: [
				{
					src: 'node_modules/onnxruntime-web/dist/*.jsep.*',

					dest: 'wasm'
				}
			]
		})
	],
	// Vitest/jsdom must resolve Svelte's browser export instead of Node's server export.
	...(process.env.VITEST === 'true'
		? {
				test: {
					// Keep copied build snapshots out of test discovery.
					include: [
						'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
						'scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)'
					],
					server: { deps: { inline: [/^svelte(?:\/.*)?$/] } }
				},
				resolve: { conditions: ['browser'] },
				ssr: { resolve: { conditions: ['browser'] } }
			}
		: {}),
	define: {
		APP_VERSION: JSON.stringify(process.env.npm_package_version),
		APP_BUILD_HASH: JSON.stringify(process.env.APP_BUILD_HASH || 'dev-build')
	},
	build: {
		sourcemap: true
	},
	server: {
		// nginx's upstream Host is an alias; permit it only in the owned proxy browser harness.
		...(uiProxyHarness ? { allowedHosts: ['ocu_proxy_webui'] } : {}),
		proxy: {
			'/api': {
				target: backendTarget,
				changeOrigin: true,
				ws: true
			},
			'/ollama': {
				target: backendTarget,
				changeOrigin: true
			},
			'/openai': {
				target: backendTarget,
				changeOrigin: true
			},
			'/oauth': {
				target: backendTarget,
				changeOrigin: true
			},
			'/ws': {
				target: backendTarget,
				changeOrigin: true,
				ws: true
			}
		}
	},
	worker: {
		format: 'es'
	},
	esbuild: {
		pure: process.env.ENV === 'dev' ? [] : ['console.log', 'console.debug', 'console.error']
	}
});
