"""Admin utilities shared between Streamlit UI and tests."""

from __future__ import annotations

from dataclasses import replace
from typing import Dict, Iterable, List, Optional

from .catalog import adjacency_map, state_transition, validate_catalog
from .models import (
    Catalog,
    Edge,
    EdgeKind,
    EdgeStatus,
    Qualification,
    QualificationStatus,
    ValidationReport,
)


def authenticate(username: str, password: str, roles: Dict[str, Dict[str, str]]) -> Optional[str]:
    """Return the role for ``username`` if credentials are valid."""

    if username in roles and roles[username].get("password") == password:
        return roles[username].get("role", "viewer")
    return None


def can_edit(role: str) -> bool:
    return role == "admin"


def apply_status_transition(qualification: Qualification, new_status: str) -> Qualification:
    return replace(qualification, status=state_transition(qualification.status, new_status))


def live_cycle_check(catalog: Catalog, new_edge: Edge) -> ValidationReport:
    """Check whether adding ``new_edge`` would introduce a hard cycle."""

    augmented = Catalog(
        qualifications=catalog.qualifications,
        edges=catalog.edges + [new_edge],
        state=catalog.state,
        created_at=catalog.created_at,
        created_by=catalog.created_by,
    )
    return validate_catalog(augmented)


def bulk_update_status(catalog: Catalog, ids: Iterable[str], status: str, *, user: str) -> Catalog:
    transition = []
    for qualification in catalog.qualifications:
        if qualification.id in ids:
            transitioned = apply_status_transition(qualification, status).with_version_bump(user)
            transition.append(transitioned)
        else:
            transition.append(qualification)
    return replace(catalog, qualifications=transition)


def remove_edge(catalog: Catalog, edge: Edge) -> Catalog:
    edges = [item for item in catalog.edges if not (item.src == edge.src and item.dst == edge.dst)]
    return replace(catalog, edges=edges)


def add_edge(catalog: Catalog, edge: Edge) -> Catalog:
    return replace(catalog, edges=[*catalog.edges, edge])


def update_qualification(catalog: Catalog, updated: Qualification) -> Catalog:
    qualifications = [updated if q.id == updated.id else q for q in catalog.qualifications]
    return replace(catalog, qualifications=qualifications)

