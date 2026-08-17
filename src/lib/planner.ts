import { auffrischungsIndex, indiziereKatalog } from "./catalog";
import { erweitereVorhanden, restHoehen, sammleBenoetigte, topologischSortiert } from "./graph";
import type {
  GeplanterKurs,
  Halbjahr,
  Katalog,
  Lehrgang,
  Plan,
  PlanOptionen,
} from "./types";

const MAX_SLOTS = 80;

export function aktuellesHalbjahr(datum: Date = new Date()): Halbjahr {
  return { jahr: datum.getFullYear(), halb: datum.getMonth() < 6 ? 1 : 2 };
}

export function naechstesHalbjahr(h: Halbjahr): Halbjahr {
  return halbjahrNachSlots(h, 1);
}

export function halbjahrNachSlots(start: Halbjahr, slots: number): Halbjahr {
  const absolut = start.jahr * 2 + (start.halb - 1) + slots;
  return { jahr: Math.floor(absolut / 2), halb: ((absolut % 2) + 1) as 1 | 2 };
}

export function halbjahrLabel(h: Halbjahr): string {
  return `${h.jahr} · ${h.halb}. Halbjahr`;
}

function istVerfuegbar(kurs: Lehrgang, start: Halbjahr, slot: number): boolean {
  if (kurs.angebot === "jedes_halbjahr") return true;
  // Jährliche Lehrgänge werden vereinfachend im 1. Halbjahr angenommen.
  return halbjahrNachSlots(start, slot).halb === 1;
}

function altOk(kurs: Lehrgang, alter: number | null | undefined, slot: number): boolean {
  if (alter == null || kurs.mindestalter == null) return true;
  return alter + slot * 0.5 >= kurs.mindestalter;
}

interface Zuordnung {
  slotVon: Map<string, number>;
  makespan: number;
}

/** ASAP: jeden Lehrgang so früh wie möglich einplanen → schnellster Plan. */
function planeAsap(
  planbar: Set<string>,
  byId: Map<string, Lehrgang>,
  vorhanden: Set<string>,
  opts: PlanOptionen,
): Zuordnung {
  const hoehen = restHoehen(planbar, byId);
  const slotVon = new Map<string, number>();
  const offen = new Set(planbar);

  for (let s = 0; s < MAX_SLOTS && offen.size > 0; s++) {
    const bereit = [...offen].filter((id) => {
      const kurs = byId.get(id)!;
      if (!istVerfuegbar(kurs, opts.start, s)) return false;
      if (!altOk(kurs, opts.alter, s)) return false;
      return kurs.voraussetzungen.every(
        (v) =>
          vorhanden.has(v) ||
          byId.get(v)!.extern === true ||
          (slotVon.has(v) && slotVon.get(v)! < s),
      );
    });
    bereit.sort(
      (a, b) => hoehen.get(b)! - hoehen.get(a)! || a.localeCompare(b),
    );
    for (const id of bereit.slice(0, opts.maxProHalbjahr)) {
      slotVon.set(id, s);
      offen.delete(id);
    }
  }
  if (offen.size > 0) {
    throw new Error(
      `Plan nicht berechenbar – folgende Lehrgänge konnten nicht eingeplant werden: ${[...offen].join(", ")}`,
    );
  }
  const makespan = Math.max(-1, ...slotVon.values()) + 1;
  return { slotVon, makespan };
}

/**
 * ALAP innerhalb des ASAP-Makespans: jeden Lehrgang so spät wie möglich legen,
 * ohne den Abschluss zu verzögern. Voraussetzungen bleiben dadurch bei der
 * Prüfung möglichst frisch → weniger Auffrischungslehrgänge → günstiger.
 * Ziel-Lehrgänge behalten ihren ASAP-Slot.
 */
