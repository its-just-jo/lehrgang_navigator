from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .models import Course

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "lehrgaenge.json"


class MissingCourseError(ValueError):
    """Raised when a referenced course id does not exist in the catalogue."""


@lru_cache
def load_courses() -> list[Course]:
    """Load the course catalogue from the bundled JSON file."""

    with _DATA_PATH.open("r", encoding="utf-8") as handle:
        raw_courses = json.load(handle)

    courses: list[Course] = []
    for entry in raw_courses:
        courses.append(
            Course(
                id=entry["id"],
                name=entry["name"],
                description=entry.get("description", ""),
                category=entry.get("category", "Allgemein"),
                duration_hours=int(entry.get("duration_hours", 0)),
                prerequisites=list(entry.get("prerequisites", [])),
            )
        )

    _validate_courses(courses)
    return courses


def load_course_map() -> dict[str, Course]:
    """Return a dictionary representation of the course catalogue."""

    return {course.id: course for course in load_courses()}


def _validate_courses(courses: list[Course]) -> None:
    """Ensure the JSON catalogue is self-consistent."""

    course_ids = {course.id for course in courses}
    for course in courses:
        missing = set(course.prerequisites) - course_ids
        if missing:
            missing_str = ", ".join(sorted(missing))
            raise MissingCourseError(
                f"Course '{course.id}' references missing prerequisites: {missing_str}"
            )
