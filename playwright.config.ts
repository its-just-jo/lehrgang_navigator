import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4173",
    // In Umgebungen mit vorinstalliertem Chromium (z. B. Sandbox/CI-Cache) kann
    // PW_CHROMIUM_PATH auf die Binärdatei zeigen, statt Browser herunterzuladen.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173/lehrgang_navigator/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
