from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping

from .models import Course


class CycleError(ValueError):
    """Raised when the course catalogue contains circular dependencies."""


def collect_required_courses(
    target_ids: Iterable[str],
    course_map: Mapping[str, Course],
    completed_ids: Iterable[str] | None = None,
) -> set[str]:
    """Return the ids required to reach all targets starting from completed ids."""

    completed = set(completed_ids or [])
    required: set[str] = set()

    def dfs(course_id: str) -> None:
        if course_id in required or course_id in completed:
            return
        required.add(course_id)
        for prereq in course_map[course_id].prerequisites:
            dfs(prereq)

    for target_id in target_ids:
        if target_id not in course_map:
            raise KeyError(f"Unknown course id '{target_id}'")
        dfs(target_id)

    return required


def build_learning_path(
    target_ids: Iterable[str],
    course_map: Mapping[str, Course],
    completed_ids: Iterable[str] | None = None,
) -> list[Course]:
    """Return an ordered list of courses needed to reach the selected targets."""

    completed = set(completed_ids or [])
    required_ids = collect_required_courses(target_ids, course_map, completed)
    ordered_ids = _topological_sort(required_ids, course_map, completed)
    return [course_map[course_id] for course_id in ordered_ids]


def _topological_sort(
    required_ids: set[str],
    course_map: Mapping[str, Course],
    completed_ids: set[str],
) -> list[str]:
    """Return a topologically sorted list of the required course ids."""

    in_degree: dict[str, int] = {}
    dependents: dict[str, set[str]] = {}

    for course_id in required_ids:
        course = course_map[course_id]
        filtered_prereqs = [
            prereq
            for prereq in course.prerequisites
            if prereq in required_ids and prereq not in completed_ids
        ]
        in_degree[course_id] = len(filtered_prereqs)
        for prereq in filtered_prereqs:
            dependents.setdefault(prereq, set()).add(course_id)

    queue = deque(course_id for course_id, degree in in_degree.items() if degree == 0)
    ordered: list[str] = []
    processed: set[str] = set()

    while queue:
        course_id = queue.popleft()
        if course_id in processed:
            continue
        processed.add(course_id)
        if course_id not in completed_ids:
            ordered.append(course_id)
        for dependent_id in dependents.get(course_id, set()):
            in_degree[dependent_id] -= 1
            if in_degree[dependent_id] == 0:
                queue.append(dependent_id)

    if len(processed) != len(required_ids):
        raise CycleError("Detected a cycle in the course prerequisites")

    return ordered
