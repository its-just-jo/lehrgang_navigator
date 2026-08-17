import { expect, test } from "@playwright/test";

/**
 * Smoke-Test gegen die gebaute statische Seite (wie sie GitHub Pages ausliefert):
 * Standardziel ist der DLRG-Lehrschein; die Seite muss ohne Server-Backend
 * einen vollständigen Plan rendern und auf Eingaben reagieren.
 */
test("rendert den Lehrschein-Plan und reagiert auf Eingaben", async ({ page }) => {
  await page.goto("/lehrgang_navigator/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator("h1")).toHaveText("DLRG Lehrgangs-Navigator");

  // Standardziel: Lehrschein (181)
  await expect(page.locator("#ziel")).toHaveValue("181");

  // Beide Plan-Karten sind da, Zeitachse enthält die Kernlehrgänge.
  await expect(page.getByRole("button", { name: /Schnellster Plan/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Günstigster Plan/ })).toBeVisible();
  const ergebnis = page.locator("#ergebnis");
  await expect(ergebnis).toContainText("DRSA Silber");
  await expect(ergebnis).toContainText("Gemeinsamer Grundausbildungsblock");
  await expect(ergebnis).toContainText("DLRG-Lehrschein");

  // Vorhandene Qualifikation anhaken → Plan wird kürzer (DRSA Bronze verschwindet).
  await expect(ergebnis).toContainText("DRSA Bronze");
  const rettungsschwimmen = page.locator(
    'details.kategorie-block[data-kategorie="rettungsschwimmabzeichen"]',
  );
  await rettungsschwimmen.locator("summary").click();
  await rettungsschwimmen
    .locator("label", { hasText: "DRSA Bronze" })
    .locator("input")
    .check();
  await expect(ergebnis.locator(".kurs-chip", { hasText: "DRSA Bronze" })).toHaveCount(0);

  // Komfort-Vergleichstabelle zeigt alle vier Stufen.
  await expect(page.locator("table.komfort tbody tr")).toHaveCount(4);
});
