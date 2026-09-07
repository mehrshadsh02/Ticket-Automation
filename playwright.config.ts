import { defineConfig, devices } from "@playwright/test";

const ciOptions = process.env.CI ? { retries: 2, workers: 1 } : { retries: 0 };

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  ...ciOptions,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
