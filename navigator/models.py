"""Core data models for the DLRG Ausbildungsnavigator.

The module provides strictly typed dataclasses that are used across the
application.  The models are intentionally free of persistence logic and can be
serialised to and from dictionaries so they can easily be stored in JSON files
by the repository layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import Enum
from typing import Dict, Iterable, List, Optional


ISO_FORMAT = "%Y-%m-%dT%H:%M:%S"


class QualificationStatus(str, Enum):
    """Lifecycle state of a qualification.

    ``draft`` qualifications are not yet visible to end users but can be used
    in the admin editor. ``active`` qualifications are available to the
    navigator. ``deprecated`` qualifications stay in the catalogue for historic
    reasons but are ignored by routing and the public application.
    """

    DRAFT = "draft"
    ACTIVE = "active"
    DEPRECATED = "deprecated"


class EdgeStatus(str, Enum):
    """Lifecycle of an edge connecting two qualifications."""

    DRAFT = "draft"
    ACTIVE = "active"
    DEPRECATED = "deprecated"


class EdgeKind(str, Enum):
    """Distinguish between hard and soft prerequisites."""

    HARD = "hard"
    SOFT = "soft"


class CatalogState(str, Enum):
    """Repository state a catalogue snapshot can be in."""

    DRAFT = "draft"
    PUBLISHED = "published"


def _ts(value: Optional[str | datetime]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime(ISO_FORMAT)
    return value


def _parse_ts(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.strptime(value, ISO_FORMAT)


@dataclass(slots=True)
class Qualification:
    """A single qualification vertex in the catalogue graph."""

    id: str
    title: str
    category: str
    tags: List[str] = field(default_factory=list)
    status: QualificationStatus = QualificationStatus.DRAFT
    aliases: List[str] = field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    version: int = 1

    def with_version_bump(self, user: str) -> "Qualification":
        """Return a copy with increased version and timestamp updates."""

        now = datetime.utcnow()
        return replace(
            self,
            version=self.version + 1,
            updated_at=now,
            created_at=self.created_at or now,
            created_by=self.created_by or user,
        )

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "tags": list(self.tags),
            "status": self.status.value,
            "aliases": list(self.aliases),
            "created_at": _ts(self.created_at),
            "updated_at": _ts(self.updated_at),
            "created_by": self.created_by,
            "version": self.version,
        }

    @staticmethod
    def from_dict(payload: Dict) -> "Qualification":
        return Qualification(
            id=payload["id"],
            title=payload["title"],
            category=payload.get("category", ""),
            tags=list(payload.get("tags", [])),
            status=QualificationStatus(payload.get("status", "draft")),
            aliases=list(payload.get("aliases", [])),
            created_at=_parse_ts(payload.get("created_at")),
            updated_at=_parse_ts(payload.get("updated_at")),
            created_by=payload.get("created_by"),
            version=int(payload.get("version", 1)),
        )


@dataclass(slots=True)
class Edge:
    """Connection between two qualifications."""

    src: str
    dst: str
    kind: EdgeKind = EdgeKind.HARD
    note: str = ""
    status: EdgeStatus = EdgeStatus.DRAFT

    def to_dict(self) -> Dict:
        return {
            "src": self.src,
            "dst": self.dst,
            "kind": self.kind.value,
            "note": self.note,
            "status": self.status.value,
        }

    @staticmethod
    def from_dict(payload: Dict) -> "Edge":
        return Edge(
            src=payload["src"],
            dst=payload["dst"],
            kind=EdgeKind(payload.get("kind", EdgeKind.HARD.value)),
            note=payload.get("note", ""),
            status=EdgeStatus(payload.get("status", EdgeStatus.DRAFT.value)),
        )


@dataclass(slots=True)
class Catalog:
    """A qualification catalogue with metadata."""

    qualifications: List[Qualification] = field(default_factory=list)
    edges: List[Edge] = field(default_factory=list)
    state: CatalogState = CatalogState.DRAFT
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "qualifications": [q.to_dict() for q in self.qualifications],
            "edges": [e.to_dict() for e in self.edges],
            "state": self.state.value,
            "created_at": _ts(self.created_at),
            "created_by": self.created_by,
        }

    @staticmethod
    def from_dict(payload: Dict) -> "Catalog":
        return Catalog(
            qualifications=[
                Qualification.from_dict(item) for item in payload.get("qualifications", [])
            ],
            edges=[Edge.from_dict(item) for item in payload.get("edges", [])],
            state=CatalogState(payload.get("state", CatalogState.DRAFT.value)),
            created_at=_parse_ts(payload.get("created_at")),
            created_by=payload.get("created_by"),
        )

    def qualification_map(self) -> Dict[str, Qualification]:
        return {item.id: item for item in self.qualifications}

    def edge_map(self) -> Dict[str, List[Edge]]:
        result: Dict[str, List[Edge]] = {}
        for edge in self.edges:
            result.setdefault(edge.src, []).append(edge)
        return result

    def active_qualifications(self) -> Iterable[Qualification]:
        for qualification in self.qualifications:
            if qualification.status != QualificationStatus.DEPRECATED:
                yield qualification

    def active_edges(self, *, include_soft: bool = True) -> Iterable[Edge]:
        for edge in self.edges:
            if edge.status == EdgeStatus.DEPRECATED:
                continue
            if not include_soft and edge.kind == EdgeKind.SOFT:
                continue
            yield edge


@dataclass(slots=True)
class ValidationIssue:
    """Describes a validation error or warning."""

    level: str  # "error" or "warning"
    code: str
    message: str
    context: Dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class ValidationReport:
    """Combined validation report used by the UI and tests."""

    errors: List[ValidationIssue] = field(default_factory=list)
    warnings: List[ValidationIssue] = field(default_factory=list)

    def ok(self) -> bool:
        return not self.errors

    def summary(self) -> Dict[str, int]:
        return {"errors": len(self.errors), "warnings": len(self.warnings)}


@dataclass(slots=True)
class CatalogDiff:
    """Diff between two catalogues used for admin previews."""

    added: List[str] = field(default_factory=list)
    removed: List[str] = field(default_factory=list)
    changed: List[str] = field(default_factory=list)

