from __future__ import annotations

from collections.abc import Iterable

import streamlit as st

from navigator import build_learning_path, load_course_map, load_courses
from navigator.models import Course
from navigator.ui import inject_custom_css, render_course_overview, render_timeline

st.set_page_config(
    page_title="DLRG Lehrgangs-Navigator",
    page_icon="🚤",
    layout="wide",
    initial_sidebar_state="expanded",
)


def _course_lookup(courses: Iterable[Course]) -> dict[str, Course]:
    """Create a name-based lookup for the provided course catalogue."""

    return {course.name: course for course in sorted(courses, key=lambda course: course.name)}


def _render_hero() -> None:
    """Render the hero section with project context."""
    st.markdown(
        """
        <div class="hero">
            <div class="badge">🚑 Lehrgangsplanung nach Prüfungsordnung WRD 2018</div>
            <h1>Dein DLRG Lehrgangs-Navigator</h1>
            <p>
                Wähle deine vorhandenen Qualifikationen und dein Ziel – wir berechnen den optimalen
                Lehrgangspfad gemäß der aktuellen Prüfungsordnung Wasserrettungsdienst.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_selection(current: dict[str, Course]) -> tuple[list[str], list[str]]:
    """Display selection widgets for completed and desired qualifications."""
    with st.container():
        cols = st.columns(2)
        with cols[0]:
            st.markdown("<div class='selection-card'>", unsafe_allow_html=True)
            st.subheader("Aktuelle Qualifikationen")
            owned = st.multiselect(
                "Welche Lehrgänge hast du bereits abgeschlossen?",
                options=list(current.keys()),
            )
            st.markdown("</div>", unsafe_allow_html=True)
        with cols[1]:
            st.markdown("<div class='selection-card'>", unsafe_allow_html=True)
            st.subheader("Zielqualifikationen")
            desired = st.multiselect(
                "Welche Qualifikationen möchtest du erreichen?",
                options=list(current.keys()),
            )
            st.markdown("</div>", unsafe_allow_html=True)
    return owned, desired


def _render_path(path: list[Course], course_map: dict[str, Course], completed_ids: set[str]) -> None:
    """Render the calculated learning path including prerequisite insights."""
    if not path:
        st.info("Alle ausgewählten Ziele sind bereits abgedeckt – Glückwunsch!")
        return

    st.markdown("### Empfohlene Reihenfolge")
    render_timeline(path)

    total_hours = sum(course.duration_hours for course in path)
    st.metric("Gesamtumfang", f"{total_hours} Unterrichtseinheiten")

    st.markdown("### Details zu allen beteiligten Lehrgängen")
    render_course_overview(path)

    acquisition = set(completed_ids)
    prerequisite_info: list[tuple[Course, list[str]]] = []
    for course in path:
        missing = [p for p in course.prerequisites if p not in acquisition]
        prerequisite_info.append((course, missing))
        acquisition.add(course.id)

    outstanding = [item for item in prerequisite_info if item[1]]
    if outstanding:
        with st.expander("Benötigte Voraussetzungen je Lehrgang"):
            for course, missing_ids in outstanding:
                readable = ", ".join(course_map[mid].name for mid in missing_ids)
                st.markdown(f"**{course.name}:** benötigt noch {readable}")


@st.cache_data(show_spinner=False)
def _load_catalogue() -> tuple[dict[str, Course], dict[str, Course]]:
    """Load and cache course information for reuse across interactions."""
    courses = load_courses()
    course_map = load_course_map()
    course_by_name = _course_lookup(courses)
    return course_map, course_by_name


def main() -> None:
    """Streamlit entry point for the course planning application."""
    inject_custom_css()
    _render_hero()

    course_map, course_by_name = _load_catalogue()

    owned_names, desired_names = _render_selection(course_by_name)
    owned_ids = {course_by_name[name].id for name in owned_names}
    desired_ids = {course_by_name[name].id for name in desired_names}

    if not desired_ids:
        st.warning("Bitte wähle mindestens eine Zielqualifikation aus, um den Pfad zu berechnen.")
        return

    path = build_learning_path(desired_ids, course_map, completed_ids=owned_ids)
    st.session_state["planned_path_ids"] = {course.id for course in path}
    _render_path(path, course_map, owned_ids)

    st.markdown(
        """
        <div class="footer-hint">
            Alle Angaben basieren auf der <a href="https://www.dlrg.de/fileadmin/user_upload/DLRG.de/Fuer-Mitglieder/Einsatz/Pruefungsordnungen/11401204_PO_WRD_2018_internet.pdf" target="_blank">Prüfungsordnung Wasserrettungsdienst 2018</a>.
            Eine individuelle Beratung durch deine Gliederung bleibt dennoch empfehlenswert.
        </div>
        """,
        unsafe_allow_html=True,
    )


if __name__ == "__main__":
    main()
