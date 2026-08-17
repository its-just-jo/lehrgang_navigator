#!/usr/bin/env node
/**
 * DLRG-Seminar-Crawler
 *
 * Separates Skript außerhalb der Web-App: Ruft die Lehrgangs-/Seminarlisten des
 * Bundesverbands und der Landesverbände ab (crawler/sources.json), extrahiert
 * pro Detailseite Titel, Preis und Termine, mappt die Titel über
 * crawler/mapping.json auf Katalog-IDs und schreibt das Ergebnis nach
 * data/angebote.json. Die Web-App übernimmt daraus reale Preise anstelle der
 * Schätzwerte im Katalog.
 *
 * Aufruf:
 *   node crawler/crawl.mjs                 # alle Quellen
 *   node crawler/crawl.mjs --quelle Hessen # nur Quellen, deren Name "Hessen" enthält
 *   node crawler/crawl.mjs --limit 10      # max. Detailseiten pro Quelle (Standard 40)
 *   node crawler/crawl.mjs --dry-run       # nichts schreiben, nur berichten
 *
 * Benötigt Node >= 18 (global fetch), keine Abhängigkeiten.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, "..");
const USER_AGENT =
  "lehrgang-navigator-crawler/2.0 (+https://github.com/its-just-jo/lehrgang_navigator; ehrenamtliches DLRG-Planungstool)";
const WARTEZEIT_MS = 1000;

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const limit = Number(argv[argv.indexOf("--limit") + 1] || 40) || 40;
const quellenFilter = argv.includes("--quelle") ? argv[argv.indexOf("--quelle") + 1] : null;

const quellenDatei = JSON.parse(readFileSync(join(HIER, "sources.json"), "utf8"));
const mappingDatei = JSON.parse(readFileSync(join(HIER, "mapping.json"), "utf8"));
const katalog = JSON.parse(readFileSync(join(WURZEL, "data", "lehrgaenge.json"), "utf8"));
const katalogIds = new Set(katalog.lehrgaenge.map((k) => k.id));

const regeln = mappingDatei.regeln.map((r) => ({
  regex: new RegExp(r.muster, "i"),
  lehrgangId: r.lehrgang_id,
}));
for (const regel of regeln) {
  if (!katalogIds.has(regel.lehrgangId)) {
    throw new Error(`mapping.json verweist auf unbekannte Katalog-ID '${regel.lehrgangId}'`);
  }
}

const schlaf = (ms) => new Promise((res) => setTimeout(res, ms));

async function lade(url) {
  const antwort = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(20000),
    redirect: "follow",
  });
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status} für ${url}`);
  return antwort.text();
}

/** Sehr einfache robots.txt-Auswertung: Disallow-Regeln für User-agent '*'. */
async function ladeRobotsSperren(basisUrl) {
  try {
    const text = await lade(new URL("/robots.txt", basisUrl).href);
    const sperren = [];
    let giltFuerAlle = false;
    for (const zeile of text.split("\n")) {
      const [schluessel, ...rest] = zeile.split(":");
      const wert = rest.join(":").trim();
      const key = schluessel?.trim().toLowerCase();
      if (key === "user-agent") giltFuerAlle = wert === "*";
      else if (key === "disallow" && giltFuerAlle && wert) sperren.push(wert);
    }
    return sperren;
  } catch {
    return [];
  }
}

const istGesperrt = (url, sperren) => {
  const pfad = new URL(url).pathname;
  return sperren.some((s) => pfad.startsWith(s));
};

function extrahiereLinks(html, basisUrl, linkmuster) {
  const muster = new RegExp(linkmuster, "i");
  const links = new Set();
  for (const treffer of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const roh = treffer[1];
    if (/^(mailto:|tel:|javascript:)/i.test(roh)) continue;
    let absolut;
    try {
      absolut = new URL(roh, basisUrl).href;
    } catch {
      continue;
    }
    if (new URL(absolut).host !== new URL(basisUrl).host) continue;
    if (absolut === basisUrl) continue;
    if (muster.test(absolut)) links.add(absolut.split("?")[0]);
  }
  return [...links];
}

const entferneTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&szlig;/g, "ß")
    .replace(/\s+/g, " ")
    .trim();

function extrahiereTitel(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return entferneTags(h1[1]);
  const titel = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titel ? entferneTags(titel[1]).replace(/\s*\|.*$/, "") : "";
}

