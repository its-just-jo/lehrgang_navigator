export type Angebotsfrequenz = "jedes_halbjahr" | "jaehrlich";

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
  /** Niedrigere Qualifikationen, die diese vollständig abdeckt (z. B. deckt DRSA Silber Bronze ab). */
  ersetzt?: string[];
  /** Gleichwertige Lehrgangskombinationen (z. B. 182 + 183 statt Kombi-Lehrgang 181). */
  alternativen?: string[][];
  lehreinheiten: number | null;
  kosten: number | null;
  angebot: Angebotsfrequenz;
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
  hinweis_ersetzt?: string;
  kategorien: Record<string, string>;
}

export interface Katalog {
  meta: KatalogMeta;
  lehrgaenge: Lehrgang[];
}

/** Ein konkretes Lehrgangsangebot (Crawler-Ausgabe oder Beispieldaten). */
export interface Angebot {
  lehrgang_id: string;
  titel: string;
  kosten: number | null;
  termine: string[];
  ort: string | null;
  gliederung: string | null;
  lat: number | null;
  lon: number | null;
  url: string;
  quelle: string;
}

export interface AngebotsDatei {
  stand: string | null;
  beispiel?: boolean;
  hinweis?: string;
  angebote: Angebot[];
}

export interface Standort {
  name: string;
  lat: number;
  lon: number;
}

/** Ein Halbjahr im Kalender: halb 1 = Januar–Juni, halb 2 = Juli–Dezember. */
export interface Halbjahr {
  jahr: number;
  halb: 1 | 2;
}

export type SzenarioId = "schnell" | "guenstig" | "komfort" | "fahrt" | "ausgewogen";

export interface GeplanterKurs {
  kurs: Lehrgang;
  /** Slot-Index relativ zum Start-Halbjahr (0 = erstes Halbjahr des Plans). */
  slot: number;
  /** Zugewiesenes Angebot; null = kein (passendes) Angebot, Schätzwert gilt. */
  angebot: Angebot | null;
  /** Einfache Entfernung vom Standort in km, falls berechenbar. */
  entfernungKm: number | null;
}

export interface Plan {
  szenario: SzenarioId;
  kurse: GeplanterKurs[];
  /** kurse gruppiert nach Slot; Index = Slot. */
  slots: GeplanterKurs[][];
  externeVoraussetzungen: Lehrgang[];
  dauerHalbjahre: number;
  kosten: number;
  lehreinheiten: number;
  /** Summe der einfachen Entfernungen (nur Kurse mit bekannter Entfernung); null ohne Standort. */
  fahrtKm: number | null;
  /** Höchste Kurszahl in einem Halbjahr. */
  maxProHalbjahr: number;
  /** Beschreibung der gewählten Variante (z. B. getrennte Lehrgänge statt Kombi), sonst null. */
  variante: string | null;
  /** Zusatzinfo zur Optimierung (z. B. gewähltes Tempo im Ausgewogen-Szenario). */
  beschreibung: string | null;
  warnungen: string[];
}

export interface PlanOptionen {
  zielIds: string[];
  vorhanden: Iterable<string>;
  start: Halbjahr;
  /** Aktuelles Alter in Jahren; null/undefined = Mindestalter nicht prüfen. */
  alter?: number | null;
  /** Wunsch-Tempo (max. Lehrgänge pro Halbjahr) für das Komfort-Szenario; null = egal. */
  tempo?: number | null;
  standort?: Standort | null;
  /** Maximale einfache Entfernung zu Angeboten in km; null = egal. */
  maxKm?: number | null;
  angebote?: Angebot[];
}

export type PlanErgebnis = Record<SzenarioId, Plan>;
