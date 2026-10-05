import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/ocu-{workspace,controls,reconciliation,drawio,tree,office}.e2e.ts',
	timeout: 60_000,
	workers: 1,
	expect: { timeout: 20_000 },
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: process.env.BASE_URL,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	}
});
