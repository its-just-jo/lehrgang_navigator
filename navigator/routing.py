"""Routing helpers for the Ausbildungsnavigator."""

from __future__ import annotations

from collections import deque
from typing import Dict, Iterable, List, Set

from .catalog import adjacency_map
from .models import Catalog, EdgeKind, QualificationStatus


class RouteResult(dict):
    """Typed dictionary returned by :func:`route` for Streamlit display."""


def _collect_hard_prerequisites(catalog: Catalog, target: str) -> Set[str]:
    graph = adjacency_map(catalog, include_soft=False)
    reverse_graph: Dict[str, List[str]] = {}
    for src, edges in graph.items():
        for edge in edges:
            reverse_graph.setdefault(edge.dst, []).append(src)

    required: Set[str] = set()
    queue = deque([target])
    while queue:
        node = queue.popleft()
        for parent in reverse_graph.get(node, []):
            if parent not in required:
                required.add(parent)
                queue.append(parent)
    return required


def route(catalog: Catalog, start: Iterable[str], goal: str) -> RouteResult:
    """Return the steps required to reach ``goal`` from ``start``.

    The algorithm performs a topological sort on the relevant subgraph. All
    deprecated nodes and edges are ignored. ``start`` is a collection of
    qualifications that are already fulfilled.
    """

    completed: Set[str] = set(start)
    required = _collect_hard_prerequisites(catalog, goal)
    required.discard(goal)
    missing = required - completed

    order: List[str] = []

    graph = adjacency_map(catalog, include_soft=False)

    indegree: Dict[str, int] = {}
    relevant_nodes: Set[str] = set(missing) | {goal}
    for src, edges in graph.items():
        for edge in edges:
            if edge.dst not in relevant_nodes or edge.src not in relevant_nodes:
                continue
            indegree[edge.dst] = indegree.get(edge.dst, 0) + 1
            indegree.setdefault(edge.src, indegree.get(edge.src, 0))

    queue = deque([node for node in relevant_nodes if indegree.get(node, 0) == 0])

    while queue:
        node = queue.popleft()
        if node not in completed and node != goal:
            order.append(node)
        for edge in graph.get(node, []):
            if edge.dst not in relevant_nodes:
                continue
            indegree[edge.dst] -= 1
            if indegree[edge.dst] == 0:
                queue.append(edge.dst)

    return RouteResult(
        completed=sorted(completed),
        missing=order,
        target=goal,
    )


def reachable_targets(catalog: Catalog, current: Iterable[str]) -> List[str]:
    """Return all active qualifications that can be reached from ``current``."""

    owned = set(current)
    result: List[str] = []
    for qualification in catalog.qualifications:
        if qualification.status != QualificationStatus.ACTIVE:
            continue
        required = _collect_hard_prerequisites(catalog, qualification.id)
        if required.issubset(owned | {qualification.id}):
            result.append(qualification.id)
    return sorted(result)

