from navigator import routing
from navigator.models import Catalog, Edge, EdgeKind, EdgeStatus, Qualification, QualificationStatus


def test_route_calculates_missing_steps():
    catalog = Catalog(
        qualifications=[
            Qualification(id="a", title="A", category="", status=QualificationStatus.ACTIVE),
            Qualification(id="b", title="B", category="", status=QualificationStatus.ACTIVE),
            Qualification(id="c", title="C", category="", status=QualificationStatus.ACTIVE),
        ],
        edges=[
            Edge(src="a", dst="b", kind=EdgeKind.HARD, status=EdgeStatus.ACTIVE),
            Edge(src="b", dst="c", kind=EdgeKind.HARD, status=EdgeStatus.ACTIVE),
        ],
    )

    result = routing.route(catalog, start=["a"], goal="c")

    assert result["missing"] == ["b"]


def test_reachable_targets_ignore_deprecated():
    catalog = Catalog(
        qualifications=[
            Qualification(id="a", title="A", category="", status=QualificationStatus.ACTIVE),
            Qualification(id="b", title="B", category="", status=QualificationStatus.DEPRECATED),
        ],
        edges=[],
    )

    reachable = routing.reachable_targets(catalog, current=[])

    assert reachable == ["a"]

