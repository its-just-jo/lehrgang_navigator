import type { Katalog } from "./types";

/** Ein konkretes Lehrgangsangebot, wie es der Crawler aus den DLRG-Seiten extrahiert. */
export interface Angebot {
  /** Katalog-ID, auf die das Angebot gemappt wurde (siehe crawler/mapping.json). */
  lehrgang_id: string;
  titel: string;
  /** Teilnahmegebühr in Euro, falls auf der Seite gefunden. */
  kosten: number | null;
  /** Termine als ISO-Datum (Beginn), falls gefunden. */
  termine: string[];
  url: string;
  quelle: string;
}

export interface AngebotsDatei {
  stand: string | null;
  angebote: Angebot[];
}

/**
 * Reale Angebote (data/angebote.json, vom Crawler erzeugt) in den Katalog
 * einspielen: Gefundene Preise ersetzen die Schätzwerte. Bei mehreren
 * Angeboten für denselben Lehrgang gilt der günstigste Preis.
 */
export function uebernehmeAngebote(katalog: Katalog, datei: AngebotsDatei): Katalog {
  if (!datei || datei.angebote.length === 0) return katalog;
  const guenstigster = new Map<string, number>();
  for (const angebot of datei.angebote) {
    if (angebot.kosten == null) continue;
    const bisher = guenstigster.get(angebot.lehrgang_id);
    if (bisher === undefined || angebot.kosten < bisher) {
      guenstigster.set(angebot.lehrgang_id, angebot.kosten);
    }
  }
  if (guenstigster.size === 0) return katalog;
  return {
    ...katalog,
    lehrgaenge: katalog.lehrgaenge.map((kurs) =>
      guenstigster.has(kurs.id) ? { ...kurs, kosten: guenstigster.get(kurs.id)! } : kurs,
    ),
  };
}
