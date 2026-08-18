# DLRG-Seminar-Crawler

Separates Node-Skript (ohne Abhängigkeiten, Node ≥ 18), das die Lehrgangs-/Seminarseiten
des DLRG-Bundesverbands und der Landesverbände abruft und daraus reale Angebote
(Preis, Termine, Link) für den Lehrgangs-Navigator erzeugt.

```bash
npm run crawl                          # alle Quellen aus sources.json
node crawler/crawl.mjs --quelle Hessen # nur eine Quelle (Namens-Teilstring)
node crawler/crawl.mjs --limit 10      # max. Detailseiten pro Quelle (Standard 40)
node crawler/crawl.mjs --dry-run       # nur berichten, nichts schreiben
```

Ergebnis ist `data/angebote.json`. Die Web-App liest diese Datei beim Build ein:
Gefundene Preise **überschreiben die Schätzwerte** aus `data/lehrgaenge.json`
(bei mehreren Angeboten pro Lehrgang gewinnt der günstigste). Nach einem
Crawler-Lauf also einfach committen und neu deployen.

## Wie es funktioniert

1. **`sources.json`** listet die Listenseiten. Pro Quelle beschreibt `linkmuster`
   (Regex), welche Links auf der Listenseite Detailseiten sind. Die
   Landesverbands-Seiten sind TYPO3-basiert und ähnlich aufgebaut, z. B.
   `https://schleswig-holstein.dlrg.de/seminare-und-lehrgaenge/anmeldung/<slug>-<nr>-s/`.
2. Pro Detailseite werden Titel (`<h1>`), Preis (Beträge nahe Stichwörtern wie
   „Teilnahmebeitrag“, „Lehrgangsgebühr“ …), Termine (`TT.MM.JJJJ`) und der Ort
   (nahe „Veranstaltungsort“, „Lehrgangsort“ …) heuristisch extrahiert.
   Koordinaten für die Entfernungsberechnung kommen aus `orte.json` –
   unbekannte Orte dort einfach nachtragen.
3. **`mapping.json`** ordnet Seminartitel per Regex den Katalog-IDs aus
   `data/lehrgaenge.json` zu. Die erste passende Regel gewinnt – speziellere
   Muster stehen deshalb oben. Nicht zuordenbare Titel listet das Skript am Ende
   auf; bei Bedarf einfach eine Regel ergänzen.

## Rücksichtnahme

- `robots.txt` (User-agent `*`, `Disallow`) wird respektiert.
- Zwischen zwei Seitenabrufen wartet das Skript 1 Sekunde.
- Standardmäßig werden max. 40 Detailseiten pro Quelle geladen.
- Der User-Agent nennt Projekt-URL und Zweck.

## Wartung

- **Neue Quelle:** Eintrag in `sources.json` ergänzen (Listen-URL + Linkmuster).
- **Falsche/fehlende Zuordnung:** Regel in `mapping.json` anpassen; Reihenfolge beachten.
- Die Seitenstruktur der DLRG-Auftritte kann sich ändern – wenn eine Quelle 0 Links
  liefert, zuerst das `linkmuster` gegen den aktuellen HTML-Quelltext der Listenseite prüfen.
