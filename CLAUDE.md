# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DLRG Lehrgangs-Navigator is a Streamlit web app for planning individual DLRG (German water rescue service) training paths based on the 2018 Water Rescue Service examination regulations. The UI and all data are in German.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
streamlit run app.py              # Opens at http://localhost:8501

# Run tests
pytest                            # All tests
pytest tests/test_path_planning.py  # Single test file
pytest -k "test_topological"     # Single test by name

# Syntax validation (also runs in CI)
python -m compileall app.py navigator pages

# Docker
docker build -t dlrg-navigator .
docker run --rm -p 8501:8501 dlrg-navigator
```

No linting tool is configured; there is no black, flake8, or pylint in the project.

## Architecture

The app separates reusable logic (`navigator/`) from Streamlit pages, so the core library can be tested without a running Streamlit server.

### Data Flow

```
data/lehrgaenge.json
       │
       ▼
navigator/data.py          loads + validates the catalogue, cached with @lru_cache
       │                   raises MissingCourseError if any prerequisite ID is unknown
       ▼
navigator/models.py        frozen dataclass Course(id, name, description,
       │                   category, duration_hours, prerequisites: list[str])
       ▼
navigator/path.py          core planning logic:
       │                     collect_required_courses() — DFS over prerequisites
       │                     build_learning_path()      — returns topologically sorted list
       │                     _topological_sort()        — Kahn's algorithm; raises CycleError
       │                     _expand_completed()        — courses in CASCADE_COMPLETION_IDS
       │                                                  auto-mark their prerequisites done
       ▼
app.py / pages/            Streamlit UI, @st.cache_data wraps catalogue loading
navigator/ui.py            custom CSS + rendering helpers (hero, timeline, cards)
```

### Multi-page Streamlit Structure

`app.py` is the main planning page. `pages/1_🧭_Lehrgangsnetzplan.py` is a separate page that renders the full course dependency graph using Graphviz (SFDP layout). Streamlit discovers pages automatically via the `pages/` directory; the emoji prefix is intentional for sidebar ordering.

### `navigator/ui.py` — Optional Streamlit Import

The module defers `import streamlit` so that color constants (`PRIMARY_RED`, `SECONDARY_YELLOW`, `DARK_BLUE`) are available in tests without a Streamlit runtime. Respect this pattern — do not add a top-level `import streamlit` to `ui.py`.

## Key Conventions

- **Course IDs** are snake_case strings defined in `data/lehrgaenge.json` (e.g., `sanitaetsausbildung_a`). They are the stable keys used everywhere; display names come from `Course.name`.
- **`CASCADE_COMPLETION_IDS`** in `navigator/path.py` is a hardcoded set of course IDs whose prerequisites are automatically considered completed. Modify it when a new "umbrella" qualification is added to the catalogue.
- **Frozen dataclasses** are used for `Course` — treat catalogue objects as immutable.
- Tests use `monkeypatch` to mock Streamlit calls in `test_ui_module.py`. Add new UI functions to tests the same way.
- The JSON catalogue (`data/lehrgaenge.json`) is the single source of truth for courses and their prerequisite relationships; `navigator/data.py` validates referential integrity on load.
