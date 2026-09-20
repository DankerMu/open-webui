import { defineConfig } from '@playwright/test';

// UI smoke baseline (AGENTS.md ## Verification Matrix). The dev servers are
// started by `make dev-bg` (scripts/dev-bg.sh) — Playwright reuses them.
export default defineConfig({
	testDir: './e2e',
	// *.e2e.ts keeps Playwright specs out of Vitest's default **/*.spec.ts glob.
	testMatch: '**/*.e2e.ts',
	timeout: 30_000,
	// First navigation compiles the route in Vite dev; on a cold CI runner that exceeds
	// Playwright's 5s default expect timeout (observed: /auth locator not found at 5.9s).
	expect: { timeout: 20_000 },
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'bash scripts/dev-bg.sh start',
		url: 'http://localhost:5173/',
		reuseExistingServer: true,
		timeout: 180_000
	}
});
