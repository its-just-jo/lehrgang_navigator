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
    for (const id of ["411", "152", "311_eh", "331", "161", "401", "402", "403", "404"]) {
      expect(erweitert.has(id), id).toBe(true);
    }
  });

  it("deckt über 'ersetzt' niedrigere Stufen ab: Silber impliziert Bronze und EH", () => {
    const erweitert = erweitereVorhanden(["152"], byId);
    expect(erweitert.has("151")).toBe(true);
    expect(erweitert.has("311_eh")).toBe(true);
  });

  it("DRSA Gold impliziert transitiv auch Bronze", () => {
    const erweitert = erweitereVorhanden(["153"], byId);
    expect(erweitert.has("152")).toBe(true);
    expect(erweitert.has("151")).toBe(true);
  });
});

describe("sammleBenoetigte", () => {
  it("lässt vorhandene Qualifikationen weg", () => {
    const vorhanden = erweitereVorhanden(["152"], byId);
    const benoetigt = sammleBenoetigte(["172"], byId, vorhanden);
    expect(benoetigt).toEqual(new Set(["172"]));
  });

  it("streicht Lehrgänge, die ein höherwertiger Lehrgang im Plan abdeckt", () => {
    // Für den Lehrschein ist DRSA Silber ohnehin nötig – ein separates
    // Bronze (Voraussetzung des Ausbildungsassistenten) entfällt damit.
    const benoetigt = sammleBenoetigte(["181"], byId, new Set());
    expect(benoetigt.has("152")).toBe(true);
    expect(benoetigt.has("151")).toBe(false);
  });

  it("wirft bei unbekannter Ziel-ID", () => {
    expect(() => sammleBenoetigte(["gibt_es_nicht"], byId, new Set())).toThrow(
      /Unbekannte Lehrgangs-ID/,
    );
  });
});

describe("topologischSortiert", () => {
  it("liefert Voraussetzungen immer vor ihren Nachfolgern (inkl. Ersetzungen)", () => {
    const benoetigt = sammleBenoetigte(["181"], byId, new Set());
    const reihenfolge = topologischSortiert(benoetigt, byId);
    const position = new Map(reihenfolge.map((id, i) => [id, i]));
    // 152 erfüllt die Bronze-Anforderung des Ausbildungsassistenten (171)
    // und muss daher vor 171 liegen.
    expect(position.get("152")!).toBeLessThan(position.get("171")!);
    expect(position.get("311_eh")!).toBeLessThan(position.get("152")!);
    expect(position.get("180")!).toBeLessThan(position.get("181")!);
  });

  it("erkennt Zyklen", () => {
    const zyklisch = new Map<string, Lehrgang>([
      ["a", miniKurs("a", ["b"])],
      ["b", miniKurs("b", ["a"])],
    ]);
    expect(() => topologischSortiert(new Set(["a", "b"]), zyklisch)).toThrow(ZyklusFehler);
  });
});
