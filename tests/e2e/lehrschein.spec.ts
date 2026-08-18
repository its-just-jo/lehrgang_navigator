import { expect, test } from "@playwright/test";

/**
 * Smoke-Test gegen die gebaute statische Seite (wie sie GitHub Pages ausliefert):
 * Standardziel ist der DLRG-Lehrschein; die Seite muss ohne Server-Backend
 * die fünf Szenarien rendern und auf Eingaben reagieren.
 */
test("rendert den Lehrschein-Plan mit fünf Szenarien und reagiert auf Eingaben", async ({ page }) => {
  await page.goto("/lehrgang_navigator/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator(".marke")).toContainText("Lehrgangs-Navigator");
  await expect(page.locator("#ziel")).toHaveValue("181");

  // Fünf gleichrangige Szenario-Karten.
  await expect(page.locator(".szenario-karte")).toHaveCount(5);
  for (const name of ["Schnellster", "Günstigster", "Komfort", "Wenig Fahrerei", "Ausgewogen"]) {
    await expect(page.locator(".szenario-karte", { hasText: name })).toBeVisible();
  }

  const ergebnis = page.locator("#ergebnis");
  // DRSA Silber deckt Bronze ab → kein separates Bronze im Plan.
  await expect(ergebnis).toContainText("DRSA Silber");
  await expect(ergebnis.locator(".kurs-chip", { hasText: "DRSA Bronze" })).toHaveCount(0);
  // Kurs-Chips zeigen Ort und Gliederung aus den hinterlegten Angeboten.
  await expect(ergebnis.locator(".kurs-ort").first()).toBeVisible();

  // Szenario wechseln: Günstigster Plan nutzt die getrennten Ausbilder-Lehrgänge.
  await page.locator(".szenario-karte", { hasText: "Günstigster" }).click();
  await expect(page.locator(".szenario-karte.aktiv")).toContainText("Günstigster");
  await expect(ergebnis).toContainText("Ausbilder Schwimmen");

  // Auto-Vervollständigung: DRSA Silber anhaken hakt Bronze + Erste Hilfe mit an.
  const rettungsschwimmen = page.locator(
    'details.kategorie-block[data-kategorie="rettungsschwimmabzeichen"]',
  );
  await rettungsschwimmen.locator("summary").click();
  await rettungsschwimmen.locator('input[data-vorhanden="152"]').check();
  await expect(rettungsschwimmen.locator('input[data-vorhanden="151"]')).toBeChecked();
  await expect(
    page.locator('details.kategorie-block[data-kategorie="medizin"] input[data-vorhanden="311_eh"]'),
  ).toBeChecked();
  await expect(ergebnis.locator(".kurs-chip", { hasText: "DRSA Silber" })).toHaveCount(0);

  // Tempo-Tabelle ist in einem horizontal scrollbaren Container.
  await expect(page.locator(".tabellen-scroll table.tempo-tabelle").first()).toBeVisible();

  // Plan-Darstellung umschalten: Zeitstrahl (SVG) und Tabelle.
  await page.locator('button[data-planansicht="zeitstrahl"]').click();
  await expect(page.locator(".zeitstrahl svg")).toBeVisible();
  await page.locator('button[data-planansicht="tabelle"]').click();
  await expect(page.locator("table.plan-tabelle")).toBeVisible();
  await expect(page.locator("table.plan-tabelle thead")).toContainText("Gliederung");
  await page.locator('button[data-planansicht="liste"]').click();

  // Netzplan-Tab: Querverbindungen sind erst nach Klick auf eine Station sichtbar.
  await page.locator('button[data-tab="netz"]').click();
  await expect(page.locator(".netz-scroll svg")).toBeVisible();
  await expect(page.locator(".netz-legende")).toContainText("Rettungsschwimmen");
  await expect(page.locator(".netz-svg .quer.sichtbar")).toHaveCount(0);
  // Station 411 (Wasserretter) hat linienübergreifende Voraussetzungen.
  await page.locator('.netz-station[data-id="411"]').click();
  expect(await page.locator(".netz-svg .quer.sichtbar").count()).toBeGreaterThan(0);
  await expect(page.locator("#netz-info")).toContainText("Wasserretter");

  // Radiale Ansicht umschalten.
  await page.locator('button[data-netzansicht="radial"]').click();
  await expect(page.locator(".netz-radial svg")).toBeVisible();
});
