from navigator import filters, styling
from navigator.models import Catalog, CatalogDiff, Qualification, QualificationStatus


def test_filters_by_category_and_search():
    catalog = Catalog(
        qualifications=[
            Qualification(id="a", title="Rettung", category="WRD", status=QualificationStatus.ACTIVE),
            Qualification(id="b", title="Boot", category="Boot", status=QualificationStatus.ACTIVE, aliases=["Boot"]),
        ]
    )
    assert filters.by_category(catalog, "WRD")[0].id == "a"
    assert filters.search(catalog, "boot")[0].id == "b"


def test_styling_diff_colors():
    diff = CatalogDiff(added=["a"], removed=["b"], changed=["c"])
    assert styling.diff_color(diff, "a", QualificationStatus.ACTIVE) != styling.status_color(
        QualificationStatus.ACTIVE
    )