function extrahierePreis(text) {
  // Bevorzugt Beträge in der Nähe von Gebühren-Stichwörtern …
  const nahTreffer = text.match(
    /(?:teilnahmebeitrag|teilnehmerbeitrag|lehrgangsgeb(?:ü|ue)hr|seminargeb(?:ü|ue)hr|kostenbeitrag|geb(?:ü|ue)hr|kosten|preis|beitrag)[^0-9€]{0,60}(\d{1,4}(?:[.,]\d{2})?)\s*(?:€|EUR|Euro)/i,
  );
  // … sonst der erste Euro-Betrag der Seite.
  const treffer = nahTreffer ?? text.match(/(\d{1,4}(?:[.,]\d{2})?)\s*(?:€|EUR|Euro)\b/i);
  if (!treffer) return null;
  const wert = Number.parseFloat(treffer[1].replace(",", "."));
  return Number.isFinite(wert) && wert >= 0 && wert <= 5000 ? wert : null;
}

function extrahiereTermine(text) {
  const termine = new Set();
  for (const treffer of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) {
    const [, tag, monat, jahr] = treffer;
    const datum = new Date(Date.UTC(Number(jahr), Number(monat) - 1, Number(tag)));
    if (!Number.isNaN(datum.getTime()) && Number(jahr) >= 2020 && Number(jahr) <= 2035) {
      termine.add(datum.toISOString().slice(0, 10));
    }
  }
  return [...termine].sort();
}

const mappeTitel = (titel) => regeln.find((r) => r.regex.test(titel))?.lehrgangId ?? null;

async function verarbeiteQuelle(quelle) {
  console.log(`\n▶ ${quelle.name} – ${quelle.url}`);
  const angebote = [];
  const unzugeordnet = [];
  let listenHtml;
  try {
    listenHtml = await lade(quelle.url);
  } catch (fehler) {
    console.warn(`  ⚠ Listenseite nicht erreichbar: ${fehler.message}`);
    return { angebote, unzugeordnet };
  }

  const sperren = await ladeRobotsSperren(quelle.url);
  const links = extrahiereLinks(listenHtml, quelle.url, quelle.linkmuster)
    .filter((link) => !istGesperrt(link, sperren))
    .slice(0, limit);
  console.log(`  ${links.length} Detailseiten gefunden (Limit ${limit})`);

  for (const link of links) {
    await schlaf(WARTEZEIT_MS);
    let html;
    try {
      html = await lade(link);
    } catch (fehler) {
      console.warn(`  ⚠ ${link}: ${fehler.message}`);
      continue;
    }
    const titel = extrahiereTitel(html);
    if (!titel) continue;
    const text = entferneTags(html);
    const lehrgangId = mappeTitel(titel);
    if (!lehrgangId) {
      unzugeordnet.push(titel);
      continue;
    }
    angebote.push({
      lehrgang_id: lehrgangId,
      titel,
      kosten: extrahierePreis(text),
      termine: extrahiereTermine(text),
      url: link,
      quelle: quelle.name,
    });
    console.log(`  ✓ ${titel} → ${lehrgangId}`);
  }
  return { angebote, unzugeordnet };
}

const quellen = quellenDatei.quellen.filter(
  (q) => !quellenFilter || q.name.toLowerCase().includes(quellenFilter.toLowerCase()),
);
if (quellen.length === 0) {
  console.error(`Keine Quelle passt auf '${quellenFilter}'.`);
  process.exit(1);
}

const alleAngebote = [];
const alleUnzugeordneten = [];
for (const quelle of quellen) {
  const { angebote, unzugeordnet } = await verarbeiteQuelle(quelle);
  alleAngebote.push(...angebote);
  alleUnzugeordneten.push(...unzugeordnet);
}

alleAngebote.sort(
  (a, b) => a.lehrgang_id.localeCompare(b.lehrgang_id) || a.quelle.localeCompare(b.quelle),
);

console.log(`\n${alleAngebote.length} Angebote zugeordnet, ${alleUnzugeordneten.length} Titel ohne Zuordnung.`);
if (alleUnzugeordneten.length > 0) {
  console.log("Ohne Zuordnung (ggf. mapping.json erweitern):");
  for (const titel of [...new Set(alleUnzugeordneten)].slice(0, 20)) console.log(`  – ${titel}`);
}

if (dryRun) {
  console.log("\n--dry-run: data/angebote.json wurde nicht geschrieben.");
} else {
  const ziel = join(WURZEL, "data", "angebote.json");
  writeFileSync(
    ziel,
    JSON.stringify({ stand: new Date().toISOString().slice(0, 10), angebote: alleAngebote }, null, 2) + "\n",
  );
  console.log(`\nGeschrieben: ${ziel}`);
}
