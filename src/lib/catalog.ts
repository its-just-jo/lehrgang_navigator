import type { Katalog, Lehrgang } from "./types";

export class KatalogFehler extends Error {}

/**
 * Validiert den Katalog (referentielle Integrität) und liefert eine ID-Map.
 * Wirft KatalogFehler bei unbekannten Verweisen, Duplikaten oder
 * Frische-Anforderungen ohne zugehörige Voraussetzung.
 */
export function indiziereKatalog(katalog: Katalog): Map<string, Lehrgang> {
  const byId = new Map<string, Lehrgang>();
  for (const kurs of katalog.lehrgaenge) {
    if (byId.has(kurs.id)) {
      throw new KatalogFehler(`Doppelte Lehrgangs-ID '${kurs.id}'`);
    }
    byId.set(kurs.id, kurs);
  }
  for (const kurs of katalog.lehrgaenge) {
    for (const vid of kurs.voraussetzungen) {
      if (!byId.has(vid)) {
        throw new KatalogFehler(
          `Lehrgang '${kurs.id}' verweist auf unbekannte Voraussetzung '${vid}'`,
        );
      }
    }
    for (const fid of Object.keys(kurs.frische ?? {})) {
      if (!kurs.voraussetzungen.includes(fid)) {
        throw new KatalogFehler(
          `Lehrgang '${kurs.id}' hat eine Frische-Anforderung für '${fid}', das keine Voraussetzung ist`,
        );
      }
    }
    for (const aid of kurs.auffrischung_fuer ?? []) {
      if (!byId.has(aid)) {
        throw new KatalogFehler(
          `Lehrgang '${kurs.id}' will unbekannte Qualifikation '${aid}' auffrischen`,
        );
      }
    }
    for (const eid of kurs.ersetzt ?? []) {
      if (!byId.has(eid)) {
        throw new KatalogFehler(
          `Lehrgang '${kurs.id}' will unbekannte Qualifikation '${eid}' ersetzen`,
        );
      }
    }
    for (const alternative of kurs.alternativen ?? []) {
      for (const aid of alternative) {
        if (!byId.has(aid)) {
          throw new KatalogFehler(
            `Lehrgang '${kurs.id}' nennt unbekannte Alternative '${aid}'`,
          );
        }
      }
    }
    if (!(kurs.kategorie in katalog.meta.kategorien)) {
      throw new KatalogFehler(
        `Lehrgang '${kurs.id}' hat unbekannte Kategorie '${kurs.kategorie}'`,
      );
    }
  }
  return byId;
}
