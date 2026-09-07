from __future__ import annotations

import fnmatch
import os
import re
import shutil
import time
from pathlib import Path
from typing import Any

import config
from app.tools.common import atomic_write, file_hash, relative_from_root, response, safe_project_path

DEFAULT_EXCLUDES = set(config.INTERNAL_EXCLUDES)


def _is_excluded(parts: tuple[str, ...], extra: list[str] | None = None) -> bool:
    patterns = list(extra or [])
    for part in parts:
        if part in DEFAULT_EXCLUDES or part.startswith(".agent"):
            return True
        if any(fnmatch.fnmatch(part, pat) for pat in patterns):
            return True
    return False


def list_files(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = Path(args["workspace_root"]).resolve()
        recursive = args.get("recursive", True)
        extra_exclude = args.get("exclude", [])
        max_entries = int(args.get("max_entries", 500))
        files: list[str] = []
        directories: list[str] = []
        iterator = root.rglob("*") if recursive else root.glob("*")
        truncated = False
        for item in iterator:
            rel = item.relative_to(root)
            if _is_excluded(rel.parts, extra_exclude):
                continue
            if item.is_dir():
                directories.append(rel.as_posix())
            elif item.is_file() and item.suffix.lower() in config.ALLOWED_PROJECT_EXTENSIONS:
                files.append(rel.as_posix())
            if len(files) + len(directories) >= max_entries:
                truncated = True
                break
        files.sort()
        directories.sort()
        return response("list_files", True, {"files": files, "directories": directories, "truncated": truncated}, run_id=run_id, started=started)
    except Exception as exc:
        return response("list_files", False, error=str(exc), run_id=run_id, started=started)


def search_files(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = Path(args["workspace_root"]).resolve()
        query = str(args.get("query", ""))
        if not query:
            raise ValueError("query is required")
        patterns = args.get("patterns") or ["*.html", "*.css", "*.js", "*.json", "*.md", "*.txt", "*.svg"]
        max_results = max(1, min(int(args.get("max_results", 20)), 50))
        context_lines = max(0, min(int(args.get("context_lines", 2)), 8))
        regex = re.compile(re.escape(query), re.IGNORECASE)
        matches: list[dict[str, Any]] = []
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(root)
            if _is_excluded(rel.parts):
                continue
            if not any(fnmatch.fnmatch(path.name, pat) for pat in patterns):
                continue
            if path.stat().st_size > config.MAX_PROJECT_FILE_BYTES:
                continue
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except UnicodeDecodeError:
                continue
            for idx, line in enumerate(lines):
                if regex.search(line):
                    lo = max(0, idx - context_lines)
                    hi = min(len(lines), idx + context_lines + 1)
                    matches.append({
                        "path": rel.as_posix(),
                        "line": idx + 1,
                        "snippet": "\n".join(lines[lo:hi]),
                    })
                    if len(matches) >= max_results:
                        return response("search_files", True, {"matches": matches, "truncated": True}, run_id=run_id, started=started)
        return response("search_files", True, {"matches": matches, "truncated": False}, run_id=run_id, started=started)
    except Exception as exc:
        return response("search_files", False, error=str(exc), run_id=run_id, started=started)


def read_file(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        path = safe_project_path(root, args["path"], must_exist=True)
        max_bytes = min(int(args.get("max_bytes", config.MAX_FILE_BYTES_IN_CONTEXT)), config.MAX_PROJECT_FILE_BYTES)
        data = path.read_bytes()
        truncated = len(data) > max_bytes
        text = data[:max_bytes].decode("utf-8", errors="replace")
        lines = text.splitlines()
        start_line = args.get("start_line")
        end_line = args.get("end_line")
        if start_line is not None or end_line is not None:
            start = max(1, int(start_line or 1))
            end = max(start, int(end_line or len(lines)))
            selected = lines[start - 1:end]
            content = "\n".join(selected)
            line_range = [start, min(end, len(lines))]
        else:
            content = text
            line_range = [1, len(lines)]
        return response("read_file", True, {
            "path": relative_from_root(root, path),
            "content": content,
            "version": file_hash(path),
            "range": line_range,
            "truncated": truncated,
            "bytes": len(data),
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("read_file", False, error=str(exc), run_id=run_id, started=started)


def create_file(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        path = safe_project_path(root, args["path"])
        overwrite = bool(args.get("overwrite", False))
        if path.exists() and not overwrite:
            raise FileExistsError(f"{args['path']} already exists")
        size = atomic_write(path, str(args.get("content", "")), args.get("encoding", "utf-8"))
        return response("create_file", True, {
            "path": relative_from_root(root, path),
            "created": True,
            "version": file_hash(path),
            "bytes": size,
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("create_file", False, error=str(exc), run_id=run_id, started=started)


def create_files(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    root = args.get("workspace_root")
    files = args.get("files") or []
    overwrite = bool(args.get("overwrite", False))
    atomic_batch = bool(args.get("atomic_batch", True))
    backups: dict[Path, bytes | None] = {}
    results: list[dict] = []
    try:
        if not files:
            raise ValueError("files must not be empty")
        # Validate all paths and sizes before mutating anything.
        validated: list[tuple[Path, dict]] = []
        for item in files:
            path = safe_project_path(root, item["path"])
            encoded = str(item.get("content", "")).encode("utf-8")
            if len(encoded) > config.MAX_PROJECT_FILE_BYTES:
                raise ValueError(f"{item['path']} exceeds file-size policy")
            if path.exists() and not overwrite:
                raise FileExistsError(f"{item['path']} already exists")
            validated.append((path, item))
        for path, item in validated:
            backups[path] = path.read_bytes() if path.exists() else None
            content = str(item.get("content", ""))
            size = atomic_write(path, content)
            version = file_hash(path)
            # A newly created file is a real change event. Reporting its line
            # count here keeps the UI change summary truthful even when a later
            # verification repair edits only one of the three generated files.
            line_count = len(content.splitlines()) if content else 0
            results.append({
                "path": relative_from_root(root, path),
                "success": True,
                "created": True,
                "old_version": None,
                "new_version": version,
                "version": version,
                "bytes": size,
                "lines_added": line_count,
                "lines_removed": 0,
                "diff_preview": None,
            })
        return response("create_files", True, {
            "results": results,
            "created_count": len(results),
            "failed_count": 0,
        }, run_id=run_id, started=started)
    except Exception as exc:
        if atomic_batch:
            for path, original in backups.items():
                try:
                    if original is None:
                        if path.exists():
                            path.unlink()
                    else:
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_bytes(original)
                except Exception:
                    pass
        return response("create_files", False, {
            "results": results,
            "created_count": sum(1 for x in results if x.get("success")),
            "failed_count": 1,
        }, error=str(exc), run_id=run_id, started=started)


def edit_file(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        path = safe_project_path(root, args["path"], must_exist=True)
        current_version = file_hash(path)
        if current_version != args["expected_version"]:
            raise ValueError("stale_file_version")
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        start_line = int(args["start_line"])
        end_line = int(args["end_line"])
        if start_line < 1 or end_line < start_line or end_line > len(lines):
            raise ValueError("invalid line range")
        replacement = str(args.get("replacement", ""))
        if replacement and not replacement.endswith("\n") and lines[end_line - 1].endswith("\n"):
            replacement += "\n"
        new_text = "".join(lines[: start_line - 1]) + replacement + "".join(lines[end_line:])
        atomic_write(path, new_text)
        return response("edit_file", True, {
            "path": relative_from_root(root, path),
            "new_version": file_hash(path),
            "replaced_range": [start_line, end_line],
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("edit_file", False, error=str(exc), run_id=run_id, started=started)


def move_file(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        source = safe_project_path(root, args["source"], must_exist=True)
        destination = safe_project_path(root, args["destination"])
        if destination.exists() and not args.get("overwrite", False):
            raise FileExistsError(args["destination"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source, destination)
        return response("move_file", True, {
            "source": args["source"], "destination": args["destination"], "version": file_hash(destination)
        }, run_id=run_id, started=started)
    except Exception as exc:
        return response("move_file", False, error=str(exc), run_id=run_id, started=started)


def delete_file(args: dict) -> dict:
    started = time.perf_counter()
    run_id = args.get("run_id", "")
    try:
        root = args["workspace_root"]
        path = safe_project_path(root, args["path"], must_exist=True)
        if file_hash(path) != args["expected_version"]:
            raise ValueError("stale_file_version")
        if args.get("require_checkpoint", True) and not args.get("checkpoint_id"):
            raise ValueError("checkpoint_required")
        path.unlink()
        return response("delete_file", True, {"path": args["path"], "deleted": True}, run_id=run_id, started=started)
    except Exception as exc:
        return response("delete_file", False, error=str(exc), run_id=run_id, started=started)
