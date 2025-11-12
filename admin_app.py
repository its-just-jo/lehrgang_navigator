"""Streamlit admin interface for the Ausbildungsnavigator."""

from __future__ import annotations

import csv
import io
import json
from dataclasses import replace
from datetime import datetime

import streamlit as st

from navigator import admin, catalog, importer, routing, styling
from navigator.models import (
    CatalogState,
    Edge,
    EdgeKind,
    EdgeStatus,
    Qualification,
    QualificationStatus,
)
from navigator.repo import CatalogRepository


st.set_page_config(page_title="DLRG Navigator Admin", page_icon="🔐", layout="wide")


@st.cache_resource
def _repository() -> CatalogRepository:
    return CatalogRepository("data")


def _current_user() -> str:
    return st.session_state.get("username", "system")


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
                st.session_state["username"] = username
                st.experimental_rerun()
            else:
                st.error("Ungültige Zugangsdaten")
    return None


def _save_catalog(updated: catalog.Catalog, message: str) -> None:
    repo = _repository()
    repo.save(updated, user=_current_user())
    st.success(message)
    st.experimental_rerun()


def _simulate_route(source: catalog.Catalog, *, key: str) -> set[str]:
    active = [q for q in source.qualifications if q.status != QualificationStatus.DEPRECATED]
    if not active:
        st.info("Keine aktiven Qualifikationen verfügbar.")
        return set()

    options = [q.id for q in active]
    owned = st.multiselect(
        "Erfüllte Qualifikationen",
        options=options,
        format_func=lambda identifier: next(q.title for q in active if q.id == identifier),
        key=f"owned_{key}",
    )
    target = st.selectbox(
        "Zielqualifikation",
        options=options,
        format_func=lambda identifier: next(q.title for q in active if q.id == identifier),
        key=f"target_{key}",
    )

    highlight: set[str] = set(owned)
    if target:
        result = routing.route(source, owned, target)
        highlight.update(result["missing"] + [target])
        if result["missing"]:
            st.success(" → ".join(result["missing"] + [target]))
        else:
            st.success("Alle Voraussetzungen erfüllt.")
        with st.expander("Routendetails"):
            st.json(result)
    return highlight


def _qualifications_table(source: catalog.Catalog, *, status: str, category: str, search: str) -> list[dict]:
    rows: list[dict] = []
    for q in source.qualifications:
        if status != "Alle" and q.status.value != status:
            continue
        if category != "Alle" and q.category != category:
            continue
        haystack = (q.title + " " + q.description).lower()
        if search and search.lower() not in haystack:
            continue
        rows.append(
            {
                "ID": q.id,
                "Titel": q.title,
                "Kategorie": q.category,
                "Status": q.status.value,
                "Dauer (h)": q.duration_hours,
                "Tags": ", ".join(q.tags),
            }
        )
    return rows


def _validation_markdown(report: catalog.ValidationReport) -> str:
    lines = ["# Validierungsbericht", ""]
    lines.append("## Fehler")
    if report.errors:
        for issue in report.errors:
            lines.append(f"- **{issue.code}** – {issue.message}")
    else:
        lines.append("- keine")
    lines.append("")
    lines.append("## Warnungen")
    if report.warnings:
        for issue in report.warnings:
            lines.append(f"- **{issue.code}** – {issue.message}")
    else:
        lines.append("- keine")
    return "\n".join(lines)


def _qualifications_to_csv(source: catalog.Catalog) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "title", "category", "status", "duration_hours", "tags"])
    for q in source.qualifications:
        writer.writerow(
            [
                q.id,
                q.title,
                q.category,
                q.status.value,
                q.duration_hours or "",
                ";".join(q.tags),
            ]
        )
    return buffer.getvalue()


def _edges_to_csv(source: catalog.Catalog) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["src", "dst", "kind", "status", "note"])
    for edge in source.edges:
        writer.writerow([edge.src, edge.dst, edge.kind.value, edge.status.value, edge.note])
    return buffer.getvalue()


