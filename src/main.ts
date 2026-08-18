import "./style.css";
import katalogJson from "../data/lehrgaenge.json";
import angeboteJson from "../data/angebote.json";
import { indiziereKatalog } from "./lib/catalog";
import { erweitereVorhanden } from "./lib/graph";
import {
  aktuellesHalbjahr,
  halbjahrLabel,
  halbjahrNachSlots,
  naechstesHalbjahr,
  plane,
} from "./lib/planner";
import { renderNetzplan } from "./netzplan";
import type {
  AngebotsDatei,
  GeplanterKurs,
  Halbjahr,
  Katalog,
  Plan,
  PlanErgebnis,
  Standort,
  SzenarioId,
} from "./lib/types";

const katalog = katalogJson as unknown as Katalog;
const angebotsDatei = angeboteJson as unknown as AngebotsDatei;
const byId = indiziereKatalog(katalog);

const STANDARD_ZIEL = "181"; // DLRG-Lehrschein (DOSB Trainer C)
const SPEICHER_SCHLUESSEL = "lehrgang-navigator-v3";
const MAX_KM_OPTIONEN = [25, 50, 100, 250];
const TEMPO_OPTIONEN = [1, 2, 3, 4];

const SZENARIO_META: Record<SzenarioId, { icon: string; titel: string; untertitel: string }> = {
  schnell: { icon: "🏃", titel: "Schnellster", untertitel: "So früh wie möglich am Ziel." },
  guenstig: { icon: "💶", titel: "Günstigster", untertitel: "Niedrigste Gesamtkosten." },
  komfort: { icon: "🛋️", titel: "Komfort", untertitel: "In deinem Wunsch-Tempo." },
  fahrt: { icon: "🚗", titel: "Wenig Fahrerei", untertitel: "Kürzeste Wege zu den Angeboten." },
  ausgewogen: { icon: "⚖️", titel: "Ausgewogen", untertitel: "Kompromiss aus allen Zielen." },
};

// Wählbare Standorte aus den hinterlegten Angeboten ableiten.
const STANDORTE: Standort[] = [
  ...new Map(
    angebotsDatei.angebote
      .filter((a) => a.ort && a.lat != null && a.lon != null)
      .map((a) => [a.ort!, { name: a.ort!, lat: a.lat!, lon: a.lon! }]),
  ).values(),
].sort((a, b) => a.name.localeCompare(b.name, "de"));

interface Zustand {
  tab: "planer" | "netz";
  zielId: string;
  vorhanden: string[];
  tempo: number | null;
  alter: number | null;
  standortName: string | null;
  maxKm: number | null;
  szenario: SzenarioId;
}

function ladeZustand(): Zustand {
  const standard: Zustand = {
    tab: "planer",
    zielId: STANDARD_ZIEL,
    vorhanden: [],
    tempo: null,
    alter: null,
    standortName: null,
    maxKm: null,
    szenario: "schnell",
  };
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return standard;
    const geladen = { ...standard, ...(JSON.parse(roh) as Partial<Zustand>) };
    if (!byId.has(geladen.zielId)) geladen.zielId = STANDARD_ZIEL;
    geladen.vorhanden = geladen.vorhanden.filter((id) => byId.has(id));
    if (!(geladen.szenario in SZENARIO_META)) geladen.szenario = "schnell";
    return geladen;
  } catch {
    return standard;
  }
}

const zustand = ladeZustand();

function speichereZustand(): void {
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(zustand));
  } catch {
    /* Privatmodus o. Ä. – Speichern ist optional. */
  }
}

const start: Halbjahr = naechstesHalbjahr(aktuellesHalbjahr());
const netzplanHtml = renderNetzplan(katalog);

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function euro(betrag: number): string {
  return betrag.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
}

function nummerTitel(kursId: string): string {
  const kurs = byId.get(kursId)!;
  return kurs.nr !== "–" ? `${kurs.nr} · ${kurs.titel}` : kurs.titel;
}

function aktuellerStandort(): Standort | null {
  return STANDORTE.find((s) => s.name === zustand.standortName) ?? null;
}

