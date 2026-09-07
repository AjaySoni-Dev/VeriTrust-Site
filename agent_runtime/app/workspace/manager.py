from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import config
from app.agent.state import atomic_json_write

_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{3,80}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkspaceManager:
    def __init__(self) -> None:
        self.root = config.WORKSPACES_DIR.resolve()
        self.artifacts = config.ARTIFACTS_DIR.resolve()
        self.runtime = config.RUNTIME_DIR.resolve()
        for path in (self.root, self.artifacts, self.runtime):
            path.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        if not config.PROJECTS_DB.exists():
            atomic_json_write(config.PROJECTS_DB, {"projects": {}})

    def _load_db(self) -> dict[str, Any]:
        try:
            return json.loads(config.PROJECTS_DB.read_text(encoding="utf-8"))
        except Exception:
            return {"projects": {}}

    def _save_db(self, db: dict[str, Any]) -> None:
        atomic_json_write(config.PROJECTS_DB, db)

    def create_project(self, name: str) -> dict[str, Any]:
        with self._lock:
            project_id = "proj_" + uuid.uuid4().hex[:12]
            now = _now()
            db = self._load_db()
            db.setdefault("projects", {})[project_id] = {
                "project_id": project_id,
                "name": name.strip() or "Untitled Project",
                "created_at": now,
                "updated_at": now,
                "latest_run_id": None,
                "run_count": 0,
            }
            (self.root / project_id / "runs").mkdir(parents=True, exist_ok=True)
            self._save_db(db)
            return db["projects"][project_id]

    def list_projects(self) -> list[dict[str, Any]]:
        with self._lock:
            projects = list(self._load_db().get("projects", {}).values())
            return sorted(projects, key=lambda p: p.get("updated_at", ""), reverse=True)

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        self.validate_project_id(project_id)
        with self._lock:
            return self._load_db().get("projects", {}).get(project_id)

    def validate_project_id(self, project_id: str) -> None:
        if not _ID_RE.match(project_id):
            raise ValueError("Invalid project id")

    def get_latest_workspace(self, project_id: str) -> Path | None:
        project = self.get_project(project_id)
        if not project or not project.get("latest_run_id"):
            return None
        path = self.root / project_id / "runs" / project["latest_run_id"] / "project"
        return path if path.exists() else None

    def create_run_workspace(self, project_id: str, run_id: str) -> dict[str, Path | bool]:
        self.validate_project_id(project_id)
        if not _ID_RE.match(run_id):
            raise ValueError("Invalid run id")
        project = self.get_project(project_id)
        if not project:
            raise KeyError("Project not found")
        run_root = self.root / project_id / "runs" / run_id
        workspace = run_root / "project"
        checkpoint_root = run_root / "checkpoints"
        if run_root.exists():
            raise FileExistsError(run_id)
        run_root.mkdir(parents=True)
        previous = self.get_latest_workspace(project_id)
        is_revision = previous is not None
        if previous:
            shutil.copytree(previous, workspace)
        else:
            workspace.mkdir(parents=True)
        checkpoint_root.mkdir(parents=True)
        return {
            "run_root": run_root,
            "workspace": workspace,
            "checkpoint_root": checkpoint_root,
            "is_revision": is_revision,
        }

    def complete_run(self, project_id: str, run_id: str, *, success: bool) -> None:
        with self._lock:
            db = self._load_db()
            project = db.get("projects", {}).get(project_id)
            if not project:
                return
            project["run_count"] = int(project.get("run_count", 0)) + 1
            project["updated_at"] = _now()
            if success:
                project["latest_run_id"] = run_id
            self._save_db(db)

    def artifact_path(self, project_id: str, run_id: str) -> Path:
        self.artifacts.mkdir(parents=True, exist_ok=True)
        return self.artifacts / f"{project_id}_{run_id}.zip"

    def resolve_preview_path(self, run_id: str, relative_path: str) -> Path:
        # Locate run id across projects, then enforce containment.
        if not _ID_RE.match(run_id):
            raise ValueError("Invalid run id")
        candidates = list(self.root.glob(f"*/runs/{run_id}/project"))
        if not candidates:
            raise FileNotFoundError(run_id)
        root = candidates[0].resolve()
        rel = relative_path or "index.html"
        candidate = (root / rel).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise PermissionError("Preview path escapes workspace") from exc
        if not candidate.exists() or not candidate.is_file():
            raise FileNotFoundError(rel)
        return candidate
