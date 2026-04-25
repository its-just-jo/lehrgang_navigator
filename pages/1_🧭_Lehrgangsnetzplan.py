from __future__ import annotations

import json
import streamlit as st
import streamlit.components.v1 as components

from navigator import load_course_map
from navigator.models import Course
from navigator.ui import (
    DARK_BLUE,
    MID_BLUE,
    PRIMARY_RED,
    SECONDARY_YELLOW,
    inject_custom_css,
)

st.set_page_config(
    page_title="Lehrgangsnetzplan",
    page_icon="🧭",
    layout="wide",
)

CATEGORY_COLORS: dict[str, tuple[str, str]] = {
    "Basisausbildung": ("#fff1f2", PRIMARY_RED),
    "Aufbaumodul":     ("#e8f0ff", MID_BLUE),
    "Einsatz":         ("#fff9ce", "#d4a600"),
    "Sanitätswesen":   ("#ffe6ea", "#b90036"),
    "Bootsdienst":     ("#e6f5ff", MID_BLUE),
    "Führung":         ("#fff1db", "#b35c00"),
    "Tauchen":         ("#e2f7f8", "#00848c"),
    "Ausbilder":       ("#f4e9ff", "#7b3fa3"),
    "Multiplikator":   ("#e9f8ea", "#1f7a1f"),
}

_GRAPH_HEIGHT = 740

# Plain string — NOT an f-string — so JavaScript ${...} template literals survive intact.
# Python-side values are injected via str.replace() with __PLACEHOLDER__ tokens.
_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    background: #f2f4f7;
    overflow: hidden;
  }
  #cy { width: 100%; height: __HEIGHT__px; }
  #tooltip {
    position: fixed;
    background: #fff;
    border-radius: 12px;
    padding: 12px 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(0, 43, 69, 0.12);
    max-width: 300px;
    pointer-events: none;
    display: none;
    z-index: 9999;
  }
  #tooltip h4   { color: __RED__;  margin-bottom: 3px; font-size: 0.88rem; }
  #tooltip .meta { color: #777; font-size: 0.74rem; margin-bottom: 5px; }
  #tooltip p    { color: __DARK__; font-size: 0.78rem; line-height: 1.45; }
  #hint {
    position: fixed;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 43, 69, 0.72);
    color: #fff;
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 0.71rem;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
</head>
<body>
  <div id="cy"></div>
  <div id="tooltip">
    <h4 id="tt-name"></h4>
    <div class="meta" id="tt-meta"></div>
    <p id="tt-desc"></p>
  </div>
  <div id="hint">Klick auf Knoten = Abhängigkeiten hervorheben &nbsp;·&nbsp; Klick auf Hintergrund = zurücksetzen</div>

  <script src="https://unpkg.com/cytoscape@3.28.1/dist/cytoscape.min.js"></script>
  <script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"></script>
  <script src="https://unpkg.com/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>
  <script>
    cytoscape.use(cytoscapeDagre);

    const cy = cytoscape({
      container: document.getElementById('cy'),
      elements: __ELEMENTS__,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(bg)',
            'border-color':     'data(border)',
            'border-width': 2,
            'label': 'data(label)',
            'text-wrap': 'wrap',
            'text-max-width': 130,
            'font-size': 11,
            'font-family': '"Helvetica Neue", Helvetica, Arial, sans-serif',
            'color': '__DARK__',
            'text-valign': 'center',
            'text-halign': 'center',
            'padding': 12,
            'shape': 'roundrectangle',
            'width':  'label',
            'height': 'label',
            'transition-property': 'background-color, border-color, border-width, opacity',
            'transition-duration': '0.2s',
          },
        },
        {
          selector: 'node[?inPath]',
          style: {
            'border-width': 4,
            'border-color':     '__YELLOW__',
            'background-color': '#fffde7',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color':          '#b0bec5',
            'target-arrow-color':  '#b0bec5',
            'target-arrow-shape':  'triangle',
            'curve-style':         'bezier',
            'arrow-scale': 0.75,
            'transition-property': 'line-color, target-arrow-color, width, opacity',
            'transition-duration': '0.2s',
          },
        },
        { selector: '.dim', style: { 'opacity': 0.12 } },
        {
          selector: '.hl-selected',
          style: {
            'background-color': '#fff9ce',
            'border-color': '#d4a600',
            'border-width': 4,
            'opacity': 1,
          },
        },
        {
          selector: '.hl-prereq',
          style: {
            'background-color': '#e6ffe9',
            'border-color': '#1f7a1f',
            'border-width': 3,
            'opacity': 1,
          },
        },
        {
          selector: '.hl-dependent',
          style: {
            'background-color': '#e3f2fd',
            'border-color': '__MID__',
            'border-width': 3,
            'opacity': 1,
          },
        },
        {
          selector: '.hl-edge-prereq',
          style: {
            'line-color':         '#1f7a1f',
            'target-arrow-color': '#1f7a1f',
            'width': 2.5,
            'opacity': 1,
          },
        },
        {
          selector: '.hl-edge-dependent',
          style: {
            'line-color':         '__MID__',
            'target-arrow-color': '__MID__',
            'width': 2.5,
            'opacity': 1,
          },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        padding: 50,
        spacingFactor: 1.3,
        nodeSep: 50,
        rankSep: 90,
        animate: true,
        animationDuration: 700,
        animationEasing: 'ease-in-out-cubic',
      },
      minZoom: 0.25,
      maxZoom: 3,
    });

    // ── Tooltip ──────────────────────────────────────────────────────────────
    const tooltip = document.getElementById('tooltip');

    cy.on('mouseover', 'node', e => {
      const d = e.target.data();
      document.getElementById('tt-name').textContent = d.label;
      document.getElementById('tt-meta').textContent = `${d.category} · ${d.duration} UE`;
      document.getElementById('tt-desc').textContent = d.description || 'Keine Beschreibung.';
      tooltip.style.display = 'block';
    });

    cy.on('mousemove', e => {
      if (tooltip.style.display !== 'block') return;
      const { clientX: mx, clientY: my } = e.originalEvent;
      const tw = tooltip.offsetWidth, th = tooltip.offsetHeight, pad = 16;
      tooltip.style.left = (mx + pad + tw > window.innerWidth  ? mx - tw - pad : mx + pad) + 'px';
      tooltip.style.top  = (my + pad + th > window.innerHeight ? my - th - pad : my + pad) + 'px';
    });

    cy.on('mouseout', 'node', () => { tooltip.style.display = 'none'; });

    // ── Click highlight ───────────────────────────────────────────────────────
    const CLS = 'dim hl-selected hl-prereq hl-dependent hl-edge-prereq hl-edge-dependent';

    function reset() { cy.elements().removeClass(CLS); }

    cy.on('tap', 'node', e => {
      const node = e.target;
      reset();
      const pre  = node.predecessors();
      const post = node.successors();
      cy.elements().addClass('dim');
      pre.nodes().removeClass('dim').addClass('hl-prereq');
      post.nodes().removeClass('dim').addClass('hl-dependent');
      pre.edges().removeClass('dim').addClass('hl-edge-prereq');
      post.edges().removeClass('dim').addClass('hl-edge-dependent');
      node.removeClass('dim').addClass('hl-selected');
    });

    cy.on('tap', e => { if (e.target === cy) reset(); });
  </script>
