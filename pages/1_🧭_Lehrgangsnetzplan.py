from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from functools import lru_cache

import streamlit as st

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

LEVEL_NAMES = [
    "Stufe 1 · Grundlagen",
    "Stufe 2 · Aufbau",
    "Stufe 3 · Vertiefung",
    "Stufe 4 · Spezialisierung",
]


def _level_name(level: int) -> str:
    if level < len(LEVEL_NAMES):
        return LEVEL_NAMES[level]
    return f"Stufe {level + 1}"


def _group_courses_by_level(courses: Mapping[str, Course]) -> dict[int, list[Course]]:
    @lru_cache(maxsize=None)
    def level(course_id: str) -> int:
        course = courses[course_id]
        relevant_prereqs = [pid for pid in course.prerequisites if pid in courses]
        if not relevant_prereqs:
            return 0
        return 1 + max(level(pid) for pid in relevant_prereqs)

    grouped: dict[int, list[Course]] = defaultdict(list)
    for course_id, course in courses.items():
        grouped[level(course_id)].append(course)
    for bucket in grouped.values():
        bucket.sort(key=lambda item: item.name)
    return dict(sorted(grouped.items()))


def _render_network(columns: Mapping[int, list[Course]], courses: Mapping[str, Course]) -> None:
    column_html: list[str] = []
    for level, entries in columns.items():
        node_html: list[str] = []
        for course in entries:
            background, accent = CATEGORY_STYLES.get(
                course.category, ("#ffffff", PRIMARY_RED)
            )
            prereq_names = [courses[pid].name for pid in course.prerequisites if pid in courses]
            prereq_html = "".join(f"<li>{name}</li>" for name in prereq_names)
            if prereq_html:
                prereq_block = (
                    "<div class='network-meta'><strong>Voraussetzungen</strong></div>"
                    f"<ul>{prereq_html}</ul>"
                )
            else:
                prereq_block = (
                    "<div class='network-meta'>Keine Voraussetzungen notwendig.</div>"
                )

            description = (
                f"<div class='network-meta'>{course.description}</div>"
                if course.description
                else ""
            )

            node_html.append(
                f"""
                <div class='network-node' style='background:{background}; border-top:4px solid {accent};'>
                    <strong>{course.name}</strong>
                    <div class='network-meta'>{course.category}</div>
                    {description}
                    {prereq_block}
                </div>
                """
            )
        column_html.append(
            f"<div class='network-column'><h3>{_level_name(level)}</h3>{''.join(node_html)}</div>"
        )

    grid_html = "<div class='network-grid'>" + "".join(column_html) + "</div>"
    st.markdown(grid_html, unsafe_allow_html=True)


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
    columns = _group_courses_by_level(course_map)
    _render_network(columns, course_map)

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
