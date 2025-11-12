# DLRG Lehrgangs-Navigator

Ein Streamlit-Projekt zur Planung individueller Lehrgangswege für die DLRG. Auf Basis der
Prüfungsordnung Wasserrettungsdienst 2018 werden abhängige Lehrgänge automatisch in eine sinnvolle
Reihenfolge gebracht.

## Voraussetzungen

- Python 3.9 oder neuer
- Virtuelle Umgebung (empfohlen)

## Installation & Start

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

Die Anwendung wird anschließend unter `http://localhost:8501` bereitgestellt.

### Start mit Docker

```bash
docker build -t dlrg-navigator .
docker run --rm -p 8501:8501 dlrg-navigator
```

Die Streamlit-Oberfläche steht dann ebenfalls unter `http://localhost:8501` bereit.

## Projektstruktur

- `app.py` – Nutzeroberfläche mit Routing, Graph-Vorschau und Kennzahlen
- `admin_app.py` – Admin-Interface für CRUD, Validierung, Import und Versionierung
- `data/catalog_*.json` – Draft- und Published-Snapshots des Katalogs
- `navigator/` – Kernmodule (Datenmodell, Validierung, Routing, Import, Repository)
- `tests/` – Umfangreiche Pytest-Suite für Validierung, Routing, Import und Versionierung

## Features

- DLRG-inspiriertes UI-Design mit heroischem Einstieg, Karten und Timeline
- Auswahl bereits absolvierter Lehrgänge und Zielqualifikationen
- Automatische Ermittlung sämtlicher nötiger Lehrgänge inklusive Gesamtumfang
- Graphviz-Netzplan zur Visualisierung der Abhängigkeiten
- Admin-Oberfläche mit Login, Validierung, Import, Versionierung & Audit-Trail
- Datenhaltung in lokal versionierten JSON-Dateien

## Tests

Automatisierte Tests werden mit `pytest` ausgeführt:

```bash
pytest
```

Zusätzlich prüft `python -m compileall app.py admin_app.py navigator` die grundlegende Syntax aller Module.

## Continuous Integration

Eine GitHub Action (`.github/workflows/ci.yml`) führt Pytest sowie den Syntax-Check bei jedem Push
und Pull Request automatisch aus.

## Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Weitere Details siehe [LICENSE](LICENSE), falls vorhanden.
