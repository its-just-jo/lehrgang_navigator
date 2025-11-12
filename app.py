"""Public Streamlit interface for the Ausbildungsnavigator."""

from __future__ import annotations

import graphviz
import streamlit as st

from navigator import catalog, routing, styling
from navigator.models import CatalogState, QualificationStatus
from navigator.repo import CatalogRepository


st.set_page_config(page_title="DLRG Ausbildungsnavigator", page_icon="🛟", layout="wide")


@st.cache_resource
def _repository() -> CatalogRepository:
    return CatalogRepository("data")


@st.cache_data(show_spinner=False)
def _load_catalog() -> catalog.Catalog:
    repo = _repository()
    published = repo.load(CatalogState.PUBLISHED)
    if not published.qualifications:
        return repo.load(CatalogState.DRAFT)
    return published


def _render_overview(current_catalog: catalog.Catalog) -> None:
    stats = catalog.graph_statistics(current_catalog)
    cols = st.columns(len(stats))
    for col, (label, value) in zip(cols, stats.items()):
        col.metric(label.title(), value)


def _render_graph(current_catalog: catalog.Catalog) -> None:
    graph = graphviz.Digraph()
    active = {q.id: q for q in current_catalog.active_qualifications()}
    diff = catalog.diff_catalogs(current_catalog, current_catalog)
    for qualification in current_catalog.qualifications:
        color = styling.diff_color(diff, qualification.id, qualification.status)
        graph.node(qualification.id, label=qualification.title, style="filled", fillcolor=color)

    for edge in current_catalog.active_edges():
        graph.edge(edge.src, edge.dst, label=edge.kind.value)
    st.graphviz_chart(graph)


def _render_route(current_catalog: catalog.Catalog) -> None:
    st.subheader("Navigator")
    all_active = [q for q in current_catalog.qualifications if q.status != QualificationStatus.DEPRECATED]
    owned = st.multiselect("Bereits vorhandene Qualifikationen", options=[q.id for q in all_active])
    target = st.selectbox("Zielqualifikation", options=[q.id for q in all_active])

    if target:
        result = routing.route(current_catalog, owned, target)
        st.markdown(f"### Empfohlene Reihenfolge für **{target}**")
        if result["missing"]:
            st.write(" → ".join(result["missing"] + [target]))
        else:
            st.success("Alle Voraussetzungen erfüllt.")

        with st.expander("Detailansicht"):
            st.json(result)


def main() -> None:
    catalog_data = _load_catalog()
    st.title("DLRG Ausbildungsnavigator")
    st.caption("Interaktives Routing durch den Ausbildungs-Katalog")

    _render_overview(catalog_data)

    tabs = st.tabs(["Navigator", "Qualifikationen"])
    with tabs[0]:
        _render_route(catalog_data)

    with tabs[1]:
        _render_graph(catalog_data)


if __name__ == "__main__":
    main()

