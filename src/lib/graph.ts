import type { Lehrgang } from "./types";

export class ZyklusFehler extends Error {}

/**
 * Für jede Qualifikation die Menge der höherwertigen Qualifikationen, die sie
 * vollständig abdecken (transitiv über `ersetzt`: DRSA Gold deckt Silber und
 * damit auch Bronze ab).
 */
export function ersetztDurch(byId: Map<string, Lehrgang>): Map<string, Set<string>> {
  const decktAb = new Map<string, Set<string>>();
  const abdeckung = (id: string, besucht: Set<string>): Set<string> => {
    const bekannt = decktAb.get(id);
    if (bekannt) return bekannt;
    if (besucht.has(id)) throw new ZyklusFehler(`Zyklus in 'ersetzt' bei '${id}'`);
    besucht.add(id);
    const menge = new Set<string>();
    for (const e of byId.get(id)?.ersetzt ?? []) {
      menge.add(e);
      for (const tiefer of abdeckung(e, besucht)) menge.add(tiefer);
    }
    decktAb.set(id, menge);
    return menge;
  };
  for (const id of byId.keys()) abdeckung(id, new Set());

  const ersetzer = new Map<string, Set<string>>();
  for (const [hoch, niedrige] of decktAb) {
    for (const niedrig of niedrige) {
      const menge = ersetzer.get(niedrig) ?? new Set<string>();
      menge.add(hoch);
      ersetzer.set(niedrig, menge);
    }
  }
  return ersetzer;
}

/**
 * Erweitert vorhandene Qualifikationen transitiv: Wer einen Lehrgang
 * abgeschlossen hat, erfüllt dessen Voraussetzungen und alles, was er ersetzt.
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
    if (kurs) stack.push(...kurs.voraussetzungen, ...(kurs.ersetzt ?? []));
  }
  return ergebnis;
}

/**
 * Sammelt alle Lehrgänge, die für die Ziele noch benötigt werden. Bereits
 * vorhandene (erweiterte) Qualifikationen entfallen; anschließend werden
 * Lehrgänge gestrichen, die durch einen höherwertigen Lehrgang im selben Plan
 * abgedeckt sind (DRSA Silber im Plan → kein separates Bronze).
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

  const ersetzer = ersetztDurch(byId);
  const ziele = new Set(zielIds);
  for (const id of [...benoetigt]) {
    if (ziele.has(id)) continue;
    const hoehere = ersetzer.get(id);
    if (hoehere && [...hoehere].some((h) => benoetigt.has(h))) {
      benoetigt.delete(id);
    }
  }
  return benoetigt;
}

/**
 * Liefert für jede Voraussetzungs-ID den Lehrgang aus `planbar`, der sie im
 * Plan tatsächlich erfüllt: sie selbst oder ein höherwertiger Ersatz.
 */
export function anbieterIndex(
  planbar: Set<string>,
  byId: Map<string, Lehrgang>,
): Map<string, string> {
  const ersetzer = ersetztDurch(byId);
  const anbieter = new Map<string, string>();
  for (const id of planbar) {
    for (const v of byId.get(id)!.voraussetzungen) {
      if (planbar.has(v)) {
        anbieter.set(v, v);
        continue;
      }
      const hoehere = ersetzer.get(v);
      const ersatz = hoehere && [...hoehere].find((h) => planbar.has(h));
      if (ersatz) anbieter.set(v, ersatz);
    }
  }
  return anbieter;
}

/** Effektive Voraussetzungen innerhalb des Plans (nach Ersetzung). */
function effektiveVoraussetzungen(
  id: string,
  byId: Map<string, Lehrgang>,
  planbar: Set<string>,
  anbieter: Map<string, string>,
): string[] {
  const ergebnis: string[] = [];
  for (const v of byId.get(id)!.voraussetzungen) {
    const a = anbieter.get(v);
    if (a !== undefined && planbar.has(a) && a !== id) ergebnis.push(a);
  }
  return ergebnis;
}

/** Topologische Sortierung (Kahn) der benötigten Lehrgänge (mit Ersetzungen). */
export function topologischSortiert(
  ids: Set<string>,
  byId: Map<string, Lehrgang>,
): string[] {
  const anbieter = anbieterIndex(ids, byId);
  const eingangsgrad = new Map<string, number>();
  const abhaengige = new Map<string, string[]>();
  for (const id of ids) {
    const relevante = effektiveVoraussetzungen(id, byId, ids, anbieter);
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
  const anbieter = anbieterIndex(ids, byId);
  const sortiert = topologischSortiert(ids, byId);
  const hoehe = new Map<string, number>();
  for (const id of [...sortiert].reverse()) {
    let max = 0;
    for (const kandidat of ids) {
      if (effektiveVoraussetzungen(kandidat, byId, ids, anbieter).includes(id)) {
        max = Math.max(max, (hoehe.get(kandidat) ?? 0) + 1);
      }
    }
    hoehe.set(id, max);
  }
  return hoehe;
}

export { effektiveVoraussetzungen };