def _render_dashboard(role: str, draft: catalog.Catalog, published: catalog.Catalog) -> None:
    st.subheader("Katalogstatus")
    stats = catalog.graph_statistics(draft)
    cols = st.columns(4)
    cols[0].metric("Qualifikationen (Draft)", stats["qualifications"])
    cols[1].metric("Aktive", stats["active_qualifications"])
    cols[2].metric("Kanten", stats["edges"])
    cols[3].metric("Deprecated", stats["deprecated"])

    diff = catalog.diff_catalogs(draft, published)
    diff_cols = st.columns(3)
    diff_cols[0].metric("Neu vs. Live", len(diff.added))
    diff_cols[1].metric("Geändert", len(diff.changed))
    diff_cols[2].metric("Entfernt", len(diff.removed))

    report = catalog.validate_catalog(draft)
    warn_cols = st.columns(2)
    warn_cols[0].metric("Validierungsfehler", len(report.errors))
    warn_cols[1].metric("Warnungen", len(report.warnings))

    with st.expander("Route-Simulation"):
        source_choice = st.radio(
            "Katalog", ("Draft", "Published"), horizontal=True, key="dashboard_route_catalog"
        )
        source = draft if source_choice == "Draft" else published
        highlight = _simulate_route(source, key=f"dashboard_{source_choice}")
        st.session_state["admin_route_highlight"] = sorted(highlight)


def _render_qualifications(role: str, draft: catalog.Catalog, published: catalog.Catalog) -> None:
    st.subheader("Qualifikationen verwalten")
    status_filter = st.selectbox(
        "Status filtern",
        options=["Alle"] + [status.value for status in QualificationStatus],
        index=0,
    )
    categories = sorted({q.category for q in draft.qualifications})
    category_filter = st.selectbox("Kategorie", options=["Alle"] + categories)
    search = st.text_input("Freitextsuche")

    rows = _qualifications_table(draft, status=status_filter, category=category_filter, search=search)
    st.dataframe(rows, use_container_width=True, hide_index=True)

    if not admin.can_edit(role):
        st.info("Nur Administratoren können Datensätze bearbeiten.")
        return

    mapping = draft.qualification_map()
    selection = st.selectbox(
        "Eintrag auswählen",
        options=["—"] + [q.id for q in draft.qualifications],
        format_func=lambda identifier: mapping[identifier].title if identifier in mapping else "Bitte wählen",
    )

    if selection != "—":
        current = mapping[selection]
        published_version = published.qualification_map().get(selection)
        with st.form(f"edit_{selection}"):
            title = st.text_input("Titel", value=current.title)
            category = st.text_input("Kategorie", value=current.category)
            description = st.text_area("Beschreibung", value=current.description, height=180)
            duration = st.number_input(
                "Dauer (Stunden)", min_value=0, max_value=400, value=current.duration_hours or 0
            )
            tags = st.text_input("Tags (kommagetrennt)", value=", ".join(current.tags))
            aliases = st.text_input("Aliase (kommagetrennt)", value=", ".join(current.aliases))
            status = st.selectbox(
                "Status",
                options=[s.value for s in QualificationStatus],
                index=[s.value for s in QualificationStatus].index(current.status.value),
            )
            submitted = st.form_submit_button("Änderungen speichern")
            if submitted:
                updated = admin.apply_status_transition(current, status)
                updated = replace(
                    updated,
                    title=title,
                    category=category,
                    description=description,
                    duration_hours=duration or None,
                    tags=[tag.strip() for tag in tags.split(",") if tag.strip()],
                    aliases=[alias.strip() for alias in aliases.split(",") if alias.strip()],
                )
                updated = updated.with_version_bump(_current_user())
                _save_catalog(admin.update_qualification(draft, updated), f"{updated.title} aktualisiert")

        if published_version:
            delta = {}
            for field in ["title", "category", "description", "duration_hours", "tags", "aliases", "status"]:
                if getattr(published_version, field) != getattr(current, field):
                    delta[field] = {
                        "published": getattr(published_version, field),
                        "draft": getattr(current, field),
                    }
            if delta:
                st.write("Diff zur veröffentlichten Version")
                st.json(delta)

        action_cols = st.columns(2)
        with action_cols[0]:
            if st.button("Duplikat anlegen", key=f"duplicate_{selection}"):
                base_title = f"{current.title} (Kopie)"
                base_id = catalog.slugify(base_title)
                suffix = 1
                existing_ids = set(mapping.keys())
                new_id = base_id
                while new_id in existing_ids:
                    suffix += 1
                    new_id = f"{base_id}-{suffix}"
                now = datetime.utcnow()
                duplicate = replace(
                    current,
                    id=new_id,
                    title=base_title,
                    status=QualificationStatus.DRAFT,
                    aliases=[],
                    created_at=now,
                    updated_at=now,
                    created_by=_current_user(),
                    version=1,
                )
                _save_catalog(catalog.merge_catalog(draft, [duplicate]), f"{duplicate.title} erstellt")
        with action_cols[1]:
            if st.button("Deprecate/Umschalten", key=f"deprecate_{selection}"):
                new_status = (
                    QualificationStatus.DEPRECATED
                    if current.status != QualificationStatus.DEPRECATED
                    else QualificationStatus.ACTIVE
                )
                toggled = replace(current, status=new_status).with_version_bump(_current_user())
                _save_catalog(admin.update_qualification(draft, toggled), f"Status auf {new_status.value} gesetzt")

    with st.expander("Massenbearbeitung"):
        ids = st.multiselect(
            "Auswahl",
            options=[q.id for q in draft.qualifications],
            format_func=lambda identifier: mapping[identifier].title,
        )
        bulk_status = st.selectbox("Neuer Status", [s.value for s in QualificationStatus], key="bulk_status")
        if st.button("Status aktualisieren") and ids:
            updated_catalog = admin.bulk_update_status(draft, ids, bulk_status, user=_current_user())
            _save_catalog(updated_catalog, "Status aktualisiert")

    with st.expander("Neue Qualifikation anlegen"):
        with st.form("create_qualification"):
            title = st.text_input("Titel", max_chars=140)
            category = st.text_input("Kategorie")
            description = st.text_area("Beschreibung", height=160)
            duration = st.number_input("Dauer (Stunden)", min_value=0, max_value=400, value=0)
            status = st.selectbox("Status", options=[s.value for s in QualificationStatus], index=0)
            tags = st.text_input("Tags (kommagetrennt)")
            aliases = st.text_input("Aliase (kommagetrennt)")
            submitted = st.form_submit_button("Anlegen")
            if submitted:
                if not title:
                    st.error("Titel ist ein Pflichtfeld.")
                else:
                    base_id = catalog.slugify(title)
                    existing = {q.id for q in draft.qualifications}
                    candidate = base_id
                    suffix = 1
                    while candidate in existing:
                        candidate = f"{base_id}-{suffix}"
                        suffix += 1
                    now = datetime.utcnow()
                    new_qualification = Qualification(
                        id=candidate,
                        title=title,
                        category=category,
                        description=description,
                        duration_hours=duration or None,
                        tags=[tag.strip() for tag in tags.split(",") if tag.strip()],
                        aliases=[alias.strip() for alias in aliases.split(",") if alias.strip()],
                        status=QualificationStatus(status),
                        created_at=now,
                        updated_at=now,
                        created_by=_current_user(),
                    )
                    _save_catalog(
                        catalog.merge_catalog(draft, [new_qualification]),
                        f"{new_qualification.title} angelegt",
                    )


