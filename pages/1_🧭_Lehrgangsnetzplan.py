from __future__ import annotations

import streamlit as st

from graphviz import Digraph

from navigator import load_course_map
from navigator.models import Course
from navigator.ui import MID_BLUE, PRIMARY_RED, inject_custom_css

st.set_page_config(
    page_title="Lehrgangsnetzplan",
    page_icon="🧭",
    layout="wide",
)

CATEGORY_STYLES: dict[str, tuple[str, str]] = {
    "Basisausbildung": ("#fff1f2", PRIMARY_RED),
    "Einsatz": ("#fff9ce", "#d4a600"),
    "Medizin": ("#ffe6ea", "#b90036"),
    "Bootsdienst": ("#e6f5ff", MID_BLUE),
    "Führung": ("#fff1db", "#b35c00"),
    "Tauchen": ("#e2f7f8", "#00848c"),
    "Spezialisierung": ("#f4e9ff", "#7b3fa3"),
    "Unterstützung": ("#e9f8ea", "#1f7a1f"),
}

def _build_course_graph(courses: dict[str, Course]) -> Digraph:
    """Build a force-directed graph showing course dependencies."""

    graph = Digraph("lehrgang_mesh", engine="sfdp")
    graph.attr(
        pad="0.6",
        overlap="false",
        splines="true",
        sep="0.7",
    )
    graph.attr(
        "node",
        shape="box",
        style="rounded,filled",
        fontname="Helvetica",
        fontsize="10",
        fontcolor="#1f2933",
    )
    graph.attr(
        "edge",
        color="#8f9aa7",
        penwidth="1.4",
        arrowsize="0.6",
    )

    for course in sorted(courses.values(), key=lambda item: item.name):
        background, accent = CATEGORY_STYLES.get(
            course.category, ("#ffffff", PRIMARY_RED)
        )
        graph.node(
            course.id,
            label=course.name,
            fillcolor=background,
            color=accent,
            penwidth="2",
        )

    for course in courses.values():
        for prereq in course.prerequisites:
            if prereq in courses:
                graph.edge(prereq, course.id)

    return graph


def _render_category_legend() -> None:
    """Render a colour legend for the course categories."""

    st.markdown(
        """
        <style>
            .category-legend {
                display: flex;
                flex-wrap: wrap;
                gap: 0.75rem;
                margin-top: 1.5rem;
            }
            .category-legend-item {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                background: rgba(255, 255, 255, 0.9);
                border-radius: 999px;
                padding: 0.35rem 0.75rem;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
                font-size: 0.85rem;
                color: #1f2933;
            }
            .category-legend-swatch {
                width: 14px;
                height: 14px;
                border-radius: 3px;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )

    legend_items: list[str] = []
    for name, (_, accent) in CATEGORY_STYLES.items():
        legend_items.append(
            (
                "<div class='category-legend-item'>"
                f"<span class='category-legend-swatch' style='background:{accent};'></span>"
                f"{name}"
                "</div>"
            )
        )

    st.markdown(
        "<div class='category-legend'>" + "".join(legend_items) + "</div>",
        unsafe_allow_html=True,
    )


def main() -> None:
    """Render the network plan page within Streamlit."""

    inject_custom_css()
    st.title("Lehrgangsnetzplan")
    st.write(
        "Der Lehrgangsnetzplan visualisiert alle Qualifikationen der Prüfungsordnung "
        "Wasserrettungsdienst 2018, sortiert nach Komplexität. Jede Karte zeigt die "
        "benötigten Voraussetzungen, damit du schnell erkennst, wo du einsteigen kannst."
    )

    course_map = load_course_map()
    graph = _build_course_graph(course_map)
    st.graphviz_chart(graph)
    _render_category_legend()

    st.markdown(
        """
        <div class="footer-hint">
            Quelle: <a href="https://www.dlrg.de/fileadmin/user_upload/DLRG.de/Fuer-Mitglieder/Einsatz/Pruefungsordnungen/11401204_PO_WRD_2018_internet.pdf" target="_blank">Prüfungsordnung Wasserrettungsdienst 2018</a>
        </div>
        """,
        unsafe_allow_html=True,
    )


if __name__ == "__main__":
    main()
