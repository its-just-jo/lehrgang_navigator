import { describe, expect, it } from "vitest";
import katalogJson from "../../data/lehrgaenge.json";
import { indiziereKatalog } from "../../src/lib/catalog";
import {
  erweitereVorhanden,
  sammleBenoetigte,
  topologischSortiert,
  ZyklusFehler,
} from "../../src/lib/graph";
import type { Katalog, Lehrgang } from "../../src/lib/types";

const katalog = katalogJson as unknown as Katalog;
const byId = indiziereKatalog(katalog);

function miniKurs(id: string, voraussetzungen: string[]): Lehrgang {
  return {
    id,
    nr: id,
    titel: id,
    beschreibung: "",
    kategorie: "medizin",
    mindestalter: null,
    gueltigkeitsjahre: null,
    voraussetzungen,
    lehreinheiten: 1,
    kosten: 0,
    angebot: "jedes_halbjahr",
  };
}

describe("erweitereVorhanden", () => {
  it("ergänzt Voraussetzungen transitiv (Wasserretter impliziert Basisausbildung)", () => {
    const erweitert = erweitereVorhanden(["411"], byId);
    for (const id of ["411", "152", "311_eh", "331", "161", "401", "402", "403", "404", "151"]) {
      expect(erweitert.has(id), id).toBe(true);
    }
  });
});

describe("sammleBenoetigte", () => {
  it("lässt vorhandene Qualifikationen weg", () => {
    const vorhanden = erweitereVorhanden(["152"], byId);
    const benoetigt = sammleBenoetigte(["172"], byId, vorhanden);
    expect(benoetigt).toEqual(new Set(["172"]));
  });

  it("wirft bei unbekannter Ziel-ID", () => {
    expect(() => sammleBenoetigte(["gibt_es_nicht"], byId, new Set())).toThrow(
      /Unbekannte Lehrgangs-ID/,
    );
  });
});

describe("topologischSortiert", () => {
  it("liefert Voraussetzungen immer vor ihren Nachfolgern", () => {
    const benoetigt = sammleBenoetigte(["181"], byId, new Set());
    const reihenfolge = topologischSortiert(benoetigt, byId);
    const position = new Map(reihenfolge.map((id, i) => [id, i]));
    for (const id of benoetigt) {
      for (const v of byId.get(id)!.voraussetzungen) {
        if (!benoetigt.has(v)) continue;
        expect(position.get(v)!, `${v} vor ${id}`).toBeLessThan(position.get(id)!);
      }
    }
  });

  it("erkennt Zyklen", () => {
    const zyklisch = new Map<string, Lehrgang>([
      ["a", miniKurs("a", ["b"])],
      ["b", miniKurs("b", ["a"])],
    ]);
    expect(() => topologischSortiert(new Set(["a", "b"]), zyklisch)).toThrow(ZyklusFehler);
  });
});
