"""Graph styling helpers."""

from __future__ import annotations

from typing import Dict, Iterable

import graphviz

from .models import Catalog, CatalogDiff, Edge, EdgeKind, EdgeStatus, Qualification, QualificationStatus


STATUS_COLOR = {
    QualificationStatus.ACTIVE: "#2ecc71",
    QualificationStatus.DRAFT: "#3498db",
    QualificationStatus.DEPRECATED: "#7f8c8d",
}

PALETTE = [
    "#53b3cb",
    "#ff6f91",
    "#845ec2",
    "#ffc75f",
    "#00c9a7",
    "#f9f871",
    "#0081cf",
    "#d65db1",
]


def status_color(status: QualificationStatus) -> str:
    return STATUS_COLOR.get(status, "#bdc3c7")


def _mix(color: str, *, ratio: float = 0.22, base: str = "#0f1115") -> str:
    """Blend ``color`` with ``base`` to create a darker background tone."""

    def _component(value: str) -> int:
        return int(value, 16)

    color = color.lstrip("#")
    base = base.lstrip("#")
    mixed = []
    for idx in range(0, 6, 2):
        foreground = _component(color[idx : idx + 2])
        background = _component(base[idx : idx + 2])
        blended = int(foreground * (1 - ratio) + background * ratio)
        mixed.append(f"{blended:02x}")
    return "#" + "".join(mixed)


def category_theme(categories: Iterable[str]) -> Dict[str, Dict[str, str]]:
    """Return accent/background colors for each category."""

    mapping: Dict[str, Dict[str, str]] = {}
    for index, category in enumerate(sorted(set(categories))):
        accent = PALETTE[index % len(PALETTE)]
        mapping[category] = {
            "accent": accent,
            "background": _mix(accent, ratio=0.45),
        }
    return mapping


def diff_color(diff: CatalogDiff, identifier: str, status: QualificationStatus) -> str:
    if identifier in diff.added:
        return "#27ae60"
    if identifier in diff.removed:
        return "#c0392b"
    if identifier in diff.changed:
        return "#2980b9"
    return status_color(status)


def mesh_node_attributes(
    theme: Dict[str, Dict[str, str]],
    qualification: Qualification,
    *,
    diff: CatalogDiff | None = None,
    highlight: bool = False,
) -> Dict[str, str]:
    palette = theme.get(qualification.category, {"accent": "#748ffc", "background": "#1b1f2b"})
    accent = palette["accent"]
    background = palette["background"]
    fillcolor = f"{background}:{accent}"
    fontcolor = "#f8fbff"
    penwidth = "1.6"

    if qualification.status == QualificationStatus.DEPRECATED:
        fillcolor = "#3a3f47:#2b313c"
        accent = "#7f8c8d"
        fontcolor = "#dfe6e9"
    elif diff:
        if qualification.id in diff.added:
            fillcolor = "#1e5631:#28a745"
            accent = "#28a745"
        elif qualification.id in diff.changed:
            fillcolor = "#123c69:#4056f4"
            accent = "#4056f4"

    if highlight:
        fillcolor = f"{accent}:#ffffff"
        penwidth = "2.8"
        fontcolor = "#0f1115"

    return {
        "fillcolor": fillcolor,
        "color": accent,
        "fontcolor": fontcolor,
        "penwidth": penwidth,
    }


def mesh_edge_attributes(edge: Edge, *, highlight: bool = False) -> Dict[str, str]:
    color = "#9aa0aa"
    style = "solid"
    penwidth = "1.2"
    if edge.kind == EdgeKind.SOFT:
        style = "dashed"
        color = "#f6c177"
    if highlight:
        color = "#ffffff"
        penwidth = "2.6"
    return {"color": color, "style": style, "penwidth": penwidth}


def build_mesh_graph(
    catalog: Catalog,
    *,
    diff: CatalogDiff | None = None,
    include_soft: bool = True,
    hide_deprecated: bool = False,
    highlight_nodes: Iterable[str] | None = None,
) -> graphviz.Digraph:
    highlight = set(highlight_nodes or [])
    graph = graphviz.Digraph("mesh", engine="sfdp")
    graph.attr(
        "graph",
        bgcolor="#0f1115",
        fontcolor="#f5f6fa",
        pad="0.8",
        nodesep="0.55",
        ranksep="0.9",
        splines="curved",
    )
    graph.attr(
        "node",
        shape="box",
        style="filled,rounded",
        fontname="Helvetica Neue",
        fontsize="11",
    )
    graph.attr("edge", arrowsize="0.7", fontname="Helvetica Neue")

    qualifications = [
        q
        for q in catalog.qualifications
        if not (hide_deprecated and q.status == QualificationStatus.DEPRECATED)
    ]
    theme = category_theme(q.category for q in qualifications)

    for index, category in enumerate(sorted(theme)):
        with graph.subgraph(name=f"cluster_{index}") as sub:
            palette = theme[category]
            sub.attr(
                label=category,
                color=palette["accent"],
                fontcolor="#f5f6fa",
                style="rounded",
                penwidth="2.2",
                bgcolor=palette["background"],
            )
            for qualification in sorted(
                [q for q in qualifications if q.category == category], key=lambda item: item.title
            ):
                attrs = mesh_node_attributes(
                    theme,
                    qualification,
                    diff=diff,
                    highlight=qualification.id in highlight,
                )
                subtitle = f"\n{qualification.duration_hours or '—'}h" if qualification.duration_hours else ""
                sub.node(
                    qualification.id,
                    label=f"{qualification.title}{subtitle}",
                    **attrs,
                )

    highlight_edges: set[tuple[str, str]] = set()
    edge_pairs = {(edge.src, edge.dst) for edge in catalog.edges}
    if len(highlight) > 1:
        for src in highlight:
            for dst in highlight:
                if (src, dst) in edge_pairs:
                    highlight_edges.add((src, dst))

    visible_ids = {q.id for q in qualifications}
    for edge in catalog.edges:
        if hide_deprecated and edge.status == EdgeStatus.DEPRECATED:
            continue
        if not include_soft and edge.kind == EdgeKind.SOFT:
            continue
        if edge.src not in visible_ids or edge.dst not in visible_ids:
            continue
        attrs = mesh_edge_attributes(edge, highlight=(edge.src, edge.dst) in highlight_edges)
        label = "" if edge.kind == EdgeKind.HARD else "Empfehlung"
        graph.edge(edge.src, edge.dst, label=label, **attrs)

    return graph


def legend() -> Dict[str, str]:
    return {
        "Neu": "#27ae60",
        "Geändert": "#2980b9",
        "Deprecated": STATUS_COLOR[QualificationStatus.DEPRECATED],
        "Standard": "#ecf0f1",
    }

