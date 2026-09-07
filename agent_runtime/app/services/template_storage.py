from __future__ import annotations

import hashlib
import io
import json
import os
import stat
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import PurePosixPath
from typing import Any

from app.services.codex_vault import NexoraUser, authenticate_user


class TemplateStorageError(RuntimeError):
    pass


CATALOG_CACHE_TTL_SECONDS = 60.0
MAX_CATALOG_BYTES = 2 * 1024 * 1024
MAX_PACKAGE_BYTES = 12 * 1024 * 1024
MAX_TEMPLATE_FILE_BYTES = 1_900_000
MAX_TEMPLATE_TOTAL_TEXT_BYTES = 4_000_000
MAX_TEMPLATE_FILES = 24
ALLOWED_TEXT_SUFFIXES = {
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".svg", ".md", ".txt"
}
PAID_STATUSES = {"active", "trialing", "paid"}

_catalog_cache: dict[str, Any] = {"loaded_at": 0.0, "payload": None}


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _supabase_url() -> str:
    value = _env("SUPABASE_URL").rstrip("/")
    if not value:
        raise TemplateStorageError("SUPABASE_URL is not configured on Vercel.")
    return value


def _anon_key() -> str:
    value = _env("SUPABASE_PUBLISHABLE_KEY") or _env("SUPABASE_ANON_KEY")
    if not value:
        raise TemplateStorageError("SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is not configured on Vercel.")
    return value


def _admin_key() -> str:
    # Prefer Supabase's current secret-key format; legacy service_role remains supported.
    value = _env("SUPABASE_SECRET_KEY") or _env("SUPABASE_SERVICE_ROLE_KEY")
    if not value:
        raise TemplateStorageError(
            "SUPABASE_SECRET_KEY (recommended) or SUPABASE_SERVICE_ROLE_KEY is required on Vercel to read private template packages."
        )
    return value


def preview_bucket() -> str:
    return _env("NEXORA_TEMPLATE_PREVIEW_BUCKET", "template-previews")


def package_bucket() -> str:
    return _env("NEXORA_TEMPLATE_PACKAGE_BUCKET", "template-packages")


def catalog_path() -> str:
    return _env("NEXORA_TEMPLATE_CATALOG_PATH", "catalog.json").lstrip("/")


def template_storage_configured() -> bool:
    return bool(
        _env("SUPABASE_URL")
        and (_env("SUPABASE_PUBLISHABLE_KEY") or _env("SUPABASE_ANON_KEY"))
        and (_env("SUPABASE_SECRET_KEY") or _env("SUPABASE_SERVICE_ROLE_KEY"))
    )


def _encode_path(path: str) -> str:
    return "/".join(urllib.parse.quote(part, safe="") for part in path.split("/") if part)


def public_object_url(bucket: str, path: str) -> str:
    return f"{_supabase_url()}/storage/v1/object/public/{urllib.parse.quote(bucket, safe='')}/{_encode_path(path)}"


def _read_http(request: urllib.request.Request, *, timeout: float, max_bytes: int) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            length = response.headers.get("Content-Length")
            if length:
                try:
                    if int(length) > max_bytes:
                        raise TemplateStorageError("Supabase object is larger than the Nexora safety limit.")
                except ValueError:
                    pass
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise TemplateStorageError("Supabase object is larger than the Nexora safety limit.")
            return data
    except TemplateStorageError:
        raise
    except urllib.error.HTTPError as exc:
        raw = exc.read(4096).decode("utf-8", errors="replace")
        if exc.code in {401, 403}:
            raise TemplateStorageError(
                "Supabase rejected private template access. Verify the Vercel SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY and keep template-packages private."
            ) from exc
        if exc.code == 404:
            raise TemplateStorageError("The requested template object does not exist in Supabase Storage.") from exc
        raise TemplateStorageError(f"Supabase Storage returned HTTP {exc.code}: {raw[:500]}") from exc
    except urllib.error.URLError as exc:
        raise TemplateStorageError(f"Could not reach Supabase Storage: {exc.reason}") from exc


def load_catalog(*, force: bool = False) -> dict[str, Any]:
    now = time.monotonic()
    cached = _catalog_cache.get("payload")
    if not force and isinstance(cached, dict) and (now - float(_catalog_cache.get("loaded_at") or 0)) < CATALOG_CACHE_TTL_SECONDS:
        return cached

    request = urllib.request.Request(
        public_object_url(preview_bucket(), catalog_path()),
        headers={"Accept": "application/json", "User-Agent": "Nexora-AI-Template-Runtime/1.0"},
        method="GET",
    )
    raw = _read_http(request, timeout=15.0, max_bytes=MAX_CATALOG_BYTES)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise TemplateStorageError("template-previews/catalog.json is not valid JSON.") from exc
    templates = payload.get("templates") if isinstance(payload, dict) else None
    if not isinstance(templates, list) or not templates:
        raise TemplateStorageError("template-previews/catalog.json does not contain a non-empty templates array.")
    _catalog_cache["payload"] = payload
    _catalog_cache["loaded_at"] = now
    return payload


def _find_template(template_id: str, version: str | None = None) -> dict[str, Any]:
    wanted_id = str(template_id or "").strip()
    wanted_version = str(version or "").strip()
    if not wanted_id:
        raise TemplateStorageError("Template ID is required.")
    for row in load_catalog().get("templates", []):
        if not isinstance(row, dict):
            continue
        row_id = str(row.get("template_id") or row.get("id") or "").strip()
        if row_id != wanted_id:
            continue
        row_version = str(row.get("version") or "").strip()
        if wanted_version and row_version != wanted_version:
            continue
        return row
    raise TemplateStorageError("The selected template/version is not in the published Supabase catalog.")


