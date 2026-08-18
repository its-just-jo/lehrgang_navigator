# DLRG Lehrgangs-Navigator

Statische Web-App zur Planung individueller DLRG-Ausbildungswege – gebaut mit
Vite + TypeScript, gehostet auf GitHub Pages, komplett ohne Server-Backend.

Das Haupt-Szenario: **Der Weg zum DLRG-Lehrschein (Ausbilder Schwimmen +
Rettungsschwimmen, DOSB Trainer C).** Du wählst dein Ziel, hakst an, was du
schon hast (höherwertige Abzeichen decken niedrigere automatisch ab – DRSA
Silber impliziert Bronze und Erste Hilfe), und wählst Standort, maximale
Entfernung und Wunsch-Tempo. Der Navigator berechnet fünf gleichrangige
Szenarien:

- 🏃 **Schnellster** – jeder Lehrgang so früh wie möglich,
- 💶 **Günstigster** – niedrigste Gesamtkosten (nutzt reale Angebotspreise und
  legt Lehrgänge so, dass Nachweise wie „EH ≤ 2 Jahre“ frisch bleiben),
- 🛋️ **Komfort** – im selbst gewählten Tempo (1–4 Lehrgänge pro Halbjahr oder
  „egal“),
- 🚗 **Wenig Fahrerei** – wählt die nächstgelegenen Angebote,
- ⚖️ **Ausgewogen** – gleichgewichteter Kompromiss aus Dauer, Kosten,
  Fahrstrecke und Belastung pro Halbjahr.

Das Modell kennt Gültigkeitsfenster (als Warnung – Auffrischungen werden
bewusst nicht eingeplant), jährliche vs. halbjährliche Angebotsfrequenz,
Mindestalter, Ersetzungs-Hierarchien (`ersetzt`) und gleichwertige
Lehrgangskombinationen (`alternativen`, z. B. getrennte Ausbilder-Lehrgänge
182 + 183 statt des seltenen Kombi-Lehrgangs 181).

Der Plan lässt sich als **Liste, Zeitstrahl oder Tabelle** darstellen. Ein
zweiter Tab zeigt das gesamte Lehrgangsnetz als vereinfachten U-Bahn-Plan mit
Altersachse (durchgezogene Kanten = echte Voraussetzungen, Querverbindungen
erscheinen beim Klick auf eine Station) – wahlweise als Liniennetz oder radial
(0 Jahre innen, Alter nach außen). Der Crawler kennt die Akademien des
Bundesverbands und aller 18 Landesverbände.

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173/lehrgang_navigator/
npm test           # Vitest-Unit-Tests inkl. Lehrschein-Szenario
npm run build      # Typecheck + statischer Build nach dist/
npm run test:e2e   # Playwright-Smoke-Test gegen die gebaute Seite
```

## Deployment (GitHub Pages)

Jeder Push auf `main` baut die Seite und deployt sie über
`.github/workflows/deploy.yml` nach GitHub Pages. Einmalig in den
Repo-Einstellungen aktivieren: **Settings → Pages → Source: „GitHub Actions“**.
Die Seite erscheint dann unter `https://<user>.github.io/lehrgang_navigator/`.

## Projektstruktur

```
data/lehrgaenge.json   Lehrgangskatalog (einzige Wahrheit): Voraussetzungen,
                       Frische-Anforderungen, Lehreinheiten, Kosten-Schätzwerte,
                       Angebotsfrequenz, ersetzt-Hierarchie, Alternativen
data/angebote.json     Konkrete Angebote (Preis, Ort, Gliederung, Koordinaten);
                       aktuell Beispieldaten, per Crawler ersetzbar
src/lib/               Planungs-Engine (katalogunabhängig testbar):
                       graph.ts (DFS, Toposort, Ersetzungslogik), planner.ts
                       (Halbjahres-Scheduler ASAP/ALAP, 5 Szenarien,
                       Angebots-Zuordnung mit Entfernungsfilter)
src/main.ts            UI (Vanilla TS, kein Framework, ISC-angelehntes Design)
src/netzplan.ts        U-Bahn-Plan aller Lehrgänge (SVG)
crawler/               Separates Node-Skript, das DLRG-Seminarseiten abruft
                       und data/angebote.json erzeugt (siehe crawler/README.md)
tests/unit/            Vitest-Tests inkl. E2E-Szenario „Lehrschein“
tests/e2e/             Playwright-Smoke-Test gegen die gebaute Seite
```

## Datenpflege

- Kosten und Umfänge im Katalog sind **Schätzwerte** (je Gliederung
  unterschiedlich) – reale Preise liefert `npm run crawl`
  (siehe [crawler/README.md](crawler/README.md)).
- Grundlage sind die DLRG-Prüfungsordnungen (u. a. PO Schwimmen/Rettungsschwimmen
  13. Auflage 2025); die Quellenliste steht in `data/lehrgaenge.json` → `meta.quellen`.
- Verbindlich sind allein die Prüfungsordnungen und die Auskunft deiner Gliederung.

## Lizenz

MIT.
