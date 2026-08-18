import { describe, expect, it } from "vitest";
import katalogJson from "../../data/lehrgaenge.json";
import angeboteJson from "../../data/angebote.json";
import { plane } from "../../src/lib/planner";
import type { AngebotsDatei, Halbjahr, Katalog, PlanOptionen } from "../../src/lib/types";

/**
 * Das End-to-End-Szenario des Projekts: Weg zum DLRG-Lehrschein
 * (Ausbilder Schwimmen + Rettungsschwimmen, DOSB Trainer C) von null an.
 */
const katalog = katalogJson as unknown as Katalog;
const beispielAngebote = (angeboteJson as unknown as AngebotsDatei).angebote;
const START: Halbjahr = { jahr: 2026, halb: 2 };
const STUTTGART = { name: "Stuttgart", lat: 48.78, lon: 9.18 };

function optionen(teil: Partial<PlanOptionen> = {}): PlanOptionen {
  return {
    zielIds: ["181"],
    vorhanden: [],
    start: START,
    alter: 25,
    tempo: 2,
    standort: null,
    maxKm: null,
    angebote: [],
    ...teil,
  };
}

describe("E2E-Szenario: DLRG-Lehrschein (Trainer C)", () => {
  it("findet die minimale Kombination – ohne separates DRSA Bronze, da Silber es abdeckt", () => {
    const { schnell } = plane(katalog, optionen());
    const kursIds = schnell.kurse.map((k) => k.kurs.id).sort();
    expect(kursIds).toEqual(["152", "171", "172", "180", "181", "311_eh"].sort());
  });

  it("plant keine Auffrischungslehrgänge ein – der günstige Plan vermeidet Frische-Probleme per Terminierung", () => {
    const ergebnis = plane(katalog, optionen({ tempo: null }));
    // Schnellster Plan: Erste Hilfe ganz früh → Warnung, dass sie beim
    // Lehrschein zu alt wäre (aber keine automatisch eingeplante Fortbildung).
    expect(ergebnis.schnell.kurse.every((k) => !["321_eh_fb", "333"].includes(k.kurs.id))).toBe(true);
    expect(ergebnis.schnell.warnungen.some((w) => w.includes("auffrischen"))).toBe(true);
    // Günstigster Plan (gleiche Dauer): Nachweise bleiben frisch.
    expect(ergebnis.guenstig.dauerHalbjahre).toBe(ergebnis.schnell.dauerHalbjahre);
    expect(ergebnis.guenstig.warnungen.some((w) => w.includes("auffrischen"))).toBe(false);
  });

  it("mit realen Angeboten wählt der günstigste Plan die getrennten Ausbilder-Lehrgänge (182 + 183)", () => {
    const ergebnis = plane(katalog, optionen({ angebote: beispielAngebote }));
    const guenstigIds = ergebnis.guenstig.kurse.map((k) => k.kurs.id);
    expect(guenstigIds).toContain("182");
    expect(guenstigIds).toContain("183");
    expect(guenstigIds).not.toContain("181");
    expect(ergebnis.guenstig.variante).toMatch(/182|183|Kombi/);
    // Der schnellste Plan bevorzugt bei gleicher Dauer den Kombi-Lehrgang (weniger Kurse).
    expect(ergebnis.schnell.kurse.map((k) => k.kurs.id)).toContain("181");
    expect(ergebnis.guenstig.kosten).toBeLessThan(ergebnis.schnell.kosten);
  });

  it("mit Standort Stuttgart minimiert das Fahrt-Szenario die Strecke (lokale statt zentrale Angebote)", () => {
    const ergebnis = plane(
      katalog,
      optionen({ angebote: beispielAngebote, standort: STUTTGART }),
    );
    expect(ergebnis.fahrt.fahrtKm).not.toBeNull();
    expect(ergebnis.schnell.fahrtKm).not.toBeNull();
    // Kombi-Lehrgang gibt es nur zentral (Bad Nenndorf) → das Fahrt-Szenario
    // weicht auf die getrennten, lokalen Lehrgänge aus.
    expect(ergebnis.fahrt.kurse.map((k) => k.kurs.id)).not.toContain("181");
    expect(ergebnis.fahrt.fahrtKm!).toBeLessThan(ergebnis.schnell.fahrtKm!);
    // Angebote tragen Ort und Gliederung für die Anzeige.
    for (const geplant of ergebnis.fahrt.kurse) {
      if (geplant.angebot) {
        expect(geplant.angebot.ort).toBeTruthy();
        expect(geplant.angebot.gliederung).toBeTruthy();
      }
    }
  });

  it("der Entfernungsfilter blendet ferne Angebote aus und warnt", () => {
    const ergebnis = plane(
      katalog,
      optionen({ angebote: beispielAngebote, standort: STUTTGART, maxKm: 100 }),
    );
    for (const plan of Object.values(ergebnis)) {
      for (const geplant of plan.kurse) {
        if (geplant.entfernungKm != null) {
          expect(geplant.entfernungKm, geplant.kurs.id).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("das Ausgewogen-Szenario liegt zwischen den Extremen", () => {
    const ergebnis = plane(
      katalog,
      optionen({ angebote: beispielAngebote, standort: STUTTGART }),
    );
    const { ausgewogen, schnell, guenstig, fahrt } = ergebnis;
    expect(ausgewogen.beschreibung).toBeTruthy();
    expect(ausgewogen.kosten).toBeLessThanOrEqual(schnell.kosten);
    expect(ausgewogen.dauerHalbjahre).toBeGreaterThanOrEqual(schnell.dauerHalbjahre);
    expect(ausgewogen.fahrtKm!).toBeGreaterThanOrEqual(fahrt.fahrtKm!);
    expect(ausgewogen.kosten).toBeGreaterThanOrEqual(guenstig.kosten);
  });

  it("vorhandenes DRSA Silber erspart Silber, Bronze und Erste Hilfe", () => {
    const { schnell } = plane(katalog, optionen({ vorhanden: ["152"] }));
    const kursIds = schnell.kurse.map((k) => k.kurs.id);
    expect(kursIds).not.toContain("152");
    expect(kursIds).not.toContain("151");
    expect(kursIds).not.toContain("311_eh");
    expect(kursIds.sort()).toEqual(["171", "172", "180", "181"].sort());
  });
});
