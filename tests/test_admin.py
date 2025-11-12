from navigator import admin
from navigator.models import Catalog, Edge, EdgeKind, EdgeStatus, Qualification, QualificationStatus


def test_authenticate_returns_role():
    roles = {"alice": {"password": "secret", "role": "admin"}}
    assert admin.authenticate("alice", "secret", roles) == "admin"
    assert admin.authenticate("alice", "wrong", roles) is None


def test_live_cycle_check_detects_cycles():
    catalog = Catalog(
        qualifications=[
            Qualification(id="a", title="A", category="", status=QualificationStatus.ACTIVE),
            Qualification(id="b", title="B", category="", status=QualificationStatus.ACTIVE),
        ],
        edges=[Edge(src="a", dst="b", kind=EdgeKind.HARD, status=EdgeStatus.ACTIVE)],
    )
    report = admin.live_cycle_check(
        catalog,
        Edge(src="b", dst="a", kind=EdgeKind.HARD, status=EdgeStatus.ACTIVE),
    )
    assert any(issue.code == "hard_cycle" for issue in report.errors)

