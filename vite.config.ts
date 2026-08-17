import { defineConfig } from "vitest/config";

// GitHub Pages liefert das Projekt unter https://<user>.github.io/lehrgang_navigator/
// aus; dort muss "base" dem Repository-Namen entsprechen. Damit dev, preview und
// Playwright dieselben Pfade sehen, gilt die Base überall (per PAGES_BASE übersteuerbar).
export default defineConfig({
  base: process.env.PAGES_BASE ?? "/lehrgang_navigator/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