function planeAlap(
  planbar: Set<string>,
  byId: Map<string, Lehrgang>,
  asap: Zuordnung,
  opts: PlanOptionen,
): Zuordnung {
  const slotVon = new Map<string, number>();
  const belegung = new Map<number, number>();
  const zielSet = new Set(opts.zielIds);
  const rueckwaerts = [...topologischSortiert(planbar, byId)].reverse();

  for (const id of rueckwaerts) {
    const kurs = byId.get(id)!;
    let spaetestens: number;
    if (zielSet.has(id)) {
      spaetestens = asap.slotVon.get(id)!;
    } else {
      spaetestens = asap.makespan - 1;
      for (const [andereId, andererSlot] of slotVon) {
        if (byId.get(andereId)!.voraussetzungen.includes(id)) {
          spaetestens = Math.min(spaetestens, andererSlot - 1);
        }
      }
    }
    let gewaehlt = -1;
    for (let cand = spaetestens; cand >= 0; cand--) {
      if (!istVerfuegbar(kurs, opts.start, cand)) continue;
      if (!altOk(kurs, opts.alter, cand)) break;
      if ((belegung.get(cand) ?? 0) >= opts.maxProHalbjahr && !zielSet.has(id)) continue;
      gewaehlt = cand;
      break;
    }
    if (gewaehlt === -1) {
      // Kein gültiger späterer Slot gefunden → ASAP-Zuordnung ist die sichere Rückfalllösung.
      return asap;
    }
    slotVon.set(id, gewaehlt);
    belegung.set(gewaehlt, (belegung.get(gewaehlt) ?? 0) + 1);
  }

  // Sicherheitsnetz: Reihenfolge der Voraussetzungen muss weiterhin stimmen.
  for (const id of planbar) {
    const kurs = byId.get(id)!;
    for (const v of kurs.voraussetzungen) {
      if (slotVon.has(v) && slotVon.get(v)! >= slotVon.get(id)!) {
        return asap;
      }
    }
  }
  return { slotVon, makespan: asap.makespan };
}

/**
 * Prüft Frische-Anforderungen (z. B. "EH ≤ 2 Jahre bei der Lehrschein-Prüfung")
 * und plant bei Verstößen Auffrischungslehrgänge so spät wie möglich ein.
 * Fehlt ein Auffrischungslehrgang im Katalog, wird der Kurs selbst wiederholt.
 */
function repariereFrische(
  zuordnung: Zuordnung,
  byId: Map<string, Lehrgang>,
  auffrischer: Map<string, Lehrgang>,
  vorhanden: Set<string>,
  opts: PlanOptionen,
  warnungen: string[],
): GeplanterKurs[] {
  const auffrischungen: GeplanterKurs[] = [];
  const zuletztErworben = new Map<string, number>();
  for (const id of vorhanden) zuletztErworben.set(id, -1);

  const proSlot = new Map<number, string[]>();
  for (const [id, slot] of zuordnung.slotVon) {
    const liste = proSlot.get(slot) ?? [];
    liste.push(id);
    proSlot.set(slot, liste);
  }

  for (let s = 0; s < zuordnung.makespan; s++) {
    for (const id of proSlot.get(s) ?? []) {
      const kurs = byId.get(id)!;
      for (const [vId, maxJahre] of Object.entries(kurs.frische ?? {})) {
        const erworben = zuletztErworben.get(vId);
        if (erworben === undefined) continue; // extern oder nicht planbar
        const alterJahre = (s - erworben) * 0.5;
        if (alterJahre <= maxJahre) continue;

        const ersatz = auffrischer.get(vId) ?? byId.get(vId)!;
        let gewaehlt = -1;
        for (let cand = s; cand > erworben; cand--) {
          if ((s - cand) * 0.5 > maxJahre) break;
          if (istVerfuegbar(ersatz, opts.start, cand)) {
            gewaehlt = cand;
            break;
          }
        }
        if (gewaehlt === -1) {
          gewaehlt = s;
          warnungen.push(
            `Auffrischung „${ersatz.titel}" musste ohne passenden Termin in Slot ${s + 1} gelegt werden – Angebot vor Ort prüfen.`,
          );
        }
        auffrischungen.push({
          kurs: ersatz,
          slot: gewaehlt,
          auffrischung: true,
          grund: `„${byId.get(vId)!.titel}" wäre bei „${kurs.titel}" sonst älter als ${maxJahre} ${maxJahre === 1 ? "Jahr" : "Jahre"}.`,
        });
        zuletztErworben.set(vId, gewaehlt);
      }
    }
    for (const id of proSlot.get(s) ?? []) {
      zuletztErworben.set(id, s);
      for (const aufgefrischt of byId.get(id)!.auffrischung_fuer ?? []) {
        if (zuletztErworben.has(aufgefrischt)) zuletztErworben.set(aufgefrischt, s);
      }
    }
  }
  return auffrischungen;
}

