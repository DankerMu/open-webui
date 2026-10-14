import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/ocu-{workspace,resources,controls,reconciliation,drawio,tree,office}.e2e.ts',
	timeout: 60_000,
	workers: 1,
	expect: { timeout: 20_000 },
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: process.env.BASE_URL,
		launchOptions: {
			args: [
				// A generated loopback port lets the native-target observer use flattened CDP.
				'--remote-debugging-port=0',
				// Chromium exposes its managed profile command line only in automation mode.
				'--enable-automation'
			]
		},
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	}
});