def _render_edges(role: str, draft: catalog.Catalog) -> None:
    st.subheader("Abhängigkeiten pflegen")
    kind_filter = st.selectbox("Art", options=["Alle"] + [k.value for k in EdgeKind])
    status_filter = st.selectbox("Status", options=["Alle"] + [s.value for s in EdgeStatus])

    filtered = []
    for edge in draft.edges:
        if kind_filter != "Alle" and edge.kind.value != kind_filter:
            continue
        if status_filter != "Alle" and edge.status.value != status_filter:
            continue
        filtered.append(
            {
                "Quelle": edge.src,
                "Ziel": edge.dst,
                "Art": edge.kind.value,
                "Status": edge.status.value,
                "Hinweis": edge.note,
            }
        )
    st.dataframe(filtered, use_container_width=True, hide_index=True)

    if not admin.can_edit(role):
        return

    with st.expander("Neue Kante anlegen"):
        with st.form("create_edge"):
            options = [q.id for q in draft.qualifications]
            src = st.selectbox("Quelle", options=options)
            dst = st.selectbox("Ziel", options=options)
            kind = st.selectbox("Art", options=[kind.value for kind in EdgeKind])
            note = st.text_input("Hinweis")
            submitted = st.form_submit_button("Prüfen & Speichern")
            if submitted:
                edge = Edge(
                    src=src,
                    dst=dst,
                    kind=EdgeKind(kind),
                    note=note,
                    status=EdgeStatus.ACTIVE,
                )
                report = admin.live_cycle_check(draft, edge)
                if report.errors:
                    st.error("Die Kante erzeugt einen Zyklus und wurde nicht gespeichert.")
                    for issue in report.errors:
                        st.write(f"- {issue.message}")
                else:
                    _save_catalog(admin.add_edge(draft, edge), "Kante gespeichert")

    with st.expander("Kante entfernen"):
        if not draft.edges:
            st.info("Keine Kanten vorhanden.")
        else:
            labels = {f"{edge.src} → {edge.dst} ({edge.kind.value})": edge for edge in draft.edges}
            choice = st.selectbox("Auswahl", options=list(labels.keys()))
            if st.button("Entfernen"):
                _save_catalog(admin.remove_edge(draft, labels[choice]), "Kante entfernt")


