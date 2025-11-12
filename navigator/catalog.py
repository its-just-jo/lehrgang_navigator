"""Catalog services for the Ausbildungsnavigator.

The module exposes utilities to load, validate and diff qualification catalogues
that are backed by JSON files.  Pure catalogue logic lives here so it can be
re-used by the CLI, the tests and both Streamlit applications.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from typing import Dict, Iterable, List, Sequence, Tuple

from .models import (
    Catalog,
    CatalogDiff,
    Edge,
    EdgeKind,
    EdgeStatus,
    Qualification,
    QualificationStatus,
    ValidationIssue,
    ValidationReport,
)


def create_empty_catalog() -> Catalog:
    """Create a clean empty catalogue."""

    return Catalog()


def slugify(title: str) -> str:
    """Create a deterministic slug for a qualification title."""

    import re

    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug or "qualification"


def ensure_unique_ids(qualifications: Sequence[Qualification]) -> Dict[str, Qualification]:
    """Create unique ids for a qualification list.

    The function is used for imports to deterministically generate ids and add
    suffixes when collisions occur.
    """

    result: Dict[str, Qualification] = {}
    seen: Dict[str, int] = defaultdict(int)
    for item in qualifications:
        identifier = item.id or slugify(item.title)
        if identifier in result:
            seen[identifier] += 1
            identifier = f"{identifier}-{seen[identifier]}"
        else:
            seen[identifier] = 0
        result[identifier] = replace(item, id=identifier)
    return result


def _active_nodes(catalog: Catalog) -> Dict[str, Qualification]:
    return {
        q.id: q
        for q in catalog.qualifications
        if q.status != QualificationStatus.DEPRECATED
    }


def _active_edges(catalog: Catalog, *, include_soft: bool = True) -> List[Edge]:
    result: List[Edge] = []
    for edge in catalog.edges:
        if edge.status == EdgeStatus.DEPRECATED:
            continue
        if not include_soft and edge.kind == EdgeKind.SOFT:
            continue
        result.append(edge)
    return result


def validate_catalog(catalog: Catalog) -> ValidationReport:
    """Run the catalogue validation pipeline."""

    report = ValidationReport()
    id_counts: Dict[str, int] = defaultdict(int)
    alias_to_id: Dict[str, str] = {}

    for qualification in catalog.qualifications:
        id_counts[qualification.id] += 1
        for alias in qualification.aliases:
            if alias in alias_to_id and alias_to_id[alias] != qualification.id:
                report.warnings.append(
                    ValidationIssue(
                        level="warning",
                        code="alias_conflict",
                        message=f"Alias '{alias}' already used by {alias_to_id[alias]}",
                        context={"alias": alias, "id": qualification.id},
                    )
                )
            else:
                alias_to_id[alias] = qualification.id

    for identifier, count in id_counts.items():
        if count > 1:
            report.errors.append(
                ValidationIssue(
                    level="error",
                    code="duplicate_id",
                    message=f"Qualification id '{identifier}' duplicated",
                    context={"id": identifier},
                )
            )

    active_nodes = _active_nodes(catalog)
    active_edges = _active_edges(catalog)
    nodes_with_edges: Dict[str, int] = defaultdict(int)

    for edge in active_edges:
        nodes_with_edges[edge.src] += 1
        nodes_with_edges[edge.dst] += 1
        if edge.src not in active_nodes:
            report.errors.append(
                ValidationIssue(
                    level="error",
                    code="invalid_reference",
                    message=f"Edge source '{edge.src}' missing",
                    context={"src": edge.src, "dst": edge.dst},
                )
            )
        if edge.dst not in active_nodes:
            report.errors.append(
                ValidationIssue(
                    level="error",
                    code="invalid_reference",
                    message=f"Edge destination '{edge.dst}' missing",
                    context={"src": edge.src, "dst": edge.dst},
                )
            )

    for node in active_nodes.values():
        if nodes_with_edges.get(node.id, 0) == 0:
            report.warnings.append(
                ValidationIssue(
                    level="warning",
                    code="orphan_node",
                    message=f"Qualification '{node.id}' is not connected",
                    context={"id": node.id},
                )
            )

    # Hard cycle detection (ignoring deprecated nodes/edges)
    graph: Dict[str, List[str]] = defaultdict(list)
    for edge in active_edges:
        if edge.kind == EdgeKind.HARD:
            graph[edge.src].append(edge.dst)

    visited: Dict[str, int] = defaultdict(int)

    def dfs(node: str, stack: List[str]) -> None:
        visited[node] = 1
        stack.append(node)
        for neighbour in graph.get(node, []):
            if neighbour not in active_nodes:
                continue
            if visited[neighbour] == 0:
                dfs(neighbour, stack)
            elif visited[neighbour] == 1:
                cycle = stack[stack.index(neighbour) :] + [neighbour]
                report.errors.append(
                    ValidationIssue(
                        level="error",
                        code="hard_cycle",
                        message=" -> ".join(cycle),
                        context={"cycle": cycle},
                    )
                )
        visited[node] = 2
        stack.pop()

    for node in active_nodes:
        if visited[node] == 0:
            dfs(node, [])

    return report


def diff_catalogs(draft: Catalog, published: Catalog) -> CatalogDiff:
    """Return the semantic diff between two catalogues."""

    published_map = published.qualification_map()
    draft_map = draft.qualification_map()

    added = [identifier for identifier in draft_map.keys() if identifier not in published_map]
    removed = [identifier for identifier in published_map.keys() if identifier not in draft_map]

    changed: List[str] = []
    for identifier in draft_map:
        if identifier in published_map and draft_map[identifier] != published_map[identifier]:
            changed.append(identifier)

    return CatalogDiff(added=sorted(added), removed=sorted(removed), changed=sorted(changed))


def graph_statistics(catalog: Catalog) -> Dict[str, int]:
    """Return counts used by dashboards."""

    return {
        "qualifications": len(catalog.qualifications),
        "edges": len(catalog.edges),
        "active_qualifications": sum(
            1 for q in catalog.qualifications if q.status == QualificationStatus.ACTIVE
        ),
        "deprecated": sum(
            1 for q in catalog.qualifications if q.status == QualificationStatus.DEPRECATED
        ),
    }


def adjacency_map(catalog: Catalog, *, include_soft: bool = True) -> Dict[str, List[Edge]]:
    """Build an adjacency map for further processing."""

    result: Dict[str, List[Edge]] = defaultdict(list)
    for edge in _active_edges(catalog, include_soft=include_soft):
        result[edge.src].append(edge)
    return result


def inbound_edges(catalog: Catalog, target: str) -> List[Edge]:
    """Return edges pointing to ``target`` ignoring deprecated data."""

    return [edge for edge in _active_edges(catalog) if edge.dst == target]


def outbound_edges(catalog: Catalog, source: str) -> List[Edge]:
    return [edge for edge in _active_edges(catalog) if edge.src == source]


def merge_catalog(base: Catalog, updates: Iterable[Qualification]) -> Catalog:
    """Return a catalogue with updated qualifications.

    Used by the importer for deduplication updates.
    """

    replacement = {item.id: item for item in updates}
    new_qualifications = [replacement.get(q.id, q) for q in base.qualifications]
    for item in updates:
        if item.id not in base.qualification_map():
            new_qualifications.append(item)
    return replace(base, qualifications=new_qualifications)


def state_transition(status: QualificationStatus, new_status: str) -> QualificationStatus:
    """Validate state transitions for qualifications."""

    new_status_enum = QualificationStatus(new_status)
    if status == QualificationStatus.DEPRECATED and new_status_enum == QualificationStatus.DRAFT:
        # deprecated -> draft is not allowed, must go to active directly
        return QualificationStatus.ACTIVE
    return new_status_enum

