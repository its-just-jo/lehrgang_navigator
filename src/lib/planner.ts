import {
  anbieterIndex,
  effektiveVoraussetzungen,
  erweitereVorhanden,
  restHoehen,
  sammleBenoetigte,
  topologischSortiert,
} from "./graph";
import { indiziereKatalog } from "./catalog";
import type {
  Angebot,
  GeplanterKurs,
  Halbjahr,
  Katalog,
  Lehrgang,
  Plan,
  PlanErgebnis,
  PlanOptionen,
  SzenarioId,
} from "./types";

const MAX_SLOTS = 80;
export const KAP_UNBEGRENZT = 99;

// ─── Halbjahres-Arithmetik ────────────────────────────────────────────────

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

/** Einfache Entfernung (Haversine) in Kilometern, gerundet. */
export function distanzKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (grad: number): number => (grad * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

// ─── Slot-Planung ─────────────────────────────────────────────────────────

function istVerfuegbar(kurs: Lehrgang, start: Halbjahr, slot: number): boolean {
  if (kurs.angebot === "jedes_halbjahr") return true;
  // Jährliche Lehrgänge werden vereinfachend im 1. Kalenderhalbjahr angenommen.
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

/** ASAP: jeden Lehrgang so früh wie möglich einplanen. */
function planeAsap(
  planbar: Set<string>,
  byId: Map<string, Lehrgang>,
  erfuellt: Set<string>,
  opts: PlanOptionen,
  kapazitaet: number,
): Zuordnung {
  const anbieter = anbieterIndex(planbar, byId);
  const hoehen = restHoehen(planbar, byId);
  const slotVon = new Map<string, number>();
  const offen = new Set(planbar);

  for (let s = 0; s < MAX_SLOTS && offen.size > 0; s++) {
    const bereit = [...offen].filter((id) => {
      const kurs = byId.get(id)!;
      if (!istVerfuegbar(kurs, opts.start, s)) return false;
      if (!altOk(kurs, opts.alter, s)) return false;
      return kurs.voraussetzungen.every((v) => {
        if (erfuellt.has(v)) return true;
        if (byId.get(v)!.extern === true) return true;
        const a = anbieter.get(v);
        return a !== undefined && slotVon.has(a) && slotVon.get(a)! < s;
      });
    });
    bereit.sort((a, b) => hoehen.get(b)! - hoehen.get(a)! || a.localeCompare(b));
    for (const id of bereit.slice(0, kapazitaet)) {
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
 * ALAP innerhalb des ASAP-Makespans: Lehrgänge so spät wie möglich, ohne den
 * Abschluss zu verzögern → Nachweise bleiben bei späteren Prüfungen frisch.
 */
function planeAlap(
  planbar: Set<string>,
  byId: Map<string, Lehrgang>,
  asap: Zuordnung,
  opts: PlanOptionen,
  kapazitaet: number,
  zielIds: string[],
): Zuordnung {
  const anbieter = anbieterIndex(planbar, byId);
  const slotVon = new Map<string, number>();
  const belegung = new Map<number, number>();
  const zielSet = new Set(zielIds);
  const rueckwaerts = [...topologischSortiert(planbar, byId)].reverse();

  for (const id of rueckwaerts) {
    const kurs = byId.get(id)!;
    let spaetestens: number;
    if (zielSet.has(id)) {
      spaetestens = asap.slotVon.get(id)!;
    } else {
      spaetestens = asap.makespan - 1;
      for (const [andereId, andererSlot] of slotVon) {
        if (effektiveVoraussetzungen(andereId, byId, planbar, anbieter).includes(id)) {
          spaetestens = Math.min(spaetestens, andererSlot - 1);
        }
      }
    }
    let gewaehlt = -1;
    for (let cand = spaetestens; cand >= 0; cand--) {
      if (!istVerfuegbar(kurs, opts.start, cand)) continue;
      if (!altOk(kurs, opts.alter, cand)) break;
      if ((belegung.get(cand) ?? 0) >= kapazitaet && !zielSet.has(id)) continue;
      gewaehlt = cand;
      break;
    }
    if (gewaehlt === -1) return asap;
    slotVon.set(id, gewaehlt);
    belegung.set(gewaehlt, (belegung.get(gewaehlt) ?? 0) + 1);
  }

  for (const id of planbar) {
    for (const v of effektiveVoraussetzungen(id, byId, planbar, anbieter)) {
      if (slotVon.get(v)! >= slotVon.get(id)!) return asap;
    }
  }
  return { slotVon, makespan: asap.makespan };
}

/**
 * Frische-Anforderungen prüfen (z. B. „EH ≤ 2 Jahre bei der Prüfung“).
 * Auffrischungslehrgänge werden bewusst NICHT eingeplant – Verstöße werden
 * nur als Warnung gemeldet.
 */
function pruefeFrische(
  zuordnung: Zuordnung,
  planbar: Set<string>,
  byId: Map<string, Lehrgang>,
  start: Halbjahr,
  warnungen: string[],
): void {
  const anbieter = anbieterIndex(planbar, byId);
  for (const [id, s] of zuordnung.slotVon) {
    const kurs = byId.get(id)!;
    for (const [vId, maxJahre] of Object.entries(kurs.frische ?? {})) {
      const a = anbieter.get(vId);
      if (a === undefined || !zuordnung.slotVon.has(a)) continue;
      const alterJahre = (s - zuordnung.slotVon.get(a)!) * 0.5;
      if (alterJahre > maxJahre) {
        warnungen.push(
          `„${byId.get(a)!.titel}" wäre bei „${kurs.titel}" (${halbjahrLabel(
            halbjahrNachSlots(start, s),
          )}) bereits ${alterJahre.toFixed(1).replace(".", ",")} Jahre alt (erlaubt: ${maxJahre}) – Nachweis rechtzeitig auffrischen; Auffrischungen werden nicht automatisch eingeplant.`,
        );
      }
    }
  }
}

// ─── Angebots-Zuordnung ───────────────────────────────────────────────────

type AngebotsPraeferenz = "kosten" | "distanz" | "mix";

interface AngebotsKandidat {
  angebot: Angebot;
  km: number | null;
}

function ordneAngebote(
  planbar: Set<string>,
  byId: Map<string, Lehrgang>,
  opts: PlanOptionen,
  praef: AngebotsPraeferenz,
  warnungen: string[],
): Map<string, AngebotsKandidat | null> {
  const alleAngebote = opts.angebote ?? [];
  const standort = opts.standort ?? null;
  const zuordnung = new Map<string, AngebotsKandidat | null>();

  for (const kursId of planbar) {
    const kandidaten: AngebotsKandidat[] = alleAngebote
      .filter((a) => a.lehrgang_id === kursId)
      .map((a) => ({
        angebot: a,
        km:
          standort && a.lat != null && a.lon != null
            ? distanzKm(standort.lat, standort.lon, a.lat, a.lon)
            : null,
      }));

    let imUmkreis = kandidaten;
    if (opts.maxKm != null && standort) {
      imUmkreis = kandidaten.filter((k) => k.km == null || k.km <= opts.maxKm!);
      if (kandidaten.length > 0 && imUmkreis.length === 0) {
        warnungen.push(
          `Kein Angebot für „${byId.get(kursId)!.titel}" im Umkreis von ${opts.maxKm} km – es gilt der Schätzwert aus dem Katalog.`,
        );
      }
    }
    if (imUmkreis.length === 0) {
      zuordnung.set(kursId, null);
      continue;
    }

    const maxKosten = Math.max(1, ...imUmkreis.map((k) => k.angebot.kosten ?? 0));
    const maxKmWert = Math.max(1, ...imUmkreis.map((k) => k.km ?? 0));
    const score = (k: AngebotsKandidat): number => {
      const kostenAnteil = (k.angebot.kosten ?? maxKosten) / maxKosten;
      const kmAnteil = k.km == null ? 1 : k.km / maxKmWert;
      if (praef === "kosten") return kostenAnteil * 1000 + kmAnteil;
      if (praef === "distanz") return kmAnteil * 1000 + kostenAnteil;
      return kostenAnteil + kmAnteil;
    };
    imUmkreis.sort((a, b) => score(a) - score(b));
    zuordnung.set(kursId, imUmkreis[0]!);
  }
  return zuordnung;
}

// ─── Plan-Zusammenbau ─────────────────────────────────────────────────────

interface SzenarioKonfig {
  kapazitaet: number;
  alap: boolean;
  praef: AngebotsPraeferenz;
}

interface Variante {
  zielIds: string[];
  beschreibung: string | null;
}

function bauePlan(
  szenario: SzenarioId,
  variante: Variante,
  konfig: SzenarioKonfig,
  katalog: Katalog,
  byId: Map<string, Lehrgang>,
  erfuellt: Set<string>,
  opts: PlanOptionen,
  basisWarnungen: string[],
): Plan {
  const benoetigt = sammleBenoetigte(variante.zielIds, byId, erfuellt);
  const externe = [...benoetigt]
    .filter((id) => byId.get(id)!.extern === true)
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.titel.localeCompare(b.titel, "de"));
  const planbar = new Set([...benoetigt].filter((id) => byId.get(id)!.extern !== true));

  const warnungen = [...basisWarnungen];
  const asap = planeAsap(planbar, byId, erfuellt, opts, konfig.kapazitaet);
  const zuordnung = konfig.alap
    ? planeAlap(planbar, byId, asap, opts, konfig.kapazitaet, variante.zielIds)
    : asap;
  pruefeFrische(zuordnung, planbar, byId, opts.start, warnungen);
  const angebote = ordneAngebote(planbar, byId, opts, konfig.praef, warnungen);

  const kurse: GeplanterKurs[] = [...zuordnung.slotVon.entries()]
    .map(([id, slot]) => {
      const kandidat = angebote.get(id) ?? null;
      return {
        kurs: byId.get(id)!,
        slot,
        angebot: kandidat?.angebot ?? null,
        entfernungKm: kandidat?.km ?? null,
      };
    })
    .sort((a, b) => a.slot - b.slot || a.kurs.titel.localeCompare(b.kurs.titel, "de"));

  const dauer = kurse.length === 0 ? 0 : Math.max(...kurse.map((k) => k.slot)) + 1;
  const slots: GeplanterKurs[][] = Array.from({ length: dauer }, () => []);
  for (const eintrag of kurse) slots[eintrag.slot]!.push(eintrag);

  const mitEntfernung = kurse.filter((k) => k.entfernungKm != null);
  return {
    szenario,
    kurse,
    slots,
    externeVoraussetzungen: externe,
    dauerHalbjahre: dauer,
    kosten: kurse.reduce((s, k) => s + (k.angebot?.kosten ?? k.kurs.kosten ?? 0), 0),
    lehreinheiten: kurse.reduce((s, k) => s + (k.kurs.lehreinheiten ?? 0), 0),
    fahrtKm:
      opts.standort && mitEntfernung.length > 0
        ? mitEntfernung.reduce((s, k) => s + k.entfernungKm!, 0)
        : opts.standort
          ? 0
          : null,
    maxProHalbjahr: slots.reduce((max, s) => Math.max(max, s.length), 0),
    variante: variante.beschreibung,
    beschreibung: null,
    warnungen,
  };
}

function zielVarianten(
  zielIds: string[],
  byId: Map<string, Lehrgang>,
): Variante[] {
  const varianten: Variante[] = [{ zielIds, beschreibung: null }];
  for (const zielId of zielIds) {
    const kurs = byId.get(zielId);
    for (const alternative of kurs?.alternativen ?? []) {
      const ersatzTitel = alternative
        .map((id) => `„${byId.get(id)?.titel ?? id}" (${byId.get(id)?.nr ?? id})`)
        .join(" + ");
      varianten.push({
        zielIds: [...zielIds.filter((z) => z !== zielId), ...alternative],
        beschreibung: `Statt des Kombi-Lehrgangs „${kurs!.titel}": ${ersatzTitel}.`,
      });
    }
  }
  return varianten;
}

/** Lexikographischer Vergleich von Metrik-Vektoren; kleinster gewinnt. */
function besterPlan(plaene: Plan[], metrik: (p: Plan) => number[]): Plan {
  return plaene.reduce((bester, kandidat) => {
    const a = metrik(kandidat);
    const b = metrik(bester);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      if (diff < 0) return kandidat;
      if (diff > 0) return bester;
    }
    return bester;
  });
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────

export function plane(katalog: Katalog, opts: PlanOptionen): PlanErgebnis {
  const byId = indiziereKatalog(katalog);
  const erfuellt = erweitereVorhanden(opts.vorhanden, byId);
  const varianten = zielVarianten(opts.zielIds, byId);

  const basisWarnungen: string[] = [];
  if (opts.alter == null) {
    const beispielSet = sammleBenoetigte(opts.zielIds, byId, erfuellt);
    const mitAlter = [...beispielSet]
      .map((id) => byId.get(id)!)
      .filter((k) => !k.extern && k.mindestalter != null);
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

  const rechne = (szenario: SzenarioId, konfig: SzenarioKonfig): Plan[] =>
    varianten.map((v) =>
      bauePlan(szenario, v, konfig, katalog, byId, erfuellt, opts, basisWarnungen),
    );

  const unbegrenzt = KAP_UNBEGRENZT;
  const tempoKap = opts.tempo ?? unbegrenzt;

  const schnell = besterPlan(
    rechne("schnell", { kapazitaet: unbegrenzt, alap: false, praef: "mix" }),
    (p) => [p.dauerHalbjahre, p.kurse.length, p.kosten],
  );
  const guenstig = besterPlan(
    rechne("guenstig", { kapazitaet: unbegrenzt, alap: true, praef: "kosten" }),
    (p) => [p.kosten, p.dauerHalbjahre, p.fahrtKm ?? 0],
  );
  const fahrt = besterPlan(
    rechne("fahrt", { kapazitaet: unbegrenzt, alap: false, praef: "distanz" }),
    (p) => [p.fahrtKm ?? Number.MAX_SAFE_INTEGER, p.dauerHalbjahre, p.kosten],
  );
  const komfort = besterPlan(
    rechne("komfort", { kapazitaet: tempoKap, alap: false, praef: "mix" }),
    (p) => [p.dauerHalbjahre, p.kosten],
  );
  komfort.beschreibung =
    opts.tempo == null
      ? "Tempo „egal“ – entspricht dem schnellsten Machbaren."
      : `Höchstens ${opts.tempo} Lehrgang${opts.tempo === 1 ? "" : "e"} pro Halbjahr.`;

  // Ausgewogen: kleiner Kandidatenraum über Tempo × Angebots-Präferenz,
  // bewertet mit gleichgewichteter Normalisierung aller Zielgrößen.
  const kandidaten: Plan[] = [];
  for (const kap of [1, 2, 3, unbegrenzt]) {
    for (const praef of ["kosten", "distanz", "mix"] as AngebotsPraeferenz[]) {
      kandidaten.push(
        ...rechne("ausgewogen", { kapazitaet: kap, alap: true, praef }),
      );
    }
  }
  const spann = (werte: number[]): [number, number] => [
    Math.min(...werte),
    Math.max(...werte),
  ];
  const norm = (wert: number, [min, max]: [number, number]): number =>
    max === min ? 0 : (wert - min) / (max - min);
  const dauerSpann = spann(kandidaten.map((p) => p.dauerHalbjahre));
  const kostenSpann = spann(kandidaten.map((p) => p.kosten));
  const fahrtSpann = spann(kandidaten.map((p) => p.fahrtKm ?? 0));
  const lastSpann = spann(kandidaten.map((p) => p.maxProHalbjahr));
  const ausgewogen = besterPlan(kandidaten, (p) => [
    norm(p.dauerHalbjahre, dauerSpann) +
      norm(p.kosten, kostenSpann) +
      (opts.standort ? norm(p.fahrtKm ?? 0, fahrtSpann) : 0) +
      0.5 * norm(p.maxProHalbjahr, lastSpann),
    p.dauerHalbjahre,
    p.kosten,
  ]);
  ausgewogen.beschreibung = `Gleichgewichteter Kompromiss aus Dauer, Kosten${
    opts.standort ? ", Fahrstrecke" : ""
  } und Belastung pro Halbjahr (gewählt: max. ${
    ausgewogen.maxProHalbjahr
  } Lehrgänge/Halbjahr).`;

  return { schnell, guenstig, komfort, fahrt, ausgewogen };
}