</body>
</html>
"""


def _build_elements(courses: dict[str, Course], path_ids: set[str]) -> list[dict]:
    elements: list[dict] = []
    for course in courses.values():
        bg, border = CATEGORY_COLORS.get(course.category, ("#ffffff", PRIMARY_RED))
        elements.append({
            "data": {
                "id":          course.id,
                "label":       course.name,
                "category":    course.category,
                "duration":    course.duration_hours,
                "description": course.description or "",
                "bg":          bg,
                "border":      border,
                "inPath":      course.id in path_ids,
            },
        })
    for course in courses.values():
        for prereq in course.prerequisites:
            if prereq in courses:
                elements.append({
                    "data": {
                        "id":     f"{prereq}__{course.id}",
                        "source": prereq,
                        "target": course.id,
                    },
                })
    return elements


def _build_html(elements: list[dict]) -> str:
    return (
        _HTML_TEMPLATE
        .replace("__ELEMENTS__", json.dumps(elements, ensure_ascii=False))
        .replace("__HEIGHT__",   str(_GRAPH_HEIGHT))
        .replace("__RED__",      PRIMARY_RED)
        .replace("__DARK__",     DARK_BLUE)
        .replace("__MID__",      MID_BLUE)
        .replace("__YELLOW__",   SECONDARY_YELLOW)
    )


def _render_legend() -> None:
    items = "".join(
        f"<div class='category-legend-item'>"
        f"<span class='category-legend-swatch' style='background:{border};'></span>"
        f"{name}</div>"
        for name, (_, border) in CATEGORY_COLORS.items()
    )
    st.markdown(
        "<div class='category-legend'>" + items + "</div>",
        unsafe_allow_html=True,
    )


def main() -> None:
    inject_custom_css()
    st.title("Lehrgangsnetzplan")
    st.write(
        "Alle Qualifikationen der Prüfungsordnung Wasserrettungsdienst 2018 und ihre Voraussetzungen. "
        "Klick auf einen Knoten hebt den gesamten Voraussetzungs- und Folgelehrgangs-Pfad hervor."
    )

    path_ids: set[str] = st.session_state.get("planned_path_ids", set())
    if path_ids:
        st.info(
            f"{len(path_ids)} Kurse aus deinem geplanten Pfad sind im Netzplan hervorgehoben.",
            icon="🗺️",
        )

    course_map = load_course_map()
    elements   = _build_elements(course_map, path_ids)
    html       = _build_html(elements)
    components.html(html, height=_GRAPH_HEIGHT + 20, scrolling=False)

    _render_legend()

    st.markdown(
        """<div class="footer-hint">
            Quelle: <a href="https://www.dlrg.de/fileadmin/user_upload/DLRG.de/Fuer-Mitglieder/Einsatz/Pruefungsordnungen/11401204_PO_WRD_2018_internet.pdf"
            target="_blank">Prüfungsordnung Wasserrettungsdienst 2018</a>
        </div>""",
        unsafe_allow_html=True,
    )


if __name__ == "__main__":
    main()