function berechne(tempo: number | null = zustand.tempo): PlanErgebnis {
  return plane(katalog, {
    zielIds: [zustand.zielId],
    vorhanden: zustand.vorhanden,
    start,
    alter: zustand.alter,
    tempo,
    standort: aktuellerStandort(),
    maxKm: zustand.maxKm,
    angebote: angebotsDatei.angebote,
  });
}

// ─── Teil-Renderer ────────────────────────────────────────────────────────

function renderZielOptionen(): string {
  const gruppen = new Map<string, string[]>();
  for (const kurs of [...katalog.lehrgaenge]
    .filter((k) => !k.extern)
    .sort((a, b) => a.titel.localeCompare(b.titel, "de"))) {
    const label = katalog.meta.kategorien[kurs.kategorie] ?? kurs.kategorie;
    const liste = gruppen.get(label) ?? [];
    liste.push(
      `<option value="${esc(kurs.id)}"${kurs.id === zustand.zielId ? " selected" : ""}>${esc(nummerTitel(kurs.id))}</option>`,
    );
    gruppen.set(label, liste);
  }
  return [...gruppen.entries()]
    .map(([label, optionen]) => `<optgroup label="${esc(label)}">${optionen.join("")}</optgroup>`)
    .join("");
}

function renderVorhandenBloecke(offene: Set<string>): string {
  const vorhanden = new Set(zustand.vorhanden);
  const bloecke: string[] = [];
  for (const [katId, katLabel] of Object.entries(katalog.meta.kategorien)) {
    if (katId === "system") continue;
    const kurse = katalog.lehrgaenge.filter((k) => k.kategorie === katId && !k.extern);
    if (kurse.length === 0) continue;
    const gewaehlt = kurse.filter((k) => vorhanden.has(k.id)).length;
    const offen = offene.has(katId) || gewaehlt > 0;
    bloecke.push(`
      <details class="kategorie-block" data-kategorie="${esc(katId)}"${offen ? " open" : ""}>
        <summary>${esc(katLabel)}${gewaehlt > 0 ? `<span class="anzahl">${gewaehlt}</span>` : ""}</summary>
        <div class="kurs-checkboxen">
          ${kurse
            .map(
              (k) => `<label><input type="checkbox" data-vorhanden="${esc(k.id)}"${
                vorhanden.has(k.id) ? " checked" : ""
              } /> <span>${esc(nummerTitel(k.id))}</span></label>`,
            )
            .join("")}
        </div>
      </details>`);
  }
  return bloecke.join("");
}

function renderSzenarioKarte(plan: Plan, aktiv: boolean): string {
  const meta = SZENARIO_META[plan.szenario];
  const fertig =
    plan.dauerHalbjahre === 0
      ? "–"
      : halbjahrLabel(halbjahrNachSlots(start, plan.dauerHalbjahre - 1));
  const fahrt =
    plan.fahrtKm != null
      ? `<div><dt>Fahrstrecke</dt><dd>${plan.fahrtKm.toLocaleString("de-DE")} km</dd></div>`
      : "";
  return `
    <button type="button" class="szenario-karte${aktiv ? " aktiv" : ""}" data-szenario="${plan.szenario}">
      <h3>${meta.icon} ${esc(meta.titel)}</h3>
      <p class="untertitel">${esc(meta.untertitel)}</p>
      <dl class="kennzahlen">
        <div><dt>Dauer</dt><dd>${plan.dauerHalbjahre} Hj.</dd></div>
        <div><dt>Kosten</dt><dd>${euro(plan.kosten)}</dd></div>
        ${fahrt}
        <div><dt>Fertig</dt><dd>${esc(fertig)}</dd></div>
      </dl>
    </button>`;
}

function renderKursChip(eintrag: GeplanterKurs): string {
  const { kurs, angebot, entfernungKm } = eintrag;
  const kosten = angebot?.kosten ?? kurs.kosten;
  const kostenText =
    kosten == null ? "Kosten offen" : `${euro(kosten)}${angebot ? "" : " (Schätzwert)"}`;
  const ortText = angebot
    ? `${esc(angebot.ort ?? "Ort offen")} · ${esc(angebot.gliederung ?? angebot.quelle)}${
        entfernungKm != null ? ` · ~${entfernungKm} km` : ""
      }`
    : "Kein konkretes Angebot hinterlegt – Ort & Gliederung offen";
  return `
    <li class="kurs-chip">
      <span class="kurs-name">${esc(kurs.titel)}</span>
      <div class="kurs-meta">${kurs.lehreinheiten ?? "?"} LE · ${kostenText} · Nr. ${esc(kurs.nr)}</div>
      <div class="kurs-ort">${ortText}</div>
    </li>`;
}

