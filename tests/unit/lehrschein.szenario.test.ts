import { describe, expect, it } from "vitest";
import katalogJson from "../../data/lehrgaenge.json";
import { halbjahrNachSlots, plane } from "../../src/lib/planner";
import type { Halbjahr, Katalog } from "../../src/lib/types";

/**
 * Das End-to-End-Szenario des Projekts: Weg zum DLRG-Lehrschein
 * (Ausbilder Schwimmen + Rettungsschwimmen, DOSB Trainer C) von null an.
 */
const katalog = katalogJson as unknown as Katalog;
const START: Halbjahr = { jahr: 2026, halb: 2 };

const ERWARTETE_KURSE = ["311_eh", "151", "152", "171", "172", "180", "181"].sort();

describe("E2E-Szenario: DLRG-Lehrschein (Trainer C)", () => {
  it("findet bei 2 Lehrgängen pro Halbjahr die vollständige Kombination ohne Auffrischungen", () => {
    const { schnell, guenstig, identisch } = plane(katalog, {
      zielIds: ["181"],
      vorhanden: [],
      maxProHalbjahr: 2,
      start: START,
      alter: 25,
    });

    const kursIds = schnell.kurse
      .filter((k) => !k.auffrischung)
      .map((k) => k.kurs.id)
      .sort();
    expect(kursIds).toEqual(ERWARTETE_KURSE);

    // Bei diesem Tempo bleiben EH-Nachweis und DRSA Silber frisch genug.
    expect(schnell.auffrischungen).toEqual([]);
    expect(schnell.dauerHalbjahre).toBe(4);
    expect(identisch).toBe(true);
    expect(guenstig.kosten).toBe(schnell.kosten);

    // Der Lehrschein selbst ist ein jährlicher Lehrgang → 1. Kalenderhalbjahr.
    const lehrschein = schnell.kurse.find((k) => k.kurs.id === "181")!;
    expect(halbjahrNachSlots(START, lehrschein.slot).halb).toBe(1);
  });

  it("zeigt bei gemütlichem Tempo (1 Lehrgang pro Halbjahr) den Preis der Langsamkeit", () => {
    const { schnell, guenstig } = plane(katalog, {
      zielIds: ["181"],
      vorhanden: [],
      maxProHalbjahr: 1,
      start: START,
      alter: 25,
    });

    // Der schnelle (ASAP-)Plan macht EH & Silber früh → beide veralten bis zur Prüfung.
    expect(schnell.auffrischungen.length).toBe(2);
    // Der günstige Plan schiebt die Nachweise nach hinten → nur die EH-Fortbildung bleibt nötig.
    expect(guenstig.auffrischungen.length).toBe(1);
    expect(guenstig.auffrischungen[0]!.kurs.id).toBe("321_eh_fb");
    expect(guenstig.kosten).toBeLessThan(schnell.kosten);
    // Beide Strategien brauchen gleich lang – günstiger heißt hier nicht langsamer.
    expect(guenstig.dauerHalbjahre).toBe(schnell.dauerHalbjahre);
  });

  it("verkürzt den Weg, wenn Rettungsschwimmabzeichen Silber schon vorhanden ist", () => {
    const { schnell } = plane(katalog, {
      zielIds: ["181"],
      vorhanden: ["152"],
      maxProHalbjahr: 2,
      start: START,
      alter: 25,
    });
    const kursIds = schnell.kurse.filter((k) => !k.auffrischung).map((k) => k.kurs.id);
    // 152 und sein Voraussetzungs-Erste-Hilfe-Kurs entfallen als eigene Lehrgänge …
    expect(kursIds).not.toContain("152");
    expect(kursIds).not.toContain("311_eh");
    // … der Rest bleibt nötig.
    expect(kursIds.sort()).toEqual(["151", "171", "172", "180", "181"].sort());
  });
});
