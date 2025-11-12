import io
import json

from navigator import importer
from navigator.models import Catalog, Qualification, QualificationStatus


def test_load_qualifications_from_json_generates_unique_ids():
    payload = json.dumps(
        [
            {"title": "San A", "category": "San", "tags": ["EH"]},
            {"title": "San A", "category": "San", "tags": ["EH"]},
        ]
    )
    stream = io.StringIO(payload)
    qualifications = importer.load_qualifications_from_json(stream)

    ids = {item.id for item in qualifications}
    assert len(ids) == 2


def test_deduplicate_import_merges_existing_entries():
    base = Catalog(
        qualifications=[
            Qualification(
                id="san-a",
                title="San A",
                category="San",
                tags=["alt"],
                aliases=[],
                status=QualificationStatus.ACTIVE,
            )
        ]
    )
    imported = [
        Qualification(
            id="",
            title="San A",
            category="San",
            tags=["neu"],
            aliases=["Alias"],
            status=QualificationStatus.ACTIVE,
        )
    ]

    result = importer.deduplicate_import(base, imported)

    merged = [q for q in result["catalog"].qualifications if q.id == "san-a"][0]
    assert set(merged.tags) == {"alt", "neu"}
    assert set(merged.aliases) == {"Alias"}
    assert result["created"] == []
    assert result["updated"] == ["san-a"]


def test_load_tabular_courses_csv():
    csv_content = "title,category\nBootsführer,Einsatz"
    stream = io.BytesIO(csv_content.encode("utf-8"))
    rows = importer.load_tabular_courses(stream, mapping={"title": "title", "category": "category"}, filetype="csv")
    assert rows == [{"title": "Bootsführer", "category": "Einsatz"}]

