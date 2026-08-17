import { describe, expect, it } from "vitest";
import katalogJson from "../../data/lehrgaenge.json";
import {
  aktuellesHalbjahr,
  halbjahrLabel,
  halbjahrNachSlots,
  plane,
} from "../../src/lib/planner";
import type { Halbjahr, Katalog, Plan } from "../../src/lib/types";

const katalog = katalogJson as unknown as Katalog;
const START: Halbjahr = { jahr: 2026, halb: 2 };

function pruefeReihenfolge(plan: Plan): void {
  const slotVon = new Map(
    plan.kurse.filter((k) => !k.auffrischung).map((k) => [k.kurs.id, k.slot]),
  );
  for (const geplant of plan.kurse) {
    if (geplant.auffrischung) continue;
    for (const v of geplant.kurs.voraussetzungen) {
      if (!slotVon.has(v)) continue;
      expect(slotVon.get(v)!, `${v} vor ${geplant.kurs.id}`).toBeLessThan(geplant.slot);
    }
  }
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

describe("plane", () => {
  it("hält die Kapazität pro Halbjahr ein", () => {
    const { schnell } = plane(katalog, {
      zielIds: ["181"],
      vorhanden: [],
      maxProHalbjahr: 1,
      start: START,
    });
    for (const slot of schnell.slots) {
      expect(slot.filter((k) => !k.auffrischung).length).toBeLessThanOrEqual(1);
    }
  });

  it("legt jährliche Lehrgänge nur ins 1. Kalenderhalbjahr", () => {
    const { schnell, guenstig } = plane(katalog, {
      zielIds: ["181"],
      vorhanden: [],
      maxProHalbjahr: 2,
      start: START,
    });
    for (const plan of [schnell, guenstig]) {
      for (const geplant of plan.kurse) {
        if (geplant.kurs.angebot === "jaehrlich") {
          expect(halbjahrNachSlots(START, geplant.slot).halb, geplant.kurs.id).toBe(1);
        }
      }
    }
  });

  it("wartet auf das Mindestalter", () => {
    const { schnell } = plane(katalog, {
      zielIds: ["181"],
      vorhanden: [],
      maxProHalbjahr: 4,
      start: START,
      alter: 16,
    });
    const lehrschein = schnell.kurse.find((k) => k.kurs.id === "181")!;
    // 16 + slot*0.5 >= 18 → frühestens Slot 4
    expect(lehrschein.slot).toBeGreaterThanOrEqual(4);
    pruefeReihenfolge(schnell);
  });

  it("warnt, wenn kein Alter angegeben ist, aber Mindestalter existieren", () => {
    const { schnell } = plane(katalog, {
      zielIds: ["181"],
      vorhanden: [],
      maxProHalbjahr: 2,
      start: START,
    });
    expect(schnell.warnungen.some((w) => w.includes("Mindestalter"))).toBe(true);
  });

  it("listet externe Voraussetzungen separat statt sie einzuplanen", () => {
    const { schnell } = plane(katalog, {
      zielIds: ["411"],
      vorhanden: [],
      maxProHalbjahr: 3,
      start: START,
      alter: 25,
    });
    const externIds = schnell.externeVoraussetzungen.map((k) => k.id);
    expect(externIds).toContain("dlrg_mitgliedschaft");
    expect(externIds).toContain("aerztl_tauglichkeit");
    expect(schnell.kurse.every((k) => k.kurs.extern !== true)).toBe(true);
  });

  it("meldet ein leeres Ergebnis, wenn alles vorhanden ist", () => {
    const { schnell, guenstig, identisch } = plane(katalog, {
      zielIds: ["152"],
      vorhanden: ["152"],
      maxProHalbjahr: 2,
      start: START,
    });
    expect(schnell.kurse).toEqual([]);
    expect(guenstig.kurse).toEqual([]);
    expect(identisch).toBe(true);
  });
});
