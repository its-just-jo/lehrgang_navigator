import type { Katalog, Lehrgang } from "./lib/types";

/**
 * "U-Bahn-Plan" aller Lehrgänge in zwei Ansichten:
 *
 * - "linien": Horizontale Altersachse (frühestmögliches Alter entlang der
 *   Voraussetzungen). Durchgezogene farbige Kanten sind ECHTE Abhängigkeiten
 *   innerhalb einer Linie (= Kategorie) – Fortbildungen u. Ä. enden sichtbar
 *   als Sackgassen-Äste. Kategorieübergreifende Voraussetzungen sind
 *   gestrichelt und erscheinen erst beim Klick/Touch auf eine Station.
 * - "radial": gleiche Logik polar – innen 0 Jahre (Seepferdchen & Co.),
 *   nach außen steigt das Alter; jede Kategorie ist ein Sektor.
 */

export const LINIEN_FARBEN: Record<string, string> = {
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

export type NetzAnsicht = "linien" | "radial";

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function kurzTitel(kurs: Lehrgang, max = 30): string {
  let titel = kurs.titel.split(" – ")[0]!.split(" — ")[0]!;
  if (titel.length > max) titel = titel.slice(0, max - 1).trimEnd() + "…";
  return titel;
}

interface NetzModell {
  kurse: Lehrgang[];
  byId: Map<string, Lehrgang>;
  /** Frühestmögliches Alter (Mindestalter entlang aller Voraussetzungen). */
  effAlter: Map<string, number>;
  /** Darstellungsalter: wie effAlter, aber Ketten gleicher Altersstufe werden gespreizt. */
  darstellungsAlter: Map<string, number>;
  kanten: { von: string; nach: string; gleicheLinie: boolean }[];
  kategorien: string[];
  maxAlter: number;
}

const KETTEN_SCHRITT = 0.8; // "Jahre" Versatz pro Ausbildungsschritt auf gleicher Altersstufe

function baueModell(katalog: Katalog): NetzModell {
  const kurse = katalog.lehrgaenge.filter((k) => !k.extern);
  const byId = new Map(kurse.map((k) => [k.id, k]));

  const effAlter = new Map<string, number>();
  const darstellungsAlter = new Map<string, number>();
  const rechne = (id: string, pfad: Set<string>): void => {
    if (darstellungsAlter.has(id) || pfad.has(id)) return;
    pfad.add(id);
    const kurs = byId.get(id)!;
    const vor = kurs.voraussetzungen.filter((v) => byId.has(v));
    for (const v of vor) rechne(v, pfad);
    const eff = Math.max(
      kurs.mindestalter ?? 0,
      ...vor.map((v) => effAlter.get(v) ?? 0),
    );
    effAlter.set(id, eff);
    darstellungsAlter.set(
      id,
      Math.max(eff, ...vor.map((v) => (darstellungsAlter.get(v) ?? 0) + KETTEN_SCHRITT)),
    );
  };
  for (const kurs of kurse) rechne(kurs.id, new Set());

  const kanten: NetzModell["kanten"] = [];
  for (const kurs of kurse) {
    for (const v of kurs.voraussetzungen) {
      const vk = byId.get(v);
      if (!vk) continue;
      kanten.push({ von: v, nach: kurs.id, gleicheLinie: vk.kategorie === kurs.kategorie });
    }
  }

  const kategorien = Object.keys(katalog.meta.kategorien).filter((kat) =>
    kurse.some((k) => k.kategorie === kat),
  );
  const maxAlter = Math.ceil(Math.max(...darstellungsAlter.values())) + 1;
  return { kurse, byId, effAlter, darstellungsAlter, kanten, kategorien, maxAlter };
}

function kantenPfad(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function stationMarkup(
  kurs: Lehrgang,
  x: number,
  y: number,
  farbe: string,
): string {
  const voll = `${kurs.nr !== "–" ? kurs.nr + " · " : ""}${kurs.titel}${
    kurs.mindestalter != null ? ` (ab ${kurs.mindestalter} J.)` : ""
  }`;
  return `<circle class="netz-station" data-id="${esc(kurs.id)}" cx="${x}" cy="${y}" r="6.5"
      fill="#fff" stroke="${farbe}" stroke-width="3"><title>${esc(voll)}</title></circle>`;
}

// ─── Ansicht 1: Linien mit Altersachse ────────────────────────────────────

export function renderNetzLinien(katalog: Katalog): string {
  const modell = baueModell(katalog);
  const { byId, darstellungsAlter, kanten, kategorien, maxAlter } = modell;

  const X0 = 170;
  const PX_JAHR = 56;
  const ZEILE = 30;
  const xVon = (id: string): number => X0 + darstellungsAlter.get(id)! * PX_JAHR;

  // Stationen je Kategorie in Zeilen packen: eine Zeile nimmt die nächste
  // Station nur auf, wenn genug horizontaler Abstand bleibt → verzweigte
  // Äste (z. B. Fortbildungen) rutschen in eigene Zeilen und enden dort.
  const position = new Map<string, { x: number; y: number }>();
  const bandVon = new Map<string, { y0: number; zeilen: number }>();
  let y = 70;
  for (const kat of kategorien) {
    const stationen = modell.kurse
      .filter((k) => k.kategorie === kat)
      .sort((a, b) => darstellungsAlter.get(a.id)! - darstellungsAlter.get(b.id)!);
    const zeilenEnden: number[] = [];
    for (const kurs of stationen) {
      const x = xVon(kurs.id);
      let zeile = zeilenEnden.findIndex((ende) => x - ende >= 170);
      if (zeile === -1) {
        zeile = zeilenEnden.length;
        zeilenEnden.push(-Infinity);
      }
      zeilenEnden[zeile] = x;
      position.set(kurs.id, { x, y: y + zeile * ZEILE });
    }
    bandVon.set(kat, { y0: y, zeilen: Math.max(1, zeilenEnden.length) });
    y += Math.max(1, zeilenEnden.length) * ZEILE + 26;
  }

  const breite = X0 + maxAlter * PX_JAHR + 240;
  const hoehe = y + 10;
  const teile: string[] = [];

  // Altersachse mit Gitterlinien.
  for (let alter = 0; alter <= maxAlter; alter += 2) {
    const x = X0 + alter * PX_JAHR;
    teile.push(
      `<line x1="${x}" y1="34" x2="${x}" y2="${hoehe - 6}" stroke="#ececec" stroke-width="1" />`,
      `<text x="${x}" y="26" font-size="11" fill="#888" text-anchor="middle">ab ${alter} J.</text>`,
    );
  }
  teile.push(
    `<text x="${X0 + maxAlter * PX_JAHR + 12}" y="26" font-size="11" fill="#888">frühestmögliches Alter →</text>`,
  );

  // Kategorielabels.
  for (const kat of kategorien) {
    const band = bandVon.get(kat)!;
    const label = katalog.meta.kategorien[kat] ?? kat;
    teile.push(
      `<text x="16" y="${band.y0 + 4}" font-size="11" font-weight="bold" fill="${LINIEN_FARBEN[kat] ?? "#666"}">${esc(
        label.length > 24 ? label.slice(0, 23) + "…" : label,
      )}</text>`,
    );
  }

  // Kanten: echte Abhängigkeiten. Gleiche Linie durchgezogen & farbig,
  // Querverbindungen gestrichelt und erst bei Auswahl sichtbar.
  for (const kante of kanten) {
    const von = position.get(kante.von)!;
    const nach = position.get(kante.nach)!;
    const pfad = kantenPfad(von.x, von.y, nach.x, nach.y);
    if (kante.gleicheLinie) {
      const farbe = LINIEN_FARBEN[byId.get(kante.nach)!.kategorie] ?? "#666";
      teile.push(
        `<path class="netz-kante" data-von="${esc(kante.von)}" data-nach="${esc(kante.nach)}"
           d="${pfad}" fill="none" stroke="${farbe}" stroke-width="4" stroke-linecap="round" opacity="0.85" />`,
      );
    } else {
      teile.push(
        `<path class="netz-kante quer" data-von="${esc(kante.von)}" data-nach="${esc(kante.nach)}"
           d="${pfad}" fill="none" stroke="#8a97a1" stroke-width="1.6" stroke-dasharray="6 4" />`,
      );
    }
  }

  // Stationen + Beschriftung.
  for (const kurs of modell.kurse) {
    const p = position.get(kurs.id)!;
    const farbe = LINIEN_FARBEN[kurs.kategorie] ?? "#666";
    teile.push(stationMarkup(kurs, p.x, p.y, farbe));
    teile.push(
      `<text x="${p.x + 12}" y="${p.y - 3}" font-size="10" fill="#777">${esc(kurs.nr !== "–" ? kurs.nr : "")}</text>`,
      `<text x="${p.x + 12}" y="${p.y + 9}" font-size="11" font-weight="600" fill="#222">${esc(kurzTitel(kurs, 26))}</text>`,
    );
  }

  return `
    <div class="netz-scroll">
      <svg class="netz-svg" viewBox="0 0 ${breite} ${hoehe}" width="${breite}" height="${hoehe}" role="img"
           aria-label="Netzplan aller DLRG-Lehrgänge entlang des Mindestalters" font-family="Arial, sans-serif">
        ${teile.join("\n")}
      </svg>
    </div>`;
}

// ─── Ansicht 2: Radial (0 Jahre innen → Alter außen) ──────────────────────

export function renderNetzRadial(katalog: Katalog): string {
  const modell = baueModell(katalog);
  const { byId, darstellungsAlter, kanten, kategorien, maxAlter } = modell;

  const R0 = 46;
  const PX_JAHR = 27;
  const radiusVon = (id: string): number => R0 + darstellungsAlter.get(id)! * PX_JAHR;
  const maxR = R0 + maxAlter * PX_JAHR;
  const groesse = maxR * 2 + 150;
  const cx = groesse / 2;
  const cy = groesse / 2;

  // Sektoren proportional zur Stationszahl, kleiner Zwischenraum.
  const proKat = new Map(
    kategorien.map((kat) => [kat, modell.kurse.filter((k) => k.kategorie === kat)] as const),
  );
  const gesamt = modell.kurse.length;
  const LUECKE = 4; // Grad zwischen Sektoren
  const nutzbar = 360 - LUECKE * kategorien.length;
  let winkel = -90;
  const sektorVon = new Map<string, { start: number; spann: number }>();
  for (const kat of kategorien) {
    const spann = (proKat.get(kat)!.length / gesamt) * nutzbar;
    sektorVon.set(kat, { start: winkel, spann });
    winkel += spann + LUECKE;
  }

  const rad = (grad: number): number => (grad * Math.PI) / 180;
  const position = new Map<string, { x: number; y: number; grad: number }>();
  for (const kat of kategorien) {
    const sektor = sektorVon.get(kat)!;
    const stationen = proKat
      .get(kat)!
      .sort((a, b) => darstellungsAlter.get(a.id)! - darstellungsAlter.get(b.id)!);
    stationen.forEach((kurs, i) => {
      const grad = sektor.start + ((i + 0.5) / stationen.length) * sektor.spann;
      const r = radiusVon(kurs.id);
      position.set(kurs.id, {
        x: cx + r * Math.cos(rad(grad)),
        y: cy + r * Math.sin(rad(grad)),
        grad,
      });
    });
  }

  const teile: string[] = [];

  // Alters-Ringe.
  for (let alter = 0; alter <= maxAlter; alter += 2) {
    const r = R0 + alter * PX_JAHR;
    teile.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ececec" stroke-width="1" />`,
      `<text x="${cx + 4}" y="${cy - r - 4}" font-size="10" fill="#999">ab ${alter} J.</text>`,
    );
  }
  teile.push(
    `<text x="${cx}" y="${cy + 4}" font-size="10" fill="#999" text-anchor="middle">0 J.</text>`,
  );

  // Sektorlabels außen.
  for (const kat of kategorien) {
    const sektor = sektorVon.get(kat)!;
    const grad = sektor.start + sektor.spann / 2;
    const r = maxR + 26;
    const x = cx + r * Math.cos(rad(grad));
    const y = cy + r * Math.sin(rad(grad));
    const label = katalog.meta.kategorien[kat] ?? kat;
    const anker = Math.cos(rad(grad)) >= 0 ? "start" : "end";
    teile.push(
      `<text x="${x}" y="${y}" font-size="11" font-weight="bold" text-anchor="${anker}"
         fill="${LINIEN_FARBEN[kat] ?? "#666"}">${esc(label.length > 26 ? label.slice(0, 25) + "…" : label)}</text>`,
    );
  }

  // Kanten (gleiche Regeln wie in der Linien-Ansicht).
  for (const kante of kanten) {
    const von = position.get(kante.von)!;
    const nach = position.get(kante.nach)!;
    const mx = (von.x + nach.x) / 2 + (cx - (von.x + nach.x) / 2) * 0.18;
    const my = (von.y + nach.y) / 2 + (cy - (von.y + nach.y) / 2) * 0.18;
    const pfad = `M ${von.x} ${von.y} Q ${mx} ${my}, ${nach.x} ${nach.y}`;
    if (kante.gleicheLinie) {
      const farbe = LINIEN_FARBEN[byId.get(kante.nach)!.kategorie] ?? "#666";
      teile.push(
        `<path class="netz-kante" data-von="${esc(kante.von)}" data-nach="${esc(kante.nach)}"
           d="${pfad}" fill="none" stroke="${farbe}" stroke-width="3.4" stroke-linecap="round" opacity="0.85" />`,
      );
    } else {
      teile.push(
        `<path class="netz-kante quer" data-von="${esc(kante.von)}" data-nach="${esc(kante.nach)}"
           d="${pfad}" fill="none" stroke="#8a97a1" stroke-width="1.5" stroke-dasharray="6 4" />`,
      );
    }
  }

  // Stationen: im Radial nur die Nummer dauerhaft beschriften – der volle
  // Titel steht im Tooltip und nach Klick in der Infozeile.
  for (const kurs of modell.kurse) {
    const p = position.get(kurs.id)!;
    const farbe = LINIEN_FARBEN[kurs.kategorie] ?? "#666";
    teile.push(stationMarkup(kurs, p.x, p.y, farbe));
    const labelR = 13;
    const lx = p.x + labelR * Math.cos(rad(p.grad));
    const ly = p.y + labelR * Math.sin(rad(p.grad));
    teile.push(
      `<text x="${lx}" y="${ly + 3}" font-size="9.5" fill="#555"
         text-anchor="${Math.cos(rad(p.grad)) >= 0 ? "start" : "end"}">${esc(kurs.nr !== "–" ? kurs.nr : kurzTitel(kurs, 10))}</text>`,
    );
  }

  return `
    <div class="netz-scroll netz-radial">
      <svg class="netz-svg" viewBox="0 0 ${groesse} ${groesse}" width="${groesse}" height="${groesse}" role="img"
           aria-label="Radialer Netzplan: Alter von innen (0 Jahre) nach außen" font-family="Arial, sans-serif">
        ${teile.join("\n")}
      </svg>
    </div>`;
}

export function renderNetzplan(katalog: Katalog, ansicht: NetzAnsicht): string {
  const legende = Object.keys(katalog.meta.kategorien)
    .filter((kat) => katalog.lehrgaenge.some((k) => !k.extern && k.kategorie === kat))
    .map(
      (kat) =>
        `<span class="netz-legende-eintrag"><span class="netz-farbe" style="background:${LINIEN_FARBEN[kat] ?? "#666"}"></span>${esc(
          katalog.meta.kategorien[kat] ?? kat,
        )}</span>`,
    )
    .join("");
  return `
    <p class="netz-intro">
      Durchgezogene Kanten sind echte Voraussetzungen innerhalb einer Ausbildungslinie –
      Äste ohne Fortsetzung (z. B. Fortbildungen) enden als Sackgasse. Die Achse zeigt das
      frühestmögliche Alter entlang aller Voraussetzungen.
      <strong>Tippe oder klicke eine Station</strong>, um ihre linienübergreifenden
      Voraussetzungen (gestrichelt) einzublenden.
    </p>
    <div class="netz-legende">${legende}</div>
    <div id="netz-info" class="netz-info leer">Keine Station ausgewählt.</div>
    ${ansicht === "radial" ? renderNetzRadial(katalog) : renderNetzLinien(katalog)}`;
}