def _billing_row(user: NexoraUser) -> dict[str, Any] | None:
    key = _anon_key()
    query = urllib.parse.urlencode({
        "user_id": f"eq.{user.id}",
        "select": "plan_tier,status",
        "limit": "1",
    })
    request = urllib.request.Request(
        f"{_supabase_url()}/rest/v1/billing?{query}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {user.access_token}",
            "Accept": "application/json",
            "User-Agent": "Nexora-AI-Template-Runtime/1.0",
        },
        method="GET",
    )
    try:
        raw = _read_http(request, timeout=12.0, max_bytes=64 * 1024)
        payload = json.loads(raw.decode("utf-8"))
    except TemplateStorageError:
        raise
    except Exception as exc:
        raise TemplateStorageError("Could not read the signed-in user's billing entitlement from Supabase.") from exc
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return payload[0]
    return None


def _assert_entitled(user: NexoraUser, template: dict[str, Any]) -> dict[str, str]:
    tier = str(template.get("tier") or "free").strip().lower()
    if tier != "premium":
        return {"tier": tier or "free", "plan_tier": "free-or-better", "status": "active"}
    billing = _billing_row(user) or {}
    plan_tier = str(billing.get("plan_tier") or "free").strip().lower()
    status_value = str(billing.get("status") or "inactive").strip().lower()
    if plan_tier == "free" or status_value not in PAID_STATUSES:
        raise TemplateStorageError("This premium template requires an active paid Nexora plan.")
    return {"tier": tier, "plan_tier": plan_tier, "status": status_value}


def _download_private_package(path: str) -> bytes:
    clean_path = str(path or "").lstrip("/")
    if not clean_path:
        raise TemplateStorageError("The template package path is missing from catalog.json.")
    key = _admin_key()
    request = urllib.request.Request(
        f"{_supabase_url()}/storage/v1/object/{urllib.parse.quote(package_bucket(), safe='')}/{_encode_path(clean_path)}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/zip,application/octet-stream",
            "User-Agent": "Nexora-AI-Vercel-Template-Backend/1.0",
        },
        method="GET",
    )
    return _read_http(request, timeout=25.0, max_bytes=MAX_PACKAGE_BYTES)


def _safe_zip_member(info: zipfile.ZipInfo) -> PurePosixPath | None:
    name = str(info.filename or "").replace("\\", "/")
    if not name or name.endswith("/"):
        return None
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or any(part in {"", "."} for part in path.parts):
        raise TemplateStorageError("Template package contains an unsafe file path.")
    unix_mode = (info.external_attr >> 16) & 0xFFFF
    if unix_mode and stat.S_ISLNK(unix_mode):
        raise TemplateStorageError("Template package contains a symbolic link, which Nexora does not allow.")
    if info.flag_bits & 0x1:
        raise TemplateStorageError("Encrypted template ZIP files are not supported.")
    return path


def _extract_text_files(package_bytes: bytes) -> list[dict[str, str]]:
    files: list[dict[str, str]] = []
    total = 0
    try:
        archive = zipfile.ZipFile(io.BytesIO(package_bytes), "r")
    except zipfile.BadZipFile as exc:
        raise TemplateStorageError("The Supabase template package is not a valid ZIP archive.") from exc

    with archive:
        for info in archive.infolist():
            path = _safe_zip_member(info)
            if path is None:
                continue
            suffix = path.suffix.lower()
            if path.name.lower() == "manifest.json":
                continue
            if suffix not in ALLOWED_TEXT_SUFFIXES:
                continue
            if info.file_size > MAX_TEMPLATE_FILE_BYTES:
                raise TemplateStorageError(f"Template file {path.as_posix()} exceeds the per-file safety limit.")
            raw = archive.read(info)
            total += len(raw)
            if total > MAX_TEMPLATE_TOTAL_TEXT_BYTES:
                raise TemplateStorageError("Template source exceeds the total text-size safety limit.")
            try:
                content = raw.decode("utf-8")
            except UnicodeDecodeError:
                content = raw.decode("utf-8", errors="replace")
            files.append({"name": path.as_posix(), "content": content, "language": suffix.lstrip(".") or "text"})
            if len(files) > MAX_TEMPLATE_FILES:
                raise TemplateStorageError("Template package contains too many source files for one build request.")

    if not any(item["name"].lower().endswith((".html", ".htm")) for item in files):
        raise TemplateStorageError("Template package does not contain an HTML entry file.")
    return files


def resolve_template_seed(
    *,
    template_id: str,
    version: str | None,
    access_token: str,
) -> tuple[dict[str, Any], list[dict[str, str]], NexoraUser]:
    user = authenticate_user(access_token)
    template = _find_template(template_id, version)
    entitlement = _assert_entitled(user, template)
    package_path_value = str(template.get("package_path") or "").lstrip("/")
    package_bytes = _download_private_package(package_path_value)

    expected_sha = str(template.get("package_sha256") or "").strip().lower()
    actual_sha = hashlib.sha256(package_bytes).hexdigest()
    if expected_sha and actual_sha != expected_sha:
        raise TemplateStorageError("Template package checksum does not match catalog.json; upload may be incomplete or corrupted.")

    files = _extract_text_files(package_bytes)
    public_template = {
        "template_id": str(template.get("template_id") or template_id),
        "name": str(template.get("name") or template.get("slug") or "Nexora template"),
        "slug": str(template.get("slug") or ""),
        "tier": str(template.get("tier") or "free").lower(),
        "category": str(template.get("category") or "other"),
        "version": str(template.get("version") or version or "1.0.0"),
        "package_sha256": actual_sha,
        "entitlement": entitlement,
    }
    return public_template, files, user
