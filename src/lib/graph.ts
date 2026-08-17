import type { Lehrgang } from "./types";

export class ZyklusFehler extends Error {}

/**
 * Erweitert vorhandene Qualifikationen transitiv: Wer einen Lehrgang
 * abgeschlossen hat, hat dessen Voraussetzungen zwangsläufig erfüllt.
 */
export function erweitereVorhanden(
  vorhanden: Iterable<string>,
  byId: Map<string, Lehrgang>,
): Set<string> {
  const ergebnis = new Set<string>();
  const stack = [...vorhanden];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (ergebnis.has(id)) continue;
    ergebnis.add(id);
    const kurs = byId.get(id);
    if (kurs) stack.push(...kurs.voraussetzungen);
  }
  return ergebnis;
}

/**
 * Sammelt alle Lehrgänge, die für die Ziele noch benötigt werden
 * (ohne bereits vorhandene Qualifikationen).
 */
export function sammleBenoetigte(
  zielIds: string[],
  byId: Map<string, Lehrgang>,
  vorhanden: Set<string>,
): Set<string> {
  const benoetigt = new Set<string>();
  const besuch = (id: string): void => {
    if (benoetigt.has(id) || vorhanden.has(id)) return;
    const kurs = byId.get(id);
    if (!kurs) throw new Error(`Unbekannte Lehrgangs-ID '${id}'`);
    benoetigt.add(id);
    for (const vid of kurs.voraussetzungen) besuch(vid);
  };
  for (const zielId of zielIds) besuch(zielId);
  return benoetigt;
}

/** Topologische Sortierung (Kahn) der benötigten Lehrgänge. */
export function topologischSortiert(
  ids: Set<string>,
  byId: Map<string, Lehrgang>,
): string[] {
  const eingangsgrad = new Map<string, number>();
  const abhaengige = new Map<string, string[]>();
  for (const id of ids) {
    const relevante = byId.get(id)!.voraussetzungen.filter((v) => ids.has(v));
    eingangsgrad.set(id, relevante.length);
    for (const v of relevante) {
      const liste = abhaengige.get(v) ?? [];
      liste.push(id);
      abhaengige.set(v, liste);
    }
  }
  const queue = [...ids].filter((id) => eingangsgrad.get(id) === 0);
  const sortiert: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sortiert.push(id);
    for (const nach of abhaengige.get(id) ?? []) {
      const neu = eingangsgrad.get(nach)! - 1;
      eingangsgrad.set(nach, neu);
      if (neu === 0) queue.push(nach);
    }
  }
  if (sortiert.length !== ids.size) {
    throw new ZyklusFehler("Zyklus in den Lehrgangs-Voraussetzungen entdeckt");
  }
  return sortiert;
}

/**
 * Länge des längsten Pfads von jedem Knoten zu einem Blatt der Abhängigen
 * ("Resthöhe"): Kurse mit großer Höhe liegen auf dem kritischen Pfad und
 * sollten früh eingeplant werden.
 */
export function restHoehen(
  ids: Set<string>,
  byId: Map<string, Lehrgang>,
): Map<string, number> {
  const sortiert = topologischSortiert(ids, byId);
  const hoehe = new Map<string, number>();
  for (const id of [...sortiert].reverse()) {
    let max = 0;
    for (const kandidat of ids) {
      if (byId.get(kandidat)!.voraussetzungen.includes(id)) {
        max = Math.max(max, (hoehe.get(kandidat) ?? 0) + 1);
      }
    }
    hoehe.set(id, max);
  }
  return hoehe;
}
