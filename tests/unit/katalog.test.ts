import { describe, expect, it } from "vitest";
import katalogJson from "../../data/lehrgaenge.json";
import { auffrischungsIndex, indiziereKatalog } from "../../src/lib/catalog";
import type { Katalog } from "../../src/lib/types";

const katalog = katalogJson as unknown as Katalog;

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
  });

  it("bietet eine Auffrischung für den Erste-Hilfe-Nachweis an", () => {
    const auffrischer = auffrischungsIndex(katalog);
    expect(auffrischer.get("311_eh")?.id).toBe("321_eh_fb");
    expect(auffrischer.get("331")?.id).toBe("333");
  });

  it("externe Voraussetzungen haben selbst keine Voraussetzungen", () => {
    for (const kurs of katalog.lehrgaenge) {
      if (kurs.extern) {
        expect(kurs.voraussetzungen, kurs.id).toEqual([]);
      }
    }
  });
});
