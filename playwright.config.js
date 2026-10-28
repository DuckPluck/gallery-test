import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({
    name: browserName,
    use: {
      browserName,
      // WebKit's system proxy discovery cannot resolve the local test server.
      ...(browserName === 'webkit' ? { launchOptions: { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/proxy/i.test(key))) } } : {}),
    },
  })),
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
