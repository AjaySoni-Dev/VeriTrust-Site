from __future__ import annotations

import hashlib
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import config

TEXT_EXTENSIONS = config.ALLOWED_PROJECT_EXTENSIONS


def response(tool: str, success: bool, data: dict[str, Any] | None = None, error: str | None = None, *, run_id: str = "", started: float | None = None) -> dict[str, Any]:
    return {
        "success": success,
        "tool": tool,
        "data": data or {},
        "error": error,
        "metadata": {
            "duration_ms": int(((time.perf_counter() - started) if started else 0) * 1000),
            "run_id": run_id,
        },
    }


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_hash(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def safe_project_path(workspace_root: str | Path, relative_path: str, *, must_exist: bool = False, allow_dir: bool = False) -> Path:
    root = Path(workspace_root).resolve()
    if not relative_path or "\x00" in relative_path:
        raise ValueError("Path is empty or invalid.")
    candidate_input = Path(relative_path)
    if candidate_input.is_absolute():
        raise ValueError("Absolute paths are not allowed.")
    candidate = (root / candidate_input).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("Path escapes the project workspace.") from exc
    parts = candidate.relative_to(root).parts
    if any(part in config.INTERNAL_EXCLUDES or part.startswith(".agent") for part in parts):
        raise ValueError("Internal runtime paths are not accessible to the agent.")
    if not allow_dir and candidate.suffix.lower() not in config.ALLOWED_PROJECT_EXTENSIONS:
        raise ValueError(f"File type {candidate.suffix!r} is not allowed in the website MVP.")
    if must_exist and not candidate.exists():
        raise FileNotFoundError(relative_path)
    return candidate


def relative_from_root(workspace_root: str | Path, path: str | Path) -> str:
    return Path(path).resolve().relative_to(Path(workspace_root).resolve()).as_posix()


def atomic_write(path: Path, content: str, encoding: str = "utf-8") -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = content.encode(encoding)
    if len(encoded) > config.MAX_PROJECT_FILE_BYTES:
        raise ValueError(f"File exceeds MAX_PROJECT_FILE_BYTES ({config.MAX_PROJECT_FILE_BYTES}).")
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return len(encoded)


def redact_secret(text: str, *extra_secrets: str | None) -> str:
    if not text:
        return text
    candidates = [config.NVIDIA_API_KEY, *extra_secrets]
    for token in candidates:
        token = str(token or "").strip()
        if not token or token == "PASTE_YOUR_NVIDIA_API_KEY_HERE":
            continue
        text = text.replace(token, "[REDACTED_API_KEY]")
    return text
