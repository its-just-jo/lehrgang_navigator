"""Public Streamlit interface for the Ausbildungsnavigator."""

from __future__ import annotations

import streamlit as st

from navigator import catalog, routing, styling
from navigator.models import CatalogDiff, CatalogState, QualificationStatus
from navigator.repo import CatalogRepository


st.set_page_config(page_title="DLRG Ausbildungsnavigator", page_icon="🛟", layout="wide")


@st.cache_resource
def _repository() -> CatalogRepository:
    return CatalogRepository("data")


@st.cache_data(show_spinner=False)
def _load_catalogs() -> tuple[catalog.Catalog, catalog.Catalog]:
    repo = _repository()
    published = repo.load(CatalogState.PUBLISHED)
    draft = repo.load(CatalogState.DRAFT)
    if not published.qualifications:
        published = draft
    return published, draft


def _render_overview(current_catalog: catalog.Catalog) -> None:
    stats = catalog.graph_statistics(current_catalog)
    total_duration = sum(filter(None, [q.duration_hours for q in current_catalog.qualifications]))
    stats["Gesamtstunden"] = total_duration
    cols = st.columns(len(stats))
    for col, (label, value) in zip(cols, stats.items()):
        col.metric(label.title(), value)


def _render_graph(
    current_catalog: catalog.Catalog,
    *,
    diff: CatalogDiff | None,
    include_soft: bool,
    hide_deprecated: bool,
    highlight_nodes: set[str],
) -> None:
    graph = styling.build_mesh_graph(
        current_catalog,
        diff=diff,
        include_soft=include_soft,
        hide_deprecated=hide_deprecated,
        highlight_nodes=highlight_nodes,
    )
    st.graphviz_chart(graph, use_container_width=True)

    legend_columns = st.columns(len(styling.legend()))
    for (label, color), column in zip(styling.legend().items(), legend_columns):
        column.markdown(
            f"<div style='background:{color};padding:0.4rem 0.6rem;border-radius:6px;text-align:center;color:#0f1115;font-weight:600'>{label}</div>",
            unsafe_allow_html=True,
        )


def _render_route(current_catalog: catalog.Catalog) -> set[str]:
    st.subheader("Navigator")
    all_active = [q for q in current_catalog.qualifications if q.status == QualificationStatus.ACTIVE]
    owned = st.multiselect(
        "Bereits vorhandene Qualifikationen",
        options=[q.id for q in all_active],
        format_func=lambda identifier: next(q.title for q in all_active if q.id == identifier),
    )
    target = st.selectbox(
        "Zielqualifikation",
        options=[q.id for q in all_active],
        format_func=lambda identifier: next(q.title for q in all_active if q.id == identifier),
    )

    highlight: set[str] = set(owned)
    if target:
        result = routing.route(current_catalog, owned, target)
        highlight.update(result["missing"] + [target])
        st.markdown(f"### Empfohlene Reihenfolge für **{target}**")
        if result["missing"]:
            steps = " → ".join(result["missing"] + [target])
            st.success(steps)
        else:
            st.success("Alle Voraussetzungen erfüllt.")

        with st.expander("Detailansicht"):
            st.json(result)

    st.caption("Die Visualisierung hebt die Route automatisch hervor.")
    return highlight


def _render_catalog_table(current_catalog: catalog.Catalog) -> None:
    st.subheader("Qualifikationskatalog")
    categories = sorted({q.category for q in current_catalog.qualifications})
    col1, col2 = st.columns(2)
    selected_category = col1.selectbox("Kategorie filtern", options=["Alle"] + categories)
    search = col2.text_input("Suche nach Titel oder Beschreibung")

    rows = []
    for q in current_catalog.qualifications:
        if selected_category != "Alle" and q.category != selected_category:
            continue
        if search and search.lower() not in (q.title.lower() + q.description.lower()):
            continue
        rows.append(
            {
                "ID": q.id,
                "Titel": q.title,
                "Kategorie": q.category,
                "Status": q.status.value,
                "Dauer (h)": q.duration_hours,
                "Beschreibung": q.description,
                "Tags": ", ".join(q.tags),
            }
        )
    st.dataframe(rows, use_container_width=True, hide_index=True)


def main() -> None:
    published, draft = _load_catalogs()
    diff = catalog.diff_catalogs(draft, published) if draft else None

    st.title("DLRG Ausbildungsnavigator")
    st.caption("Interaktives Routing durch den Ausbildungs-Katalog")

    menu = st.sidebar.radio(
        "Ansicht",
        (
            "Navigator",
            "Mesh-Graph",
            "Katalog",
        ),
        index=0,
    )

    include_soft = True
    hide_deprecated = True
    if menu == "Mesh-Graph":
        include_soft = st.sidebar.toggle("Empfehlungen anzeigen", value=True)
        hide_deprecated = st.sidebar.toggle("Deprecated ausblenden", value=True)

    _render_overview(published)

    if menu == "Navigator":
        highlight = _render_route(published)
        st.session_state["mesh_highlight"] = sorted(highlight)
    elif menu == "Mesh-Graph":
        highlight = set(st.session_state.get("mesh_highlight", []))
        _render_graph(
            published,
            diff=diff,
            include_soft=include_soft,
            hide_deprecated=hide_deprecated,
            highlight_nodes=highlight,
        )
    else:
        _render_catalog_table(published)


if __name__ == "__main__":
    main()