function renderZeitachse(plan: Plan): string {
  if (plan.slots.length === 0) return "";
  return `
    <div class="zeitachse">
      ${plan.slots
        .map((eintraege, slot) => {
          const titel = esc(halbjahrLabel(halbjahrNachSlots(start, slot)));
          const inhalt =
            eintraege.length === 0
              ? `<li class="kurs-chip pause">Pause – keine Lehrgänge</li>`
              : eintraege.map(renderKursChip).join("");
          return `
            <div class="slot">
              <div class="slot-titel">${titel}</div>
              <ul>${inhalt}</ul>
            </div>`;
        })
        .join("")}
    </div>`;
}

function renderTempoTabelle(): string {
  const standort = aktuellerStandort();
  const zeilen = [...TEMPO_OPTIONEN, null]
    .map((tempo) => {
      try {
        const plan = berechne(tempo).komfort;
        const label = tempo == null ? "egal (so schnell wie möglich)" : `max. ${tempo} pro Halbjahr`;
        return `
          <tr class="${tempo === zustand.tempo ? "aktiv" : ""}">
            <td>${label}</td>
            <td>${plan.dauerHalbjahre} Halbjahre</td>
            <td>${euro(plan.kosten)}</td>
            ${standort ? `<td>${plan.fahrtKm?.toLocaleString("de-DE") ?? "–"} km</td>` : ""}
          </tr>`;
      } catch {
        return `<tr><td colspan="4">nicht berechenbar</td></tr>`;
      }
    })
    .join("");
  return `
    <div class="tabellen-scroll">
      <table class="tempo-tabelle">
        <thead>
          <tr><th>Wunsch-Tempo</th><th>Dauer</th><th>Kosten</th>${standort ? "<th>Fahrstrecke</th>" : ""}</tr>
        </thead>
        <tbody>${zeilen}</tbody>
      </table>
    </div>`;
}

function renderErgebnis(): string {
  let plaene: PlanErgebnis;
  try {
    plaene = berechne();
  } catch (fehler) {
    return `<div class="warnungen">Der Plan konnte nicht berechnet werden: ${esc(String(fehler))}</div>`;
  }

  const aktiver = plaene[zustand.szenario];
  if (aktiver.kurse.length === 0) {
    return `<div class="leer-hinweis">🎉 Du erfüllst bereits alle Voraussetzungen für dieses Ziel – es ist kein weiterer Lehrgang nötig.</div>`;
  }

  const reihenfolge: SzenarioId[] = ["schnell", "guenstig", "komfort", "fahrt", "ausgewogen"];
  const warnungen = [...new Set(aktiver.warnungen)];

  return `
    <div class="szenario-raster">
      ${reihenfolge.map((id) => renderSzenarioKarte(plaene[id], id === zustand.szenario)).join("")}
    </div>
    ${
      zustand.standortName == null
        ? `<p class="feld-hinweis">Tipp: Mit Standort (oben) werden Entfernungen berechnet und das Szenario „Wenig Fahrerei" wird aussagekräftig.</p>`
        : ""
    }
    ${aktiver.variante ? `<div class="hinweis-band">🔀 ${esc(aktiver.variante)}</div>` : ""}
    ${aktiver.beschreibung ? `<div class="hinweis-band leicht">${esc(aktiver.beschreibung)}</div>` : ""}
    ${renderZeitachse(aktiver)}
    ${
      aktiver.externeVoraussetzungen.length > 0
        ? `
          <h3 class="zwischen">Außerdem selbst zu organisieren</h3>
          <ul class="extern-liste">
            ${aktiver.externeVoraussetzungen
              .map((k) => `<li><strong>${esc(k.titel)}</strong> – ${esc(k.beschreibung)}</li>`)
              .join("")}
          </ul>`
        : ""
    }
    ${
      warnungen.length > 0
        ? `<div class="warnungen"><ul>${warnungen.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
        : ""
    }
    <h3 class="zwischen">Wie viel Komfort kostet Zeit?</h3>
    ${renderTempoTabelle()}
  `;
}

