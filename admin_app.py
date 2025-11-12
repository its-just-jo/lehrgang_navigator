"""Streamlit admin interface for the Ausbildungsnavigator."""

from __future__ import annotations

import json
from datetime import datetime

import streamlit as st

from navigator import admin, catalog, importer
from navigator.models import CatalogState, Edge, EdgeKind, EdgeStatus, Qualification
from navigator.repo import CatalogRepository


st.set_page_config(page_title="DLRG Navigator Admin", page_icon="🔐", layout="wide")


@st.cache_resource
def _repository() -> CatalogRepository:
    return CatalogRepository("data")


def _require_login() -> str | None:
    roles = st.secrets.get(
        "roles",
        {
            "admin": {"password": "admin", "role": "admin"},
            "viewer": {"password": "viewer", "role": "viewer"},
        },
    )

    if "role" in st.session_state:
        return st.session_state["role"]

    with st.sidebar.form("login"):
        st.subheader("Login")
        username = st.text_input("Benutzername")
        password = st.text_input("Passwort", type="password")
        submitted = st.form_submit_button("Anmelden")
        if submitted:
            role = admin.authenticate(username, password, roles)
            if role:
                st.session_state["role"] = role
                st.experimental_rerun()
            else:
                st.error("Ungültige Zugangsdaten")
    return None


def _render_validation(catalog_data) -> None:
    st.subheader("Validierung")
    report = catalog.validate_catalog(catalog_data)
    cols = st.columns(2)
    cols[0].metric("Fehler", len(report.errors))
    cols[1].metric("Warnungen", len(report.warnings))

    with st.expander("Details"):
        st.write("### Fehler")
        for issue in report.errors:
            st.error(f"[{issue.code}] {issue.message}")
        st.write("### Warnungen")
        for issue in report.warnings:
            st.warning(f"[{issue.code}] {issue.message}")

        st.download_button(
            "Bericht als JSON",
            data=json.dumps(
                {
                    "errors": [issue.__dict__ for issue in report.errors],
                    "warnings": [issue.__dict__ for issue in report.warnings],
                },
                ensure_ascii=False,
                indent=2,
            ),
            file_name="validation_report.json",
        )


def _render_catalog_table(catalog_data: catalog.Catalog, *, editable: bool) -> None:
    st.subheader("Qualifikationen")
    rows = [
        {
            "ID": q.id,
            "Titel": q.title,
            "Kategorie": q.category,
            "Status": q.status.value,
            "Tags": ", ".join(q.tags),
        }
        for q in catalog_data.qualifications
    ]
    st.dataframe(rows, use_container_width=True, hide_index=True)

    if editable:
        with st.expander("Neue Qualifikation anlegen"):
            with st.form("create_qualification"):
                title = st.text_input("Titel", max_chars=120)
                category = st.text_input("Kategorie")
                tags = st.text_input("Tags (kommagetrennt)")
                if st.form_submit_button("Speichern"):
                    identifier = catalog.slugify(title)
                    new_qualification = Qualification(
                        id=identifier,
                        title=title,
                        category=category,
                        tags=[tag.strip() for tag in tags.split(",") if tag.strip()],
                    )
                    repo = _repository()
                    updated_catalog = catalog.merge_catalog(catalog_data, [new_qualification])
                    repo.save(updated_catalog, user="admin")
                    st.success(f"Qualifikation {identifier} angelegt")
                    st.experimental_rerun()


def _render_edges(catalog_data: catalog.Catalog, *, editable: bool) -> None:
    st.subheader("Kanten")
    st.dataframe(
        [
            {
                "Quelle": edge.src,
                "Ziel": edge.dst,
                "Art": edge.kind.value,
                "Status": edge.status.value,
            }
            for edge in catalog_data.edges
        ],
        use_container_width=True,
        hide_index=True,
    )

    if editable:
        with st.expander("Neue Kante"):
            with st.form("create_edge"):
                src = st.selectbox("Quelle", options=[q.id for q in catalog_data.qualifications])
                dst = st.selectbox("Ziel", options=[q.id for q in catalog_data.qualifications])
                kind = st.selectbox("Art", options=[kind.value for kind in EdgeKind])
                note = st.text_input("Hinweis")
                submitted = st.form_submit_button("Prüfen & Anlegen")
                if submitted:
                    edge = Edge(src=src, dst=dst, kind=EdgeKind(kind), note=note, status=EdgeStatus.ACTIVE)
                    report = admin.live_cycle_check(catalog_data, edge)
                    if report.errors:
                        st.error("Die Kante erzeugt einen Zyklus und wurde nicht gespeichert.")
                    else:
                        repo = _repository()
                        updated_catalog = admin.add_edge(catalog_data, edge)
                        repo.save(updated_catalog, user="admin")
                        st.success("Kante gespeichert")
                        st.experimental_rerun()


def _render_versioning(role: str, catalog_data: catalog.Catalog) -> None:
    st.subheader("Versionierung")
    repo = _repository()
    if role == "admin":
        if st.button("Publish Draft"):
            report = catalog.validate_catalog(catalog_data)
            if report.errors:
                st.error("Publish blockiert – Fehler im Katalog")
            else:
                repo.publish(user="admin")
                st.success("Draft veröffentlicht")
    snapshots = repo.snapshots()
    st.write("Snapshots")
    for snapshot in snapshots:
        st.write(f"{snapshot.created_at:%Y-%m-%d %H:%M} – {snapshot.hash} ({snapshot.state.value})")


def _render_import(role: str, catalog_data: catalog.Catalog) -> None:
    if role != "admin":
        return
    st.subheader("Import")
    uploaded = st.file_uploader("Qualifikations-JSON", type=["json"])
    if uploaded:
        imported = importer.load_qualifications_from_json(uploaded)
        result = importer.deduplicate_import(catalog_data, imported)
        repo = _repository()
        repo.save(result["catalog"], user="admin")
        st.success(
            f"Importiert: {len(result['created'])} neu, {len(result['updated'])} aktualisiert"
        )
        st.experimental_rerun()


def main() -> None:
    role = _require_login()
    if not role:
        st.stop()

    repo = _repository()
    draft_catalog = repo.load(CatalogState.DRAFT)

    st.title("Ausbildungsnavigator Admin")
    st.caption(f"Angemeldet als: {role}")

    _render_validation(draft_catalog)
    _render_catalog_table(draft_catalog, editable=admin.can_edit(role))
    _render_edges(draft_catalog, editable=admin.can_edit(role))
    _render_import(role, draft_catalog)
    _render_versioning(role, draft_catalog)


if __name__ == "__main__":
    main()

