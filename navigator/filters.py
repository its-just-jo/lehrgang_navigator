"""Filtering helpers for catalogue browsing."""

from __future__ import annotations

from typing import Iterable, List, Sequence

from .models import Catalog, Qualification, QualificationStatus


def by_category(catalog: Catalog, category: str) -> List[Qualification]:
    return [q for q in catalog.qualifications if q.category == category]


def by_status(catalog: Catalog, status: QualificationStatus) -> List[Qualification]:
    return [q for q in catalog.qualifications if q.status == status]


def by_tags(catalog: Catalog, tags: Sequence[str]) -> List[Qualification]:
    tag_set = {tag.lower() for tag in tags}
    return [
        q
        for q in catalog.qualifications
        if tag_set.issubset({tag.lower() for tag in q.tags})
    ]


def search(catalog: Catalog, query: str) -> List[Qualification]:
    needle = query.lower().strip()
    if not needle:
        return list(catalog.qualifications)
    return [
        q
        for q in catalog.qualifications
        if needle in q.title.lower() or needle in q.id.lower() or any(needle in alias.lower() for alias in q.aliases)
    ]


def suggestions(catalog: Catalog, prefix: str) -> List[str]:
    needle = prefix.lower()
    return [q.id for q in catalog.qualifications if q.id.lower().startswith(needle)][:10]