function renderPlaner(): string {
  return `
    <section class="karte">
      <h2><span class="schritt">1</span>Dein Ziel</h2>
      <div class="steuer-raster">
        <label class="feld">Zielqualifikation
          <select id="ziel">${renderZielOptionen()}</select>
        </label>
        <label class="feld">Dein Alter (optional, für Mindestalter)
          <input id="alter" type="number" min="8" max="99" placeholder="z. B. 17" value="${zustand.alter ?? ""}" />
        </label>
      </div>
    </section>
    <section class="karte">
      <h2><span class="schritt">2</span>Das hast du schon</h2>
      <p class="feld-hinweis">Beim Anhaken werden Voraussetzungen und niedrigere Stufen automatisch mit angehakt
      (DRSA Silber deckt z. B. Bronze und den Erste-Hilfe-Kurs ab).</p>
      <div id="vorhanden">${renderVorhandenBloecke(new Set())}</div>
    </section>
    <section class="karte">
      <h2><span class="schritt">3</span>Dein Weg zum Ziel <em class="startinfo">(Start: ${esc(halbjahrLabel(start))})</em></h2>
      <div class="steuer-raster" id="filter">
        <label class="feld">Wunsch-Tempo (Lehrgänge pro Halbjahr)
          <select id="tempo">
            <option value=""${zustand.tempo == null ? " selected" : ""}>egal</option>
            ${TEMPO_OPTIONEN.map(
              (t) =>
                `<option value="${t}"${zustand.tempo === t ? " selected" : ""}>höchstens ${t}</option>`,
            ).join("")}
          </select>
        </label>
        <label class="feld">Dein Standort (für Entfernungen)
          <select id="standort">
            <option value=""${zustand.standortName == null ? " selected" : ""}>– keine Angabe –</option>
            ${STANDORTE.map(
              (s) =>
                `<option value="${esc(s.name)}"${zustand.standortName === s.name ? " selected" : ""}>${esc(s.name)}</option>`,
            ).join("")}
          </select>
        </label>
        <label class="feld">Maximale Entfernung zu Lehrgängen
          <select id="maxkm"${zustand.standortName == null ? " disabled" : ""}>
            <option value=""${zustand.maxKm == null ? " selected" : ""}>egal</option>
            ${MAX_KM_OPTIONEN.map(
              (km) =>
                `<option value="${km}"${zustand.maxKm === km ? " selected" : ""}>bis ${km} km</option>`,
            ).join("")}
          </select>
        </label>
      </div>
      <div id="ergebnis">${renderErgebnis()}</div>
    </section>
  `;
}

