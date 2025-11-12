from navigator import admin, catalog
from navigator.models import Catalog, CatalogState, Edge, EdgeKind, EdgeStatus, Qualification, QualificationStatus


def _sample_catalog() -> Catalog:
    return Catalog(
        qualifications=[
            Qualification(id="a", title="A", category="", status=QualificationStatus.DRAFT),
            Qualification(id="b", title="B", category="", status=QualificationStatus.ACTIVE),
        ],
        edges=[Edge(src="a", dst="b", kind=EdgeKind.HARD, status=EdgeStatus.ACTIVE)],
    )


def test_bulk_status_transition():
    base = _sample_catalog()
    updated = admin.bulk_update_status(base, ["a"], "active", user="tester")
    target = next(q for q in updated.qualifications if q.id == "a")
    assert target.status == QualificationStatus.ACTIVE
    assert target.version == 2


def test_validation_required_for_publish():
    report = catalog.validate_catalog(_sample_catalog())
    assert report.errors == []

