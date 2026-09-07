from __future__ import annotations

import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

try:
    from cryptography.fernet import Fernet, InvalidToken
except Exception:  # pragma: no cover
    Fernet = None  # type: ignore[assignment]
    InvalidToken = Exception  # type: ignore[assignment]


class CodexVaultError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class NexoraUser:
    id: str
    email: str | None = None
    access_token: str = ""


def _required_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise CodexVaultError(f"{name} is not configured in the deployment environment.")
    return value


def _public_api_key() -> str:
    value = (os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
    if not value:
        raise CodexVaultError("SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is not configured on Vercel.")
    return value


def codex_vault_configured() -> bool:
    return bool(
        (os.getenv("SUPABASE_URL") or "").strip()
        and (os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
        and (os.getenv("NEXORA_CODEX_VAULT_KEY") or "").strip()
    )


def _fernet():
    if Fernet is None:
        raise CodexVaultError("The cryptography package is unavailable. Redeploy after installing requirements.txt.")
    raw = _required_env("NEXORA_CODEX_VAULT_KEY").encode("utf-8")
    try:
        return Fernet(raw)
    except Exception as exc:
        raise CodexVaultError(
            "NEXORA_CODEX_VAULT_KEY is invalid. Generate a Fernet key exactly as documented."
        ) from exc


def _supabase_url(path: str) -> str:
    return _required_env("SUPABASE_URL").rstrip("/") + path


def _request_json(
    method: str,
    path: str,
    *,
    access_token: str,
    body: Any | None = None,
    extra_headers: dict[str, str] | None = None,
    timeout: float = 18.0,
) -> Any:
    token = (access_token or "").strip()
    if not token:
        raise CodexVaultError("Your Nexora session is missing. Sign in again before using ChatGPT Codex.")
    anon_key = _public_api_key()
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "Nexora-AI-Codex-Vault/2.0",
    }
    if extra_headers:
        headers.update(extra_headers)

    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(
        _supabase_url(path),
        data=data,
        headers=headers,
        method=method.upper(),
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except Exception:
            detail = raw
        detail_text = str(detail)
        if exc.code in {400, 404} and ("codex_auth_vault" in detail_text or "PGRST205" in detail_text):
            raise CodexVaultError(
                "The Codex vault table is not installed. Run config/nexora_production_migration.sql in the Supabase SQL Editor, then retry."
            ) from exc
        if exc.code in {401, 403}:
            if exc.code == 403 and "codex_auth_vault" in detail_text:
                raise CodexVaultError(
                    "The Codex vault RLS migration is not installed correctly. Re-run config/nexora_production_migration.sql in Supabase."
                ) from exc
            raise CodexVaultError("Your Nexora session expired or is not authorized. Sign in again, then reconnect Codex.") from exc
        raise CodexVaultError(f"Supabase returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise CodexVaultError(f"Could not reach Supabase: {exc.reason}") from exc


def authenticate_user(access_token: str | None) -> NexoraUser:
    token = (access_token or "").strip()
    if not token:
        raise CodexVaultError("Sign in to Nexora before connecting a ChatGPT Codex account.")
    payload = _request_json("GET", "/auth/v1/user", access_token=token)
    user_id = str((payload or {}).get("id") or "").strip()
    if not user_id:
        raise CodexVaultError("Could not verify the signed-in Nexora account.")
    email = (payload or {}).get("email")
    return NexoraUser(id=user_id, email=str(email) if email else None, access_token=token)


def _vault_query(user_id: str) -> str:
    safe_id = urllib.parse.quote(user_id, safe="")
    return (
        "/rest/v1/codex_auth_vault?"
        f"user_id=eq.{safe_id}&select=user_id,ciphertext,account_email,plan_type,model_snapshot,verified_at,updated_at&limit=1"
    )


def read_vault_row(user_id: str, access_token: str) -> dict[str, Any] | None:
    rows = _request_json("GET", _vault_query(user_id), access_token=access_token)
    if not isinstance(rows, list) or not rows:
        return None
    return rows[0] if isinstance(rows[0], dict) else None


def delete_vault_row(user_id: str, access_token: str) -> None:
    safe_id = urllib.parse.quote(user_id, safe="")
    _request_json(
        "DELETE",
        f"/rest/v1/codex_auth_vault?user_id=eq.{safe_id}",
        access_token=access_token,
        extra_headers={"Prefer": "return=minimal"},
    )


def _encrypt_auth_json(raw_auth: str) -> str:
    return _fernet().encrypt(raw_auth.encode("utf-8")).decode("ascii")


def _decrypt_auth_json(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise CodexVaultError(
            "Stored Codex credentials cannot be decrypted. The vault key may have changed; reconnect ChatGPT Codex."
        ) from exc


def save_codex_home(
    user_id: str,
    access_token: str,
    codex_home: str | Path,
    *,
    account_email: str | None = None,
    plan_type: str | None = None,
    models: list[dict[str, Any]] | None = None,
) -> None:
    home = Path(codex_home)
    auth_path = home / "auth.json"
    if not auth_path.exists():
        raise CodexVaultError("Codex login finished without creating a file-backed auth cache.")
    raw_auth = auth_path.read_text(encoding="utf-8")
    try:
        parsed = json.loads(raw_auth)
    except json.JSONDecodeError as exc:
        raise CodexVaultError("Codex produced an invalid auth cache; please reconnect.") from exc
    if not isinstance(parsed, dict):
        raise CodexVaultError("Codex produced an invalid auth cache object.")

    now = datetime.now(timezone.utc).isoformat()
    body = {
        "user_id": user_id,
        "ciphertext": _encrypt_auth_json(raw_auth),
        "account_email": account_email,
        "plan_type": plan_type,
        "model_snapshot": models or [],
        "verified_at": now,
        "updated_at": now,
    }
    _request_json(
        "POST",
        "/rest/v1/codex_auth_vault?on_conflict=user_id",
        access_token=access_token,
        body=body,
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def _write_isolated_config(home: Path) -> None:
    config_path = home / "config.toml"
    config_path.write_text(
        'cli_auth_credentials_store = "file"\n'
        'forced_login_method = "chatgpt"\n'
        'web_search = "disabled"\n',
        encoding="utf-8",
    )
    try:
        config_path.chmod(0o600)
    except OSError:
        pass


def _restore_auth(home: Path, row: dict[str, Any] | None) -> bool:
    if not row or not row.get("ciphertext"):
        return False
    raw = _decrypt_auth_json(str(row["ciphertext"]))
    auth_path = home / "auth.json"
    auth_path.write_text(raw, encoding="utf-8")
    try:
        auth_path.chmod(0o600)
    except OSError:
        pass
    return True


@contextmanager
def isolated_codex_home(
    user_id: str,
    access_token: str,
    *,
    restore: bool = True,
) -> Iterator[tuple[Path, dict[str, Any] | None]]:
    with tempfile.TemporaryDirectory(prefix=f"nexora-codex-{user_id[:8]}-") as temp_dir:
        home = Path(temp_dir).resolve()
        _write_isolated_config(home)
        row = read_vault_row(user_id, access_token) if restore else None
        if restore:
            _restore_auth(home, row)
        yield home, row


def codex_env(home: str | Path) -> dict[str, str]:
    env = dict(os.environ)
    for key in (
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "OPENAI_BASE_URL",
        "OPENAI_ORG_ID",
        "OPENAI_PROJECT_ID",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
        "SUPABASE_ANON_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "NEXORA_CODEX_VAULT_KEY",
        "SUPABASE_DB_PASSWORD",
    ):
        env.pop(key, None)
    env["CODEX_HOME"] = str(Path(home).resolve())
    env["NO_COLOR"] = "1"
    return env


def public_status(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return {
            "connected": False,
            "account_email": None,
            "plan_type": None,
            "models": [],
            "verified_at": None,
        }
    models = row.get("model_snapshot")
    return {
        "connected": bool(row.get("ciphertext")),
        "account_email": row.get("account_email"),
        "plan_type": row.get("plan_type"),
        "models": models if isinstance(models, list) else [],
        "verified_at": row.get("verified_at"),
    }