def _render_validation(draft: catalog.Catalog) -> None:
    st.subheader("Validierung & Bericht")
    report = catalog.validate_catalog(draft)
    cols = st.columns(2)
    cols[0].metric("Fehler", len(report.errors))
    cols[1].metric("Warnungen", len(report.warnings))

    with st.expander("Details"):
        if report.errors:
            st.error("Fehler")
            for issue in report.errors:
                st.write(f"- [{issue.code}] {issue.message}")
        else:
            st.success("Keine Fehler gefunden.")
        if report.warnings:
            st.warning("Warnungen")
            for issue in report.warnings:
                st.write(f"- [{issue.code}] {issue.message}")
        else:
            st.info("Keine Warnungen.")

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
    st.download_button(
        "Bericht als Markdown",
        data=_validation_markdown(report),
        file_name="validation_report.md",
    )


def _render_graph_preview(draft: catalog.Catalog, published: catalog.Catalog) -> None:
    st.subheader("Graph-Vorschau")
    include_soft = st.toggle("Soft-Kanten anzeigen", value=True)
    hide_deprecated = st.toggle("Deprecated ausblenden", value=True)
    view = st.radio("Quelle", ("Draft", "Published"), horizontal=True)
    source = draft if view == "Draft" else published
    diff = catalog.diff_catalogs(draft, published) if view == "Draft" else None
    highlight = set(st.session_state.get("admin_route_highlight", []))
    graph = styling.build_mesh_graph(
        source,
        diff=diff,
        include_soft=include_soft,
        hide_deprecated=hide_deprecated,
        highlight_nodes=highlight,
    )
    st.graphviz_chart(graph, use_container_width=True)
    legend_columns = st.columns(len(styling.legend()))
    for (label, color), column in zip(styling.legend().items(), legend_columns):
        column.markdown(
            f"<div style='background:{color};padding:0.4rem;border-radius:6px;text-align:center;color:#0f1115;font-weight:600'>{label}</div>",
            unsafe_allow_html=True,
        )


def _render_import_export(role: str, draft: catalog.Catalog, published: catalog.Catalog) -> None:
    st.subheader("Import & Export")
    if not admin.can_edit(role):
        st.info("Nur Administratoren dürfen Importe durchführen.")
    else:
        uploaded_json = st.file_uploader("Qualifikations-JSON", type=["json"], key="import_json")
        if uploaded_json and st.button("JSON-Import prüfen"):
            stream = io.StringIO(uploaded_json.getvalue().decode("utf-8"))
            imported = importer.load_qualifications_from_json(stream)
            result = importer.deduplicate_import(draft, imported)
            st.success(
                f"Dry-Run: {len(result['created'])} neu, {len(result['updated'])} aktualisiert"
            )
            st.session_state["import_result"] = result
        if "import_result" in st.session_state and st.button("Import anwenden"):
            result = st.session_state.pop("import_result")
            _save_catalog(result["catalog"], "Import übernommen")

        with st.expander("CSV/XLSX Import (Lehrgänge)"):
            uploaded_tabular = st.file_uploader("Datei wählen", type=["csv", "xlsx"], key="import_tabular")
            if uploaded_tabular:
                col_map = st.columns(3)
                title_column = col_map[0].text_input("Titel-Spalte", value="title")
                category_column = col_map[1].text_input("Kategorie-Spalte", value="category")
                description_column = col_map[2].text_input("Beschreibung-Spalte", value="description")
                if st.button("Tabellenimport prüfen"):
                    filetype = "xlsx" if uploaded_tabular.name.lower().endswith(".xlsx") else "csv"
                    rows = importer.load_tabular_courses(
                        io.BytesIO(uploaded_tabular.getvalue()),
                        mapping={
                            title_column: "title",
                            category_column: "category",
                            description_column: "description",
                        },
                        filetype=filetype,
                    )
                    imported = [
                        Qualification(
                            id="",
                            title=row.get("title", ""),
                            category=row.get("category", ""),
                            description=row.get("description", ""),
                            duration_hours=None,
                            status=QualificationStatus.DRAFT,
                        )
                        for row in rows
                    ]
                    result = importer.deduplicate_import(draft, imported)
                    st.success(
                        f"Dry-Run: {len(result['created'])} neu, {len(result['updated'])} aktualisiert"
                    )
                    st.session_state["import_result"] = result

    st.write("---")
    st.write("### Export")
    st.download_button(
        "Draft als JSON",
        data=json.dumps(draft.to_dict(), ensure_ascii=False, indent=2),
        file_name="catalog_draft.json",
    )
    st.download_button(
        "Published als JSON",
        data=json.dumps(published.to_dict(), ensure_ascii=False, indent=2),
        file_name="catalog_published.json",
    )
    st.download_button(
        "Draft Knoten (CSV)",
        data=_qualifications_to_csv(draft),
        file_name="qualifikationen_draft.csv",
    )
    st.download_button(
        "Draft Kanten (CSV)",
        data=_edges_to_csv(draft),
        file_name="kanten_draft.csv",
    )


