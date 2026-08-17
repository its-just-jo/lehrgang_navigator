import "./style.css";
import katalogJson from "../data/lehrgaenge.json";
import angeboteJson from "../data/angebote.json";
import { indiziereKatalog } from "./lib/catalog";
import {
  aktuellesHalbjahr,
  halbjahrLabel,
  halbjahrNachSlots,
  naechstesHalbjahr,
  plane,
} from "./lib/planner";
import { uebernehmeAngebote, type AngebotsDatei } from "./lib/angebote";
import type { Halbjahr, Katalog, Plan } from "./lib/types";

const katalog = uebernehmeAngebote(
  katalogJson as unknown as Katalog,
  angeboteJson as unknown as AngebotsDatei,
);
const byId = indiziereKatalog(katalog);

const STANDARD_ZIEL = "181"; // DLRG-Lehrschein (DOSB Trainer C)
const SPEICHER_SCHLUESSEL = "lehrgang-navigator-v2";

interface Zustand {
  zielId: string;
  vorhanden: string[];
  maxProHalbjahr: number;
  alter: number | null;
  strategie: "schnell" | "guenstig";
}

function ladeZustand(): Zustand {
  const standard: Zustand = {
    zielId: STANDARD_ZIEL,
    vorhanden: [],
    maxProHalbjahr: 2,
    alter: null,
    strategie: "schnell",
  };
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return standard;
    const geladen = { ...standard, ...(JSON.parse(roh) as Partial<Zustand>) };
    if (!byId.has(geladen.zielId)) geladen.zielId = STANDARD_ZIEL;
    geladen.vorhanden = geladen.vorhanden.filter((id) => byId.has(id));
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

const zielKurse = katalog.lehrgaenge
  .filter((k) => !k.extern)
  .sort((a, b) => a.titel.localeCompare(b.titel, "de"));

function renderZielOptionen(): string {
  const gruppen = new Map<string, string[]>();
  for (const kurs of zielKurse) {
    const label = katalog.meta.kategorien[kurs.kategorie] ?? kurs.kategorie;
    const liste = gruppen.get(label) ?? [];
    liste.push(
      `<option value="${esc(kurs.id)}"${kurs.id === zustand.zielId ? " selected" : ""}>${esc(kurs.titel)}</option>`,
    );
    gruppen.set(label, liste);
  }
  return [...gruppen.entries()]
    .map(([label, optionen]) => `<optgroup label="${esc(label)}">${optionen.join("")}</optgroup>`)
    .join("");
}

function renderVorhandenBloecke(): string {
  const vorhanden = new Set(zustand.vorhanden);
  const bloecke: string[] = [];
  for (const [katId, katLabel] of Object.entries(katalog.meta.kategorien)) {
    if (katId === "system") continue;
    const kurse = katalog.lehrgaenge.filter((k) => k.kategorie === katId && !k.extern);
    if (kurse.length === 0) continue;
    const gewaehlt = kurse.filter((k) => vorhanden.has(k.id)).length;
    bloecke.push(`
      <details class="kategorie-block" data-kategorie="${esc(katId)}"${gewaehlt > 0 ? " open" : ""}>
        <summary>${esc(katLabel)}${gewaehlt > 0 ? `<span class="anzahl">${gewaehlt}</span>` : ""}</summary>
        <div class="kurs-checkboxen">
          ${kurse
            .map(
              (k) => `<label><input type="checkbox" data-vorhanden="${esc(k.id)}"${
                vorhanden.has(k.id) ? " checked" : ""
              } /> <span>${esc(k.titel)}</span></label>`,
            )
            .join("")}
        </div>
      </details>`);
  }
  return bloecke.join("");
}

function renderPlanKarte(plan: Plan, titel: string, untertitel: string, aktiv: boolean): string {
  const fertig =
    plan.dauerHalbjahre === 0
      ? "–"
      : halbjahrLabel(halbjahrNachSlots(start, plan.dauerHalbjahre - 1));
  return `
    <button type="button" class="plan-karte${aktiv ? " aktiv" : ""}" data-strategie="${plan.strategie}">
      <h3>${esc(titel)}</h3>
      <dl class="kennzahlen">
        <div><dt>Dauer</dt><dd>${plan.dauerHalbjahre} Halbjahr${plan.dauerHalbjahre === 1 ? "" : "e"}</dd></div>
        <div><dt>Kosten (geschätzt)</dt><dd>${euro(plan.kosten)}</dd></div>
        <div><dt>Lehreinheiten</dt><dd>${plan.lehreinheiten}</dd></div>
        <div><dt>Fertig</dt><dd>${esc(fertig)}</dd></div>
      </dl>
      <p style="margin:0.6rem 0 0;font-size:0.85rem;color:var(--grau)">${esc(untertitel)}${
        plan.auffrischungen.length > 0
          ? ` Enthält ${plan.auffrischungen.length} Auffrischung${plan.auffrischungen.length === 1 ? "" : "en"}.`
          : ""
      }</p>
    </button>`;
}

function renderZeitachse(plan: Plan): string {
  if (plan.slots.length === 0) return "";
  return `
    <div class="zeitachse">
      ${plan.slots
        .map((eintraege, slot) => {
          if (eintraege.length === 0) {
            return `
              <div class="slot">
                <div class="slot-titel">${esc(halbjahrLabel(halbjahrNachSlots(start, slot)))}</div>
                <ul><li class="kurs-chip" style="border-left-color:var(--linie);color:var(--grau)">Pause – keine Lehrgänge</li></ul>
              </div>`;
          }
          return `
            <div class="slot">
              <div class="slot-titel">${esc(halbjahrLabel(halbjahrNachSlots(start, slot)))}</div>
              <ul>
                ${eintraege
                  .map(
                    (e) => `
                      <li class="kurs-chip${e.auffrischung ? " auffrischung" : ""}">
                        <span class="kurs-name">${esc(e.kurs.titel)}</span>${
                          e.auffrischung ? '<span class="pill">Auffrischung</span>' : ""
                        }
                        <div class="kurs-meta">${e.kurs.lehreinheiten ?? "?"} LE · ${
                          e.kurs.kosten != null ? euro(e.kurs.kosten) : "Kosten offen"
                        } · Nr. ${esc(e.kurs.nr)}</div>
                        ${e.grund ? `<span class="grund">${esc(e.grund)}</span>` : ""}
                      </li>`,
                  )
                  .join("")}
              </ul>
            </div>`;
        })
        .join("")}
    </div>`;
}

function renderKomfortTabelle(): string {
  const zeilen: string[] = [];
  for (let n = 1; n <= 4; n++) {
    try {
      const ergebnis = plane(katalog, {
        zielIds: [zustand.zielId],
        vorhanden: zustand.vorhanden,
        maxProHalbjahr: n,
        start,
        alter: zustand.alter,
      });
      zeilen.push(`
        <tr class="${n === zustand.maxProHalbjahr ? "aktiv" : ""}">
          <td>${n} Lehrgang${n === 1 ? "" : "e"} pro Halbjahr</td>
          <td>${ergebnis.schnell.dauerHalbjahre} Halbjahre</td>
          <td>${euro(ergebnis.guenstig.kosten)}</td>
          <td>${ergebnis.guenstig.auffrischungen.length}</td>
        </tr>`);
    } catch {
      zeilen.push(`<tr><td>${n}</td><td colspan="3">nicht berechenbar</td></tr>`);
    }
  }
  return `
    <table class="komfort">
      <thead>
        <tr><th>Komfort</th><th>Dauer (schnellster Plan)</th><th>Kosten (günstigster Plan)</th><th>Auffrischungen</th></tr>
      </thead>
      <tbody>${zeilen.join("")}</tbody>
    </table>`;
}

function renderErgebnis(): string {
  let ergebnis;
  try {
    ergebnis = plane(katalog, {
      zielIds: [zustand.zielId],
      vorhanden: zustand.vorhanden,
      maxProHalbjahr: zustand.maxProHalbjahr,
      start,
      alter: zustand.alter,
    });
  } catch (fehler) {
    return `<div class="warnungen">Der Plan konnte nicht berechnet werden: ${esc(String(fehler))}</div>`;
  }

  const { schnell, guenstig, identisch } = ergebnis;
  if (schnell.kurse.length === 0) {
    return `<div class="leer-hinweis">🎉 Du erfüllst bereits alle Voraussetzungen für dieses Ziel – es ist kein weiterer Lehrgang nötig.</div>`;
  }

  const aktiverPlan = zustand.strategie === "guenstig" ? guenstig : schnell;
  const warnungen = [...new Set(aktiverPlan.warnungen)];

  return `
    ${
      identisch
        ? `<div class="hinweis-band">✅ Gute Nachricht: Der schnellste Plan ist hier zugleich der günstigste.</div>`
        : ""
    }
    <div class="vergleich" style="margin-top:0.9rem">
      ${renderPlanKarte(
        schnell,
        "🏃 Schnellster Plan",
        "Jeder Lehrgang so früh wie möglich.",
        zustand.strategie === "schnell",
      )}
      ${renderPlanKarte(
        guenstig,
        "💶 Günstigster Plan",
        "Gleiche Dauer, Lehrgänge so gelegt, dass Nachweise frisch bleiben.",
        zustand.strategie === "guenstig",
      )}
    </div>
    ${renderZeitachse(aktiverPlan)}
    ${
      aktiverPlan.externeVoraussetzungen.length > 0
        ? `
          <h2 style="margin-top:1.5rem">Außerdem selbst zu organisieren</h2>
          <ul class="extern-liste">
            ${aktiverPlan.externeVoraussetzungen
              .map((k) => `<li><strong>${esc(k.titel)}</strong> – ${esc(k.beschreibung)}</li>`)
              .join("")}
          </ul>`
        : ""
    }
    ${
      warnungen.length > 0
        ? `<div class="warnungen" style="margin-top:1rem"><ul>${warnungen
            .map((w) => `<li>${esc(w)}</li>`)
            .join("")}</ul></div>`
        : ""
    }
    <h2 style="margin-top:1.75rem">Wie viel Komfort kostet Zeit?</h2>
    ${renderKomfortTabelle()}
  `;
}

function render(): void {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `
    <header class="hero">
      <div class="hero-inner">
        <span class="badge">Prüfungsordnungen ${esc(katalog.meta.stand)} · statisch & offline nutzbar</span>
        <h1>DLRG Lehrgangs-Navigator</h1>
        <p>
          Wähle dein Ausbildungsziel, gib an, was du schon hast und wie viele Lehrgänge du pro
          Halbjahr schaffst – der Navigator berechnet deinen schnellsten und deinen günstigsten Weg,
          inklusive automatisch eingeplanter Auffrischungen für ablaufende Nachweise.
        </p>
      </div>
    </header>
    <main>
      <section class="karte">
        <h2><span class="schritt">1</span>Dein Ziel &amp; dein Tempo</h2>
        <div class="steuer-raster">
          <label class="feld">Zielqualifikation
            <select id="ziel">${renderZielOptionen()}</select>
          </label>
          <label class="feld">Dein Alter (optional, für Mindestalter)
            <input id="alter" type="number" min="8" max="99" placeholder="z. B. 17" value="${zustand.alter ?? ""}" />
          </label>
          <label class="feld">Wie viele Lehrgänge pro Halbjahr sind für dich angenehm?
            <input id="komfort" type="range" min="1" max="4" step="1" value="${zustand.maxProHalbjahr}" />
            <span class="regler-wert" id="komfort-wert">${zustand.maxProHalbjahr} Lehrgang${zustand.maxProHalbjahr === 1 ? "" : "e"} pro Halbjahr</span>
          </label>
        </div>
      </section>
      <section class="karte">
        <h2><span class="schritt">2</span>Das hast du schon</h2>
        <div id="vorhanden">${renderVorhandenBloecke()}</div>
      </section>
      <section class="karte">
        <h2><span class="schritt">3</span>Dein Weg zum Ziel <em style="color:var(--grau);font-style:normal;font-size:0.85rem">(Start: ${esc(halbjahrLabel(start))})</em></h2>
        <div id="ergebnis">${renderErgebnis()}</div>
      </section>
    </main>
    <footer class="fuss">
      <p><strong>Hinweis:</strong> ${esc(katalog.meta.hinweis_kosten)}</p>
      <p>${esc(katalog.meta.hinweis_angebot)} Verbindlich sind allein die Prüfungsordnungen und deine Gliederung.</p>
      <p>Quellen:</p>
      <ul>${katalog.meta.quellen.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
    </footer>
  `;

  app.querySelector<HTMLSelectElement>("#ziel")!.addEventListener("change", (ev) => {
    zustand.zielId = (ev.target as HTMLSelectElement).value;
    aktualisiere();
  });
  app.querySelector<HTMLInputElement>("#alter")!.addEventListener("change", (ev) => {
    const wert = (ev.target as HTMLInputElement).valueAsNumber;
    zustand.alter = Number.isFinite(wert) ? wert : null;
    aktualisiere();
  });
  app.querySelector<HTMLInputElement>("#komfort")!.addEventListener("input", (ev) => {
    zustand.maxProHalbjahr = Number((ev.target as HTMLInputElement).value);
    aktualisiere();
  });
  app.querySelector("#vorhanden")!.addEventListener("change", (ev) => {
    const ziel = ev.target as HTMLInputElement;
    const id = ziel.dataset["vorhanden"];
    if (!id) return;
    const menge = new Set(zustand.vorhanden);
    if (ziel.checked) menge.add(id);
    else menge.delete(id);
    zustand.vorhanden = [...menge];
    aktualisiere();
  });
  app.querySelector("#ergebnis")!.addEventListener("click", (ev) => {
    const karte = (ev.target as HTMLElement).closest<HTMLElement>("[data-strategie]");
    if (!karte) return;
    zustand.strategie = karte.dataset["strategie"] as "schnell" | "guenstig";
    aktualisiere();
  });
}

/** Teil-Rerender: Ergebnis + Komfortanzeige aktualisieren, Eingaben unangetastet lassen. */
function aktualisiere(): void {
  speichereZustand();
  const wert = document.querySelector<HTMLSpanElement>("#komfort-wert");
  if (wert) {
    wert.textContent = `${zustand.maxProHalbjahr} Lehrgang${zustand.maxProHalbjahr === 1 ? "" : "e"} pro Halbjahr`;
  }
  const ergebnis = document.querySelector<HTMLDivElement>("#ergebnis");
  if (ergebnis) ergebnis.innerHTML = renderErgebnis();
}

render();
