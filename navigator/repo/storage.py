"""File based repository for catalogues, snapshots and audit trail."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

from ..models import Catalog, CatalogState


@dataclass(frozen=True)
class Snapshot:
    """Metadata about a stored catalogue snapshot."""

    path: Path
    state: CatalogState
    created_at: datetime
    user: str
    hash: str


class CatalogRepository:
    """Load and store catalogues in JSON files.

    ``root`` is the directory that contains a ``draft.json`` and
    ``published.json`` file. All snapshots are stored in ``snapshots/`` and the
    audit log is located at ``audit.log``.
    """

    def __init__(self, root: str | os.PathLike[str] = "data") -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "snapshots").mkdir(exist_ok=True)

    # ------------------------------------------------------------------
    # helper io
    def _catalog_path(self, state: CatalogState) -> Path:
        return self.root / f"catalog_{state.value}.json"

    def _load(self, path: Path) -> Catalog:
        if not path.exists():
            return Catalog(state=CatalogState.DRAFT)
        with path.open("r", encoding="utf-8") as handle:
            return Catalog.from_dict(json.load(handle))

    def _write(self, path: Path, catalog: Catalog) -> None:
        with path.open("w", encoding="utf-8") as handle:
            json.dump(catalog.to_dict(), handle, indent=2, ensure_ascii=False)

    def _append_audit(self, entry: dict) -> None:
        entry = {**entry, "timestamp": datetime.utcnow().isoformat()}
        with (self.root / "audit.log").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # ------------------------------------------------------------------
    # public api
    def load(self, state: CatalogState) -> Catalog:
        catalog = self._load(self._catalog_path(state))
        return Catalog(
            qualifications=catalog.qualifications,
            edges=catalog.edges,
            state=state,
            created_at=catalog.created_at,
            created_by=catalog.created_by,
        )

    def save(self, catalog: Catalog, *, user: str, state: CatalogState | None = None) -> Catalog:
        target_state = state or catalog.state
        catalog = Catalog(
            qualifications=catalog.qualifications,
            edges=catalog.edges,
            state=target_state,
            created_at=catalog.created_at or datetime.utcnow(),
            created_by=catalog.created_by or user,
        )
        self._write(self._catalog_path(target_state), catalog)
        self._append_audit(
            {
                "action": "save",
                "state": target_state.value,
                "user": user,
                "counts": {
                    "qualifications": len(catalog.qualifications),
                    "edges": len(catalog.edges),
                },
            }
        )
        return catalog

    def publish(self, *, user: str) -> Snapshot:
        draft = self.load(CatalogState.DRAFT)
        path = self._catalog_path(CatalogState.PUBLISHED)
        self._write(path, draft)
        snapshot = self._write_snapshot(draft, CatalogState.PUBLISHED, user, action="publish")
        self._append_audit(
            {
                "action": "publish",
                "user": user,
                "hash": snapshot.hash,
            }
        )
        return snapshot

    def rollback(self, snapshot: Snapshot, *, user: str) -> Catalog:
        catalog = self._load(snapshot.path)
        self.save(catalog, user=user, state=CatalogState.PUBLISHED)
        self._append_audit(
            {
                "action": "rollback",
                "user": user,
                "hash": snapshot.hash,
            }
        )
        return catalog

    def snapshots(self) -> List[Snapshot]:
        result: List[Snapshot] = []
        for path in sorted((self.root / "snapshots").glob("*.json")):
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            result.append(
                Snapshot(
                    path=path,
                    state=CatalogState(payload["state"]),
                    created_at=datetime.fromisoformat(payload["created_at"]),
                    user=payload["user"],
                    hash=payload["hash"],
                )
            )
        return result

    # ------------------------------------------------------------------
    def _write_snapshot(
        self,
        catalog: Catalog,
        state: CatalogState,
        user: str,
        *,
        action: str,
    ) -> Snapshot:
        timestamp = datetime.utcnow()
        payload = catalog.to_dict()
        payload["state"] = state.value
        payload["created_at"] = timestamp.isoformat()
        payload["user"] = user
        payload["action"] = action
        data = json.dumps(payload, sort_keys=True)
        digest = f"{len(data)}:{hash(data)}"
        payload["hash"] = digest
        path = self.root / "snapshots" / f"{timestamp.strftime('%Y%m%d%H%M%S')}_{state.value}.json"
        with path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
        return Snapshot(path=path, state=state, created_at=timestamp, user=user, hash=digest)

