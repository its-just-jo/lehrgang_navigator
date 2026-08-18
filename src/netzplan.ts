import type { Katalog, Lehrgang } from "./lib/types";

/**
 * "U-Bahn-Plan" aller Lehrgänge: Jede Kategorie ist eine Linie mit eigener
 * Farbe, jeder Lehrgang eine Station. Die horizontale Position entspricht der
 * Ausbildungstiefe (wie viele Stufen an Voraussetzungen davor liegen);
 * kategorieübergreifende Voraussetzungen erscheinen als graue Querverbindungen.
 * Bewusst stark vereinfacht, damit der Plan lesbar bleibt.
 */

const LINIEN_FARBEN: Record<string, string> = {
  schwimmabzeichen: "#009fe3",
  rettungsschwimmabzeichen: "#e30613",
  medizin: "#00983a",
  wasserrettungsdienst: "#f0b400",
  stroemungsrettung: "#f39200",
  tauchen: "#004f9f",
  bootswesen: "#7b4fb5",
  sprechfunk: "#8d6e63",
  katastrophenschutz: "#607d8b",
  lehrscheine_schwimmen: "#d81b60",
  lehrscheine_einsatz: "#5d4037",
  lehrscheine_medizin: "#2e7d32",
  trainer_lizenzen: "#00897b",
};

const X0 = 30;
const DX = 210;
const STATION_DY = 30;
const LINIEN_ABSTAND = 44;

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function kurzTitel(kurs: Lehrgang): string {
  let titel = kurs.titel.split(" – ")[0]!.split(" — ")[0]!;
  if (titel.length > 30) titel = titel.slice(0, 29).trimEnd() + "…";
  return titel;
}

