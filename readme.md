# DLRG Lehrgangs-Navigator

Statische Web-App zur Planung individueller DLRG-Ausbildungswege – gebaut mit
Vite + TypeScript, gehostet auf GitHub Pages, komplett ohne Server-Backend.

Das Leit-Szenario: **Der Weg zum DLRG-Lehrschein (Ausbilder Schwimmen +
Rettungsschwimmen, DOSB Trainer C).** Du wählst dein Ziel, hakst an, was du
schon hast, und stellst ein, wie viele Lehrgänge pro Halbjahr für dich angenehm
sind. Der Navigator berechnet daraus:

- **den schnellsten Plan** – jeder Lehrgang so früh wie möglich,
- **den günstigsten Plan** – gleiche Dauer, aber Lehrgänge so gelegt, dass
  ablaufende Nachweise (z. B. „Erste Hilfe ≤ 2 Jahre bei der Prüfung“) frisch
  bleiben und möglichst wenige Auffrischungslehrgänge nötig sind,
- **eine Komfort-Übersicht** – was jede Stufe von 1–4 Lehrgängen pro Halbjahr
  an Zeit und Geld kostet.

Gültigkeitsfenster, jährliche vs. halbjährliche Angebotsfrequenz, Mindestalter
und automatisch eingeplante Auffrischungen (EH-Fortbildung, Sanitätsfortbildung)
sind Teil des Modells.

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
                       Angebotsfrequenz, Auffrischungs-Beziehungen
data/angebote.json     Reale Angebote (Preise/Termine) aus dem Crawler;
                       überschreiben die Schätzwerte beim Build
src/lib/               Planungs-Engine (katalogunabhängig testbar):
                       graph.ts (DFS, Toposort), planner.ts (Halbjahres-
                       Scheduler ASAP/ALAP, Auffrischungslogik), angebote.ts
src/main.ts            UI (Vanilla TS, kein Framework)
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
