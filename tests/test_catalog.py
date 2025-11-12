from datetime import datetime

from navigator import catalog
from navigator.models import (
    Catalog,
    CatalogState,
    Edge,
    EdgeKind,
    EdgeStatus,
    Qualification,
    QualificationStatus,
)


def _qualification(identifier: str, *, status: QualificationStatus = QualificationStatus.ACTIVE) -> Qualification:
    return Qualification(
        id=identifier,
        title=identifier.title(),
        category="Test",
        status=status,
        tags=[identifier],
        aliases=[identifier.upper()],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        created_by="tester",
    )


def _edge(src: str, dst: str, *, kind: EdgeKind = EdgeKind.HARD) -> Edge:
    return Edge(src=src, dst=dst, kind=kind, status=EdgeStatus.ACTIVE)


def test_validate_catalog_detects_duplicates_and_cycles():
    qualifications = [
        _qualification("a"),
        _qualification("b"),
        _qualification("a", status=QualificationStatus.ACTIVE),
    ]
    edges = [_edge("a", "b"), _edge("b", "a")]
    test_catalog = Catalog(qualifications=qualifications, edges=edges)

    report = catalog.validate_catalog(test_catalog)

    assert any(issue.code == "duplicate_id" for issue in report.errors)
    assert any(issue.code == "hard_cycle" for issue in report.errors)


def test_validate_catalog_warns_about_orphan_nodes():
    qualifications = [_qualification("isolated")]
    report = catalog.validate_catalog(Catalog(qualifications=qualifications))

    assert any(issue.code == "orphan_node" for issue in report.warnings)


def test_diff_catalogs_tracks_changes():
    base = Catalog(qualifications=[_qualification("a"), _qualification("b")])
    updated = Catalog(qualifications=[_qualification("a"), _qualification("c")])

    diff = catalog.diff_catalogs(updated, base)

    assert diff.added == ["c"]
    assert diff.removed == ["b"]