export function renderNetzplan(katalog: Katalog): string {
  const kurse = katalog.lehrgaenge.filter((k) => !k.extern);
  const byId = new Map(kurse.map((k) => [k.id, k]));

  // Ausbildungstiefe = längste Kette nicht-externer Voraussetzungen davor.
  const tiefe = new Map<string, number>();
  const berechneTiefe = (id: string, pfad: Set<string>): number => {
    if (tiefe.has(id)) return tiefe.get(id)!;
    if (pfad.has(id)) return 0;
    pfad.add(id);
    const kurs = byId.get(id)!;
    const relevante = kurs.voraussetzungen.filter((v) => byId.has(v));
    const wert =
      relevante.length === 0
        ? 0
        : 1 + Math.max(...relevante.map((v) => berechneTiefe(v, pfad)));
    tiefe.set(id, wert);
    return wert;
  };
  for (const kurs of kurse) berechneTiefe(kurs.id, new Set());

  // Stationen je Linie (= Kategorie) platzieren.
  const kategorien = Object.keys(katalog.meta.kategorien).filter((kat) =>
    kurse.some((k) => k.kategorie === kat),
  );
  const position = new Map<string, { x: number; y: number }>();
  let y = 60;
  const linienInfo: { kat: string; label: string; farbe: string; stationen: Lehrgang[] }[] = [];

  for (const kat of kategorien) {
    const stationen = kurse
      .filter((k) => k.kategorie === kat)
      .sort((a, b) => tiefe.get(a.id)! - tiefe.get(b.id)! || a.nr.localeCompare(b.nr, "de"));
    const proTiefe = new Map<number, number>();
    let maxStapel = 1;
    for (const kurs of stationen) {
      const t = tiefe.get(kurs.id)!;
      const stapel = proTiefe.get(t) ?? 0;
      proTiefe.set(t, stapel + 1);
      maxStapel = Math.max(maxStapel, stapel + 1);
      position.set(kurs.id, { x: X0 + 130 + t * DX, y: y + stapel * STATION_DY });
    }
    linienInfo.push({
      kat,
      label: katalog.meta.kategorien[kat] ?? kat,
      farbe: LINIEN_FARBEN[kat] ?? "#666",
      stationen,
    });
    y += (maxStapel - 1) * STATION_DY + LINIEN_ABSTAND;
  }

  const maxTiefe = Math.max(...[...tiefe.values()]);
  const breite = X0 + 130 + (maxTiefe + 1) * DX + 240;
  const hoehe = y + 20;

  const teile: string[] = [];

  // Querverbindungen (kategorieübergreifende Voraussetzungen) zuerst – liegen hinten.
  for (const kurs of kurse) {
    const nach = position.get(kurs.id)!;
    for (const v of kurs.voraussetzungen) {
      const vk = byId.get(v);
      if (!vk || vk.kategorie === kurs.kategorie) continue;
      const von = position.get(v)!;
      const mx = (von.x + nach.x) / 2;
      teile.push(
        `<path d="M ${von.x} ${von.y} C ${mx} ${von.y}, ${mx} ${nach.y}, ${nach.x} ${nach.y}" fill="none" stroke="#b9c2c9" stroke-width="1.4" stroke-dasharray="5 4" />`,
      );
    }
  }

  // Linien: Stationen einer Kategorie in Tiefen-Reihenfolge verbinden.
  for (const linie of linienInfo) {
    if (linie.stationen.length > 1) {
      const punkte = linie.stationen.map((k) => position.get(k.id)!);
      const pfad = punkte
        .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
        .join(" ");
      teile.push(
        `<path d="${pfad}" fill="none" stroke="${linie.farbe}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />`,
      );
    }
    const erste = position.get(linie.stationen[0]!.id)!;
    teile.push(
      `<text x="${X0}" y="${erste.y + 4}" font-size="11" font-weight="bold" fill="${linie.farbe}">${esc(
        linie.label.length > 22 ? linie.label.slice(0, 21) + "…" : linie.label,
      )}</text>`,
    );
  }

  // Stationen mit Beschriftung; Umsteigebahnhöfe (kategorieübergreifend
  // benötigt) bekommen einen Doppelring.
  const istUmstieg = new Set<string>();
  for (const kurs of kurse) {
    for (const v of kurs.voraussetzungen) {
      const vk = byId.get(v);
      if (vk && vk.kategorie !== kurs.kategorie) istUmstieg.add(v);
    }
  }
  for (const linie of linienInfo) {
    for (const kurs of linie.stationen) {
      const p = position.get(kurs.id)!;
      if (istUmstieg.has(kurs.id)) {
        teile.push(
          `<circle cx="${p.x}" cy="${p.y}" r="9" fill="#fff" stroke="#333" stroke-width="1.5" />`,
        );
      }
      teile.push(
        `<circle cx="${p.x}" cy="${p.y}" r="6" fill="#fff" stroke="${linie.farbe}" stroke-width="3"><title>${esc(
          `${kurs.nr !== "–" ? kurs.nr + " · " : ""}${kurs.titel}`,
        )}</title></circle>`,
      );
      teile.push(
        `<text x="${p.x + 13}" y="${p.y - 2}" font-size="10.5" fill="#555">${esc(
          kurs.nr !== "–" ? kurs.nr : "",
        )}</text>`,
        `<text x="${p.x + 13}" y="${p.y + 10}" font-size="11" font-weight="600" fill="#222">${esc(
          kurzTitel(kurs),
        )}</text>`,
      );
    }
  }

  const legende = linienInfo
    .map(
      (l) =>
        `<span class="netz-legende-eintrag"><span class="netz-farbe" style="background:${l.farbe}"></span>${esc(l.label)}</span>`,
    )
    .join("");

  return `
    <p class="netz-intro">
      Jede Farbe ist eine Ausbildungslinie, jeder Punkt ein Lehrgang. Je weiter rechts,
      desto mehr Ausbildungsstufen liegen davor. Gestrichelte graue Verbindungen sind
      Voraussetzungen aus einer anderen Linie – Stationen mit Doppelring sind solche
      „Umsteigebahnhöfe". Fahre mit der Maus über eine Station für den vollen Titel.
    </p>
    <div class="netz-legende">${legende}</div>
    <div class="netz-scroll">
      <svg viewBox="0 0 ${breite} ${hoehe}" width="${breite}" height="${hoehe}" role="img"
           aria-label="Netzplan aller DLRG-Lehrgänge" font-family="Arial, sans-serif">
        ${teile.join("\n")}
      </svg>
    </div>`;
}
