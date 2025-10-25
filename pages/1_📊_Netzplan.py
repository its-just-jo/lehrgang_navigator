from __future__ import annotations

from collections.abc import Mapping

import streamlit as st

from navigator import load_course_map
from navigator.models import Course
from navigator.ui import LIGHT_GRAY, SECONDARY_YELLOW, inject_custom_css

CATEGORY_COLORS = {
    "Basisausbildung": "#ffffff",
    "Einsatz": SECONDARY_YELLOW,
    "Medizin": "#ffd9e0",
    "Bootsdienst": "#c6e6ff",
    "Führung": "#ffe9b3",
    "Tauchen": "#d9f2ff",
    "Spezialisierung": "#fbe3ff",
    "Unterstützung": "#e8ffe8",
}


def build_graph(courses: Mapping[str, Course]) -> str:
    """Return a Graphviz graph representing the course dependencies."""

    lines: list[str] = [
        "digraph {",
        "  rankdir=LR;",
        "  bgcolor=\"transparent\";",
        "  node [shape=box, style=\"rounded,filled\", fontname=\"Open Sans\", color=\"#1f3b5b\", fontcolor=\"#00253d\"];",
        "  edge [color=\"#0e74bc\"];",
    ]

    for course in courses.values():
        color = CATEGORY_COLORS.get(course.category, LIGHT_GRAY)
        label = course.name.replace("\"", "\'")
        lines.append(
            f'  "{course.id}" [label="{label}\\n({course.category})", fillcolor="{color}"];'
        )

    for course in courses.values():
        for prereq in course.prerequisites:
            if prereq in courses:
                lines.append(f'  "{prereq}" -> "{course.id}";')

    lines.append("}")
    return "\n".join(lines)


def main() -> None:
    """Render the network plan page within Streamlit."""

    inject_custom_css()
    st.title("Netzplan der Lehrgänge")
    st.write(
        "Der Netzplan zeigt alle Lehrgänge aus der Prüfungsordnung Wasserrettungsdienst 2018 "
        "und deren Abhängigkeiten. Nutze ihn, um Zusammenhänge und alternative Pfade zu entdecken."
    )

    course_map = load_course_map()
    graph_source = build_graph(course_map)
    st.graphviz_chart(graph_source, use_container_width=True)

    st.markdown(
        """
        **Legende**

        - Gelbe Kästen markieren Einsatzmodule.
        - Rote Akzente stehen für medizinische Qualifikationen.
        - Blaue Kästen repräsentieren Bootsdienst-Elemente, grüne Unterstützungsangebote und violette Spezialisierungen.
        - Pfeile zeigen jeweils von der benötigten Vorqualifikation zum darauf aufbauenden Lehrgang.
        """
    )

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