function render(): void {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <span class="marke"><span class="marke-dlrg">DLRG</span> Lehrgangs-Navigator</span>
        <nav class="tabs">
          <button type="button" data-tab="planer" class="${zustand.tab === "planer" ? "aktiv" : ""}">Planer</button>
          <button type="button" data-tab="netz" class="${zustand.tab === "netz" ? "aktiv" : ""}">Lehrgangsnetz</button>
        </nav>
      </div>
    </header>
    <div class="unterzeile">
      <div class="unterzeile-inner">
        Plane deinen Weg zu DLRG-Qualifikationen – Prüfungsordnungen ${esc(katalog.meta.stand)}
        ${angebotsDatei.beispiel ? ' · <span class="beispiel-badge">Angebote: Beispieldaten</span>' : ""}
      </div>
    </div>
    <main>
      ${
        zustand.tab === "netz"
          ? `<section class="karte"><h2>Lehrgangsnetz</h2>${netzplanHtml}</section>`
          : renderPlaner()
      }
    </main>
    <footer class="fuss">
      <p><strong>Hinweis:</strong> ${esc(katalog.meta.hinweis_kosten)}</p>
      <p>${esc(katalog.meta.hinweis_angebot)} Auffrischungen (Erste Hilfe, Sanitätswesen, Rettungsschwimmen)
      werden bewusst nicht eingeplant – ablaufende Nachweise erscheinen als Hinweis.
      Verbindlich sind allein die Prüfungsordnungen und deine Gliederung.</p>
      ${angebotsDatei.hinweis ? `<p>${esc(angebotsDatei.hinweis)}</p>` : ""}
      <p>Quellen:</p>
      <ul>${katalog.meta.quellen.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
    </footer>
  `;
}

// ─── Interaktion ──────────────────────────────────────────────────────────

function offeneKategorien(): Set<string> {
  return new Set(
    [...document.querySelectorAll<HTMLDetailsElement>("#vorhanden details[open]")].map(
      (d) => d.dataset["kategorie"]!,
    ),
  );
}

function aktualisiereErgebnis(): void {
  speichereZustand();
  const ergebnis = document.querySelector<HTMLDivElement>("#ergebnis");
  if (ergebnis) ergebnis.innerHTML = renderErgebnis();
}

function aktualisiereVorhanden(): void {
  const container = document.querySelector<HTMLDivElement>("#vorhanden");
  if (container) container.innerHTML = renderVorhandenBloecke(offeneKategorien());
}

/** Alle Qualifikationen, die `id` impliziert (Voraussetzungen + ersetzte Stufen). */
function impliziert(id: string): string[] {
  return [...erweitereVorhanden([id], byId)].filter((x) => byId.get(x)?.extern !== true);
}

document.querySelector<HTMLDivElement>("#app")!.addEventListener("click", (ev) => {
  const ziel = ev.target as HTMLElement;
  const tabKnopf = ziel.closest<HTMLElement>("[data-tab]");
  if (tabKnopf) {
    zustand.tab = tabKnopf.dataset["tab"] as "planer" | "netz";
    speichereZustand();
    render();
    return;
  }
  const karte = ziel.closest<HTMLElement>("[data-szenario]");
  if (karte) {
    zustand.szenario = karte.dataset["szenario"] as SzenarioId;
    aktualisiereErgebnis();
  }
});

document.querySelector<HTMLDivElement>("#app")!.addEventListener("change", (ev) => {
  const ziel = ev.target as HTMLElement;

  if (ziel.id === "ziel") {
    zustand.zielId = (ziel as HTMLSelectElement).value;
    aktualisiereErgebnis();
    return;
  }
  if (ziel.id === "alter") {
    const wert = (ziel as HTMLInputElement).valueAsNumber;
    zustand.alter = Number.isFinite(wert) ? wert : null;
    aktualisiereErgebnis();
    return;
  }
  if (ziel.id === "tempo") {
    const wert = (ziel as HTMLSelectElement).value;
    zustand.tempo = wert === "" ? null : Number(wert);
    aktualisiereErgebnis();
    return;
  }
  if (ziel.id === "standort") {
    const wert = (ziel as HTMLSelectElement).value;
    zustand.standortName = wert === "" ? null : wert;
    if (zustand.standortName == null) zustand.maxKm = null;
    const maxKm = document.querySelector<HTMLSelectElement>("#maxkm");
    if (maxKm) {
      maxKm.disabled = zustand.standortName == null;
      if (zustand.maxKm == null) maxKm.value = "";
    }
    aktualisiereErgebnis();
    return;
  }
  if (ziel.id === "maxkm") {
    const wert = (ziel as HTMLSelectElement).value;
    zustand.maxKm = wert === "" ? null : Number(wert);
    aktualisiereErgebnis();
    return;
  }

  const checkbox = ziel as HTMLInputElement;
  const kursId = checkbox.dataset["vorhanden"];
  if (!kursId) return;
  const menge = new Set(zustand.vorhanden);
  if (checkbox.checked) {
    for (const id of impliziert(kursId)) menge.add(id);
  } else {
    menge.delete(kursId);
    for (const id of [...menge]) {
      if (impliziert(id).includes(kursId)) menge.delete(id);
    }
  }
  zustand.vorhanden = [...menge];
  aktualisiereVorhanden();
  aktualisiereErgebnis();
});

render();
