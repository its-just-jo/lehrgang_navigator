from __future__ import annotations

from collections.abc import Iterable

import importlib

from .models import Course

PRIMARY_RED = "#d40511"
SECONDARY_YELLOW = "#ffed00"
DARK_BLUE = "#002b45"
MID_BLUE = "#005b7f"
BACKGROUND_GRAY = "#f2f4f7"
LIGHT_GRAY = "#ffffff"


CUSTOM_CSS = f"""
<style>
html, body, [class*="block-container"] {{
    background-color: {BACKGROUND_GRAY};
}}

.stApp {{
    background: linear-gradient(180deg, rgba(212, 5, 17, 0.08) 0%, rgba(212, 5, 17, 0) 65%),
                linear-gradient(180deg, rgba(0, 91, 127, 0.06) 0%, rgba(0, 91, 127, 0) 100%),
                {BACKGROUND_GRAY};
    color: {DARK_BLUE};
    font-family: "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
}}

.stMarkdown h1, .stMarkdown h2, .stMarkdown h3 {{
    color: {DARK_BLUE};
    font-weight: 700;
    letter-spacing: 0.01em;
}}

.hero {{
    background: linear-gradient(135deg, {PRIMARY_RED} 0%, {MID_BLUE} 100%);
    border-radius: 16px;
    padding: 3rem;
    color: white;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
    margin-bottom: 2rem;
}}

.hero h1 {{
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
}}

.hero p {{
    font-size: 1.1rem;
    margin-bottom: 0;
    max-width: 640px;
}}

.badge {{
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: {SECONDARY_YELLOW};
    color: {DARK_BLUE};
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    font-weight: 600;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    margin-bottom: 1.5rem;
}}

.selection-card {{
    background: {LIGHT_GRAY};
    border-radius: 16px;
    border: 1px solid rgba(0, 43, 69, 0.1);
    padding: 1.5rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    height: 100%;
}}

.selection-card h3 {{
    color: {PRIMARY_RED};
    margin-bottom: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.95rem;
}}

.timeline {{
    margin-top: 1.5rem;
    position: relative;
    padding-left: 2rem;
}}

.timeline::before {{
    content: "";
    position: absolute;
    top: 0.5rem;
    bottom: 0.5rem;
    left: 1rem;
    width: 4px;
    background: linear-gradient({PRIMARY_RED}, {SECONDARY_YELLOW});
    border-radius: 2px;
}}

.timeline-step {{
    position: relative;
    margin-bottom: 1.5rem;
    padding-left: 1.5rem;
}}

.timeline-step:last-child {{
    margin-bottom: 0;
}}

.timeline-step::before {{
    content: "";
    position: absolute;
    left: -0.15rem;
    top: 0.25rem;
    width: 1rem;
    height: 1rem;
    background: white;
    border: 4px solid {PRIMARY_RED};
    border-radius: 50%;
    box-shadow: 0 0 0 6px rgba(212, 5, 17, 0.15);
}}

.timeline-step h4 {{
    margin: 0;
    color: {DARK_BLUE};
    font-size: 1.05rem;
    font-weight: 700;
}}

.timeline-step p {{
    margin: 0.3rem 0 0;
    color: rgba(0, 0, 0, 0.68);
}}

.course-card {{
    background: white;
    border-radius: 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    padding: 1rem 1.2rem;
    margin-bottom: 1rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}}

.course-card strong {{
    color: {PRIMARY_RED};
}}

.footer-hint {{
    margin-top: 3rem;
    font-size: 0.9rem;
    color: rgba(0, 0, 0, 0.55);
}}

.network-grid {{
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    margin-top: 2rem;
}}

.network-column {{
    display: flex;
    flex-direction: column;
    gap: 1rem;
}}

.network-column h3 {{
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: {MID_BLUE};
}}

.network-node {{
    background: white;
    border-radius: 12px;
    border: 1px solid rgba(0, 43, 69, 0.12);
    padding: 1rem 1.2rem;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}}

.network-node:hover {{
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.12);
}}

.network-node strong {{
    color: {PRIMARY_RED};
    display: block;
    margin-bottom: 0.35rem;
}}

.network-node .network-meta {{
    font-size: 0.85rem;
    color: rgba(0, 0, 0, 0.7);
}}

.network-node ul {{
    margin: 0.75rem 0 0;
    padding-left: 1.2rem;
    color: rgba(0, 0, 0, 0.74);
}}

.network-node li {{
    margin-bottom: 0.35rem;
}}
</style>
"""


def _load_streamlit():
    """Return the Streamlit module or raise a helpful error if unavailable."""

    try:
        return importlib.import_module("streamlit")
    except ModuleNotFoundError as exc:  # pragma: no cover - defensive branch
        raise RuntimeError(
            "Streamlit ist erforderlich, um die UI-Helfer zu verwenden. "
            "Bitte installiere streamlit oder starte die Anwendung mit 'streamlit run'."
        ) from exc


def inject_custom_css() -> None:
    """Inject the DLRG-themed stylesheet into the Streamlit app."""

    st = _load_streamlit()
    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


def render_timeline(path: Iterable[Course]) -> None:
    """Render a vertical timeline for the planned course path."""

    st = _load_streamlit()
    st.markdown("<div class='timeline'>", unsafe_allow_html=True)
    for course in path:
        st.markdown(
            f"""
            <div class='timeline-step'>
                <h4>{course.name}</h4>
                <p>{course.description or "Keine Beschreibung verfügbar."}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    st.markdown("</div>", unsafe_allow_html=True)


def render_course_overview(courses: Iterable[Course]) -> None:
    """Display a card-based overview of the provided courses."""

    st = _load_streamlit()
    for course in courses:
        st.markdown(
            f"""
            <div class='course-card'>
                <strong>{course.name}</strong><br/>
                <span>Kategorie: {course.category} · Umfang: {course.duration_hours} UE</span>
                <p style='margin-top:0.5rem'>{course.description}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
