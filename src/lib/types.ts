export type Angebot = "jedes_halbjahr" | "jaehrlich";

export interface Lehrgang {
  id: string;
  nr: string;
  titel: string;
  beschreibung: string;
  kategorie: string;
  mindestalter: number | null;
  gueltigkeitsjahre: number | null;
  voraussetzungen: string[];
  hinweis?: string;
  /** Maximalalter (in Jahren) einzelner Voraussetzungen zum Zeitpunkt dieses Lehrgangs. */
  frische?: Record<string, number>;
  /** IDs von Qualifikationen, deren Gültigkeit dieser Lehrgang verlängert. */
  auffrischung_fuer?: string[];
  lehreinheiten: number | null;
  kosten: number | null;
  angebot: Angebot;
  /** Externe Voraussetzung (Arztbesuch, Mitgliedschaft …) – wird nicht als Lehrgang eingeplant. */
  extern?: boolean;
}

export interface KatalogMeta {
  title: string;
  version: string;
  stand: string;
  quellen: string[];
  hinweis_kosten: string;
  hinweis_angebot: string;
  kategorien: Record<string, string>;
}

export interface Katalog {
  meta: KatalogMeta;
  lehrgaenge: Lehrgang[];
}

/** Ein Halbjahr im Kalender: halb 1 = Januar–Juni, halb 2 = Juli–Dezember. */
export interface Halbjahr {
  jahr: number;
  halb: 1 | 2;
}

export interface GeplanterKurs {
  kurs: Lehrgang;
  /** Slot-Index relativ zum Start-Halbjahr (0 = erstes Halbjahr des Plans). */
  slot: number;
  /** true, wenn der Kurs nur zur Auffrischung einer ablaufenden Voraussetzung eingeplant wurde. */
  auffrischung: boolean;
  /** Menschlich lesbare Begründung für Auffrischungen. */
  grund?: string;
}

export interface Plan {
  strategie: "schnell" | "guenstig";
  kurse: GeplanterKurs[];
  /** kurse gruppiert nach Slot; Index = Slot. */
  slots: GeplanterKurs[][];
  externeVoraussetzungen: Lehrgang[];
  dauerHalbjahre: number;
  kosten: number;
  lehreinheiten: number;
  auffrischungen: GeplanterKurs[];
  warnungen: string[];
}

export interface PlanOptionen {
  zielIds: string[];
  vorhanden: Iterable<string>;
  maxProHalbjahr: number;
  start: Halbjahr;
  /** Aktuelles Alter in Jahren; null/undefined = Mindestalter nicht prüfen. */
  alter?: number | null;
}
