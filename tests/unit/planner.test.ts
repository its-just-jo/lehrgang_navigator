import { describe, expect, it } from "vitest";
import katalogJson from "../../data/lehrgaenge.json";
import {
  aktuellesHalbjahr,
  distanzKm,
  halbjahrLabel,
  halbjahrNachSlots,
  plane,
} from "../../src/lib/planner";
import type { Halbjahr, Katalog, PlanOptionen } from "../../src/lib/types";

const katalog = katalogJson as unknown as Katalog;
const START: Halbjahr = { jahr: 2026, halb: 2 };

function optionen(teil: Partial<PlanOptionen> = {}): PlanOptionen {
  return {
    zielIds: ["181"],
    vorhanden: [],
    start: START,
    alter: 25,
    tempo: null,
    standort: null,
    maxKm: null,
    angebote: [],
    ...teil,
  };
}

describe("Halbjahres-Arithmetik", () => {
  it("rechnet Slots korrekt in Kalender-Halbjahre um", () => {
    expect(halbjahrNachSlots(START, 0)).toEqual({ jahr: 2026, halb: 2 });
    expect(halbjahrNachSlots(START, 1)).toEqual({ jahr: 2027, halb: 1 });
    expect(halbjahrNachSlots(START, 3)).toEqual({ jahr: 2028, halb: 1 });
    expect(halbjahrLabel({ jahr: 2027, halb: 1 })).toBe("2027 · 1. Halbjahr");
  });

  it("bestimmt das aktuelle Halbjahr aus dem Datum", () => {
    expect(aktuellesHalbjahr(new Date("2026-03-01"))).toEqual({ jahr: 2026, halb: 1 });
    expect(aktuellesHalbjahr(new Date("2026-08-17"))).toEqual({ jahr: 2026, halb: 2 });
  });
});

describe("distanzKm", () => {
  it("liefert plausible Entfernungen (Stuttgart–München ≈ 190 km)", () => {
    const km = distanzKm(48.78, 9.18, 48.14, 11.58);
    expect(km).toBeGreaterThan(160);
    expect(km).toBeLessThan(220);
  });
});

describe("plane", () => {
  it("hält im Komfort-Szenario das Wunsch-Tempo ein", () => {
    const { komfort } = plane(katalog, optionen({ tempo: 1 }));
    for (const slot of komfort.slots) {
      expect(slot.length).toBeLessThanOrEqual(1);
    }
  });

  it("Tempo „egal“ macht den Komfort-Plan so schnell wie den schnellsten", () => {
    const ergebnis = plane(katalog, optionen({ tempo: null }));
    expect(ergebnis.komfort.dauerHalbjahre).toBe(ergebnis.schnell.dauerHalbjahre);
  });

  it("ein gemütliches Tempo verlängert den Plan (Wasserretter hat viel Parallelisierbares)", () => {
    const ergebnis = plane(katalog, optionen({ zielIds: ["411"], tempo: 1 }));
    expect(ergebnis.komfort.dauerHalbjahre).toBeGreaterThan(ergebnis.schnell.dauerHalbjahre);
  });

  it("legt jährliche Lehrgänge nur ins 1. Kalenderhalbjahr", () => {
    const ergebnis = plane(katalog, optionen());
    for (const plan of [ergebnis.schnell, ergebnis.guenstig, ergebnis.komfort]) {
      for (const geplant of plan.kurse) {
        if (geplant.kurs.angebot === "jaehrlich") {
          expect(halbjahrNachSlots(START, geplant.slot).halb, geplant.kurs.id).toBe(1);
        }
      }
    }
  });

  it("wartet auf das Mindestalter", () => {
    const { schnell } = plane(katalog, optionen({ alter: 16 }));
    const lehrschein = schnell.kurse.find((k) => k.kurs.id === "181")!;
    // 16 + slot*0.5 >= 18 → frühestens Slot 4
    expect(lehrschein.slot).toBeGreaterThanOrEqual(4);
  });

  it("warnt, wenn kein Alter angegeben ist, aber Mindestalter existieren", () => {
    const { schnell } = plane(katalog, optionen({ alter: null }));
    expect(schnell.warnungen.some((w) => w.includes("Mindestalter"))).toBe(true);
  });

  it("plant keine Auffrischungen ein, sondern warnt bei ablaufenden Nachweisen", () => {
    const { schnell } = plane(katalog, optionen());
    // ASAP legt die Erste Hilfe ganz an den Anfang → beim Lehrschein wäre sie zu alt.
    expect(schnell.kurse.every((k) => k.kurs.id !== "321_eh_fb")).toBe(true);
    expect(schnell.warnungen.some((w) => w.includes("auffrischen"))).toBe(true);
  });

  it("der günstigste Plan hält Nachweise durch späte Terminierung frisch", () => {
    const { guenstig, schnell } = plane(katalog, optionen());
    expect(guenstig.dauerHalbjahre).toBe(schnell.dauerHalbjahre);
    expect(guenstig.warnungen.some((w) => w.includes("auffrischen"))).toBe(false);
  });

  it("listet externe Voraussetzungen separat statt sie einzuplanen", () => {
    const { schnell } = plane(katalog, optionen({ zielIds: ["411"], tempo: 3 }));
    const externIds = schnell.externeVoraussetzungen.map((k) => k.id);
    expect(externIds).toContain("dlrg_mitgliedschaft");
    expect(externIds).toContain("aerztl_tauglichkeit");
    expect(schnell.kurse.every((k) => k.kurs.extern !== true)).toBe(true);
  });

  it("meldet ein leeres Ergebnis, wenn alles vorhanden ist", () => {
    const ergebnis = plane(katalog, optionen({ zielIds: ["152"], vorhanden: ["152"] }));
    expect(ergebnis.schnell.kurse).toEqual([]);
    expect(ergebnis.guenstig.kurse).toEqual([]);
  });
});
