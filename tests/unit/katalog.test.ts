import { describe, expect, it } from "vitest";
import katalogJson from "../../data/lehrgaenge.json";
import angeboteJson from "../../data/angebote.json";
import { indiziereKatalog } from "../../src/lib/catalog";
import type { AngebotsDatei, Katalog } from "../../src/lib/types";

const katalog = katalogJson as unknown as Katalog;
const angebote = angeboteJson as unknown as AngebotsDatei;

describe("Lehrgangskatalog", () => {
  it("ist referentiell konsistent", () => {
    expect(() => indiziereKatalog(katalog)).not.toThrow();
  });

  it("hat für jeden planbaren Lehrgang Umfang, Kosten und Angebotsfrequenz", () => {
    for (const kurs of katalog.lehrgaenge) {
      if (kurs.extern) continue;
      expect(kurs.lehreinheiten, `${kurs.id}: lehreinheiten`).toBeGreaterThan(0);
      expect(kurs.kosten, `${kurs.id}: kosten`).toBeGreaterThanOrEqual(0);
      expect(["jedes_halbjahr", "jaehrlich"]).toContain(kurs.angebot);
    }
  });

  it("kennt den Lehrschein (181) mit den Voraussetzungen der PO 2025", () => {
    const byId = indiziereKatalog(katalog);
    const lehrschein = byId.get("181");
    expect(lehrschein).toBeDefined();
    expect(lehrschein!.voraussetzungen.sort()).toEqual(
      ["152", "171", "172", "180", "311_eh"].sort(),
    );
    expect(lehrschein!.frische).toEqual({ "152": 2, "311_eh": 2 });
    expect(lehrschein!.mindestalter).toBe(18);
    // Der Kombi-Lehrgang ist selten – als Alternative gelten die getrennten
    // Ausbilder-Lehrgänge Schwimmen (182) und Rettungsschwimmen (183).
    expect(lehrschein!.alternativen).toEqual([["182", "183"]]);
  });

  it("modelliert die Abzeichen-Hierarchie über 'ersetzt'", () => {
    const byId = indiziereKatalog(katalog);
    expect(byId.get("152")!.ersetzt).toEqual(["151"]);
    expect(byId.get("153")!.ersetzt).toEqual(["152"]);
    expect(byId.get("332")!.ersetzt).toEqual(["331"]);
  });

  it("externe Voraussetzungen haben selbst keine Voraussetzungen", () => {
    for (const kurs of katalog.lehrgaenge) {
      if (kurs.extern) {
        expect(kurs.voraussetzungen, kurs.id).toEqual([]);
      }
    }
  });

  it("Beispiel-Angebote verweisen nur auf bekannte Lehrgänge und haben Ort + Gliederung", () => {
    const byId = indiziereKatalog(katalog);
    expect(angebote.angebote.length).toBeGreaterThan(0);
    for (const angebot of angebote.angebote) {
      expect(byId.has(angebot.lehrgang_id), angebot.titel).toBe(true);
      expect(angebot.ort, angebot.titel).toBeTruthy();
      expect(angebot.gliederung, angebot.titel).toBeTruthy();
    }
  });

  it("der Kombi-Lehrgang 181 wird seltener angeboten als die getrennten 182/183", () => {
    const anzahl = (id: string): number =>
      angebote.angebote.filter((a) => a.lehrgang_id === id).length;
    expect(anzahl("181")).toBeLessThan(anzahl("182") + anzahl("183"));
  });
});
