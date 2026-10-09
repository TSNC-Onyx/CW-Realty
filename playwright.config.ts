import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /(tracking|site-switches)\// },
    // Tracking switches on the cookie banner for the whole site, so it runs alone, after the rest.
    { name: "tracking", use: { ...devices["Desktop Chrome"] }, testMatch: /tracking\/.*\.spec\.ts/, dependencies: ["chromium"] },
    // Owner switches that hide pages site-wide (Connections page) run alone, last.
    { name: "site-switches", use: { ...devices["Desktop Chrome"] }, testMatch: /site-switches\/.*\.spec\.ts/, dependencies: ["tracking"] },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
