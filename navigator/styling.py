"""Graph styling helpers."""

from __future__ import annotations

from typing import Dict

from .models import CatalogDiff, QualificationStatus


STATUS_COLOR = {
    QualificationStatus.ACTIVE: "#2ecc71",
    QualificationStatus.DRAFT: "#3498db",
    QualificationStatus.DEPRECATED: "#7f8c8d",
}


def status_color(status: QualificationStatus) -> str:
    return STATUS_COLOR.get(status, "#bdc3c7")


def diff_color(diff: CatalogDiff, identifier: str, status: QualificationStatus) -> str:
    if identifier in diff.added:
        return "#27ae60"
    if identifier in diff.removed:
        return "#c0392b"
    if identifier in diff.changed:
        return "#2980b9"
    return status_color(status)


def legend() -> Dict[str, str]:
    return {
        "Neu": "#27ae60",
        "Geändert": "#2980b9",
        "Deprecated": STATUS_COLOR[QualificationStatus.DEPRECATED],
        "Standard": "#ecf0f1",
    }

