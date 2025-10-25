from __future__ import annotations

from collections.abc import Iterable

import streamlit as st

from .models import Course

PRIMARY_RED = "#e2001a"
SECONDARY_YELLOW = "#ffed00"
DARK_BLUE = "#00335a"
BACKGROUND_GRAY = "#f5f5f5"
LIGHT_GRAY = "#fafafa"


CUSTOM_CSS = f"""
<style>
html, body, [class*="block-container"] {{
    background-color: {BACKGROUND_GRAY};
}}

.stApp {{
    background: linear-gradient(180deg, rgba(226, 0, 26, 0.08) 0%, rgba(226, 0, 26, 0) 60%),
                linear-gradient(180deg, rgba(0, 51, 90, 0.05) 0%, rgba(0, 51, 90, 0) 100%),
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
    background: linear-gradient(135deg, {PRIMARY_RED} 0%, {DARK_BLUE} 100%);
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
    background: white;
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
    border: 1px solid rgba(0, 51, 90, 0.1);
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
    box-shadow: 0 0 0 6px rgba(226, 0, 26, 0.15);
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
</style>
"""


def inject_custom_css() -> None:
    """Inject the DLRG-themed stylesheet into the Streamlit app."""

    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


def render_timeline(path: Iterable[Course]) -> None:
    """Render a vertical timeline for the planned course path."""

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