function bauePlan(
  strategie: "schnell" | "guenstig",
  zuordnung: Zuordnung,
  byId: Map<string, Lehrgang>,
  externe: Lehrgang[],
  auffrischungen: GeplanterKurs[],
  warnungen: string[],
): Plan {
  const kurse: GeplanterKurs[] = [
    ...[...zuordnung.slotVon.entries()].map(([id, slot]) => ({
      kurs: byId.get(id)!,
      slot,
      auffrischung: false,
    })),
    ...auffrischungen,
  ].sort(
    (a, b) => a.slot - b.slot || a.kurs.titel.localeCompare(b.kurs.titel, "de"),
  );

  const dauer = kurse.length === 0 ? 0 : Math.max(...kurse.map((k) => k.slot)) + 1;
  const slots: GeplanterKurs[][] = Array.from({ length: dauer }, () => []);
  for (const eintrag of kurse) slots[eintrag.slot]!.push(eintrag);

  return {
    strategie,
    kurse,
    slots,
    externeVoraussetzungen: externe,
    dauerHalbjahre: dauer,
    kosten: kurse.reduce((summe, k) => summe + (k.kurs.kosten ?? 0), 0),
    lehreinheiten: kurse.reduce((summe, k) => summe + (k.kurs.lehreinheiten ?? 0), 0),
    auffrischungen,
    warnungen,
  };
}

export interface PlanErgebnis {
  schnell: Plan;
  guenstig: Plan;
  /** true, wenn beide Strategien denselben Plan ergeben. */
  identisch: boolean;
}

export function plane(katalog: Katalog, opts: PlanOptionen): PlanErgebnis {
  const byId = indiziereKatalog(katalog);
  const auffrischer = auffrischungsIndex(katalog);
  const vorhanden = erweitereVorhanden(opts.vorhanden, byId);
  const benoetigt = sammleBenoetigte(opts.zielIds, byId, vorhanden);

  const externe = [...benoetigt]
    .filter((id) => byId.get(id)!.extern === true)
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.titel.localeCompare(b.titel, "de"));
  const planbar = new Set([...benoetigt].filter((id) => byId.get(id)!.extern !== true));

  const basisWarnungen: string[] = [];
  if (opts.alter == null) {
    const mitAlter = [...planbar]
      .map((id) => byId.get(id)!)
      .filter((k) => k.mindestalter != null);
    if (mitAlter.length > 0) {
      basisWarnungen.push(
        "Ohne Altersangabe werden Mindestalter nicht geprüft (z. B. " +
          mitAlter
            .slice(0, 3)
            .map((k) => `${k.mindestalter} J. für „${k.titel}"`)
            .join(", ") +
          ").",
      );
    }
  }

  const asap = planeAsap(planbar, byId, vorhanden, opts);
  const alap = planeAlap(planbar, byId, asap, opts);

  const schnellWarnungen = [...basisWarnungen];
  const schnellAuffrischungen = repariereFrische(
    asap, byId, auffrischer, vorhanden, opts, schnellWarnungen,
  );
  const guenstigWarnungen = [...basisWarnungen];
  const guenstigAuffrischungen = repariereFrische(
    alap, byId, auffrischer, vorhanden, opts, guenstigWarnungen,
  );

  const schnell = bauePlan("schnell", asap, byId, externe, schnellAuffrischungen, schnellWarnungen);
  const guenstig = bauePlan("guenstig", alap, byId, externe, guenstigAuffrischungen, guenstigWarnungen);

  const identisch =
    schnell.kosten === guenstig.kosten &&
    schnell.dauerHalbjahre === guenstig.dauerHalbjahre &&
    JSON.stringify(schnell.kurse.map((k) => [k.kurs.id, k.slot])) ===
      JSON.stringify(guenstig.kurse.map((k) => [k.kurs.id, k.slot]));

  return { schnell, guenstig, identisch };
}
