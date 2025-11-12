from pathlib import Path

from navigator.models import Catalog, CatalogState, Qualification, QualificationStatus
from navigator.repo import CatalogRepository


def test_repository_save_and_load(tmp_path: Path):
    repo = CatalogRepository(tmp_path)
    catalog = Catalog(
        qualifications=[
            Qualification(id="a", title="A", category="Test", status=QualificationStatus.ACTIVE)
        ]
    )

    repo.save(catalog, user="tester", state=CatalogState.DRAFT)
    loaded = repo.load(CatalogState.DRAFT)

    assert loaded.qualifications[0].id == "a"


def test_publish_creates_snapshot(tmp_path: Path):
    repo = CatalogRepository(tmp_path)
    catalog = Catalog(
        qualifications=[
            Qualification(id="a", title="A", category="Test", status=QualificationStatus.ACTIVE)
        ]
    )
    repo.save(catalog, user="tester", state=CatalogState.DRAFT)

    snapshot = repo.publish(user="tester")
    assert snapshot.state == CatalogState.PUBLISHED
    assert repo.load(CatalogState.PUBLISHED).qualifications