def _render_versioning(role: str, draft: catalog.Catalog) -> None:
    st.subheader("Versionierung & Rollback")
    repo = _repository()
    if admin.can_edit(role):
        if st.button("Draft veröffentlichen"):
            report = catalog.validate_catalog(draft)
            if report.errors:
                st.error("Publish blockiert – zuerst Fehler beheben.")
            else:
                repo.publish(user=_current_user())
                st.success("Draft veröffentlicht")
                st.experimental_rerun()
    snapshots = repo.snapshots()
    if snapshots:
        labels = [
            f"{snap.created_at:%Y-%m-%d %H:%M} – {snap.state.value} – {snap.hash[:12]}" for snap in snapshots
        ]
        selection = st.selectbox("Snapshot auswählen", options=labels)
        chosen = snapshots[labels.index(selection)]
        if admin.can_edit(role) and st.button("Rollback auf Snapshot"):
            repo.rollback(chosen, user=_current_user())
            st.success("Rollback durchgeführt")
            st.experimental_rerun()
        st.dataframe(
            [
                {
                    "Zeit": snap.created_at.strftime("%Y-%m-%d %H:%M"),
                    "State": snap.state.value,
                    "User": snap.user,
                    "Hash": snap.hash,
                }
                for snap in snapshots
            ],
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.info("Noch keine Snapshots vorhanden.")


def _render_audit() -> None:
    st.subheader("Audit-Trail")
    repo = _repository()
    entries = repo.audit_entries(limit=200)
    if not entries:
        st.info("Noch keine Audit-Einträge vorhanden.")
        return
    st.dataframe(entries, use_container_width=True, hide_index=True)
    st.download_button(
        "Audit-Log exportieren",
        data=json.dumps(entries, ensure_ascii=False, indent=2),
        file_name="audit_log.json",
    )


def main() -> None:
    role = _require_login()
    if not role:
        st.stop()

    repo = _repository()
    draft_catalog = repo.load(CatalogState.DRAFT)
    published_catalog = repo.load(CatalogState.PUBLISHED)

    st.sidebar.title("Navigation")
    if st.sidebar.button("Abmelden"):
        st.session_state.pop("role", None)
        st.session_state.pop("username", None)
        st.experimental_rerun()

    section = st.sidebar.radio(
        "Bereich",
        (
            "Dashboard",
            "Qualifikationen",
            "Kanten",
            "Validierung",
            "Graph",
            "Import/Export",
            "Versionierung",
            "Audit",
        ),
        index=0,
    )

    st.title("Ausbildungsnavigator Admin")
    st.caption(f"Angemeldet als: {_current_user()} ({role})")

    if section == "Dashboard":
        _render_dashboard(role, draft_catalog, published_catalog)
    elif section == "Qualifikationen":
        _render_qualifications(role, draft_catalog, published_catalog)
    elif section == "Kanten":
        _render_edges(role, draft_catalog)
    elif section == "Validierung":
        _render_validation(draft_catalog)
    elif section == "Graph":
        _render_graph_preview(draft_catalog, published_catalog)
    elif section == "Import/Export":
        _render_import_export(role, draft_catalog, published_catalog)
    elif section == "Versionierung":
        _render_versioning(role, draft_catalog)
    else:
        _render_audit()


if __name__ == "__main__":
    main()
