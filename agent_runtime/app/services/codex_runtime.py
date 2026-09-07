from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Iterator

from app.services.codex_vault import CodexVaultError, codex_env, isolated_codex_home, save_codex_home


def model_dump(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump(mode="json", by_alias=True, exclude_none=True)
        except TypeError:
            return value.model_dump()
    if isinstance(value, dict):
        return {str(k): model_dump(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [model_dump(item) for item in value]
    if hasattr(value, "__dict__"):
        return {str(k): model_dump(v) for k, v in vars(value).items() if not str(k).startswith("_")}
    return value


def _find_first(data: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(data, dict):
        for key in keys:
            if key in data and data[key] not in (None, "", [], {}):
                return data[key]
        for value in data.values():
            found = _find_first(value, keys)
            if found not in (None, "", [], {}):
                return found
    elif isinstance(data, list):
        for item in data:
            found = _find_first(item, keys)
            if found not in (None, "", [], {}):
                return found
    return None


def account_summary(account_response: Any) -> dict[str, Any]:
    raw = model_dump(account_response) or {}
    account = raw.get("account") if isinstance(raw, dict) else None
    if isinstance(account, dict):
        scope = account
    else:
        scope = raw
    email = _find_first(scope, ("email", "emailAddress", "email_address"))
    plan = _find_first(raw, ("planType", "plan_type", "plan"))
    auth_mode = _find_first(raw, ("authMode", "auth_mode", "type"))
    return {
        "email": str(email) if email else None,
        "plan_type": str(plan) if plan else None,
        "auth_mode": str(auth_mode) if auth_mode else "chatgpt",
        "raw": raw,
    }


def _model_candidate(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    model_id = item.get("id") or item.get("model") or item.get("slug") or item.get("modelId") or item.get("model_id")
    if not model_id:
        return None
    model_id = str(model_id)
    name = item.get("displayName") or item.get("display_name") or item.get("name") or model_id
    default = bool(item.get("isDefault") or item.get("is_default") or item.get("default"))
    efforts = item.get("supportedReasoningEfforts") or item.get("supported_reasoning_efforts") or item.get("reasoningEfforts") or []
    normalized_efforts: list[str] = []
    if isinstance(efforts, list):
        for effort in efforts:
            if isinstance(effort, str):
                normalized_efforts.append(effort)
            elif isinstance(effort, dict):
                value = effort.get("reasoningEffort") or effort.get("reasoning_effort") or effort.get("effort")
                if value:
                    normalized_efforts.append(str(value))
    return {
        "id": model_id,
        "name": str(name),
        "isDefault": default,
        "defaultReasoningEffort": item.get("defaultReasoningEffort") or item.get("default_reasoning_effort"),
        "supportedReasoningEfforts": normalized_efforts,
    }


def models_summary(models_response: Any) -> list[dict[str, Any]]:
    raw = model_dump(models_response)
    candidates: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    candidate = _model_candidate(item)
                    if candidate:
                        candidates.append(candidate)
                    else:
                        walk(item)
                elif isinstance(item, list):
                    walk(item)
        elif isinstance(value, dict):
            for key, item in value.items():
                if key.lower() in {"models", "data", "items"} and isinstance(item, list):
                    walk(item)

    walk(raw)
    dedup: dict[str, dict[str, Any]] = {}
    for model in candidates:
        dedup.setdefault(model["id"], model)
    result = list(dedup.values())
    result.sort(key=lambda item: (not bool(item.get("isDefault")), item["id"].lower()))
    return result


@contextmanager
def authenticated_codex_client(user_id: str, access_token: str) -> Iterator[tuple[Any, Path, dict[str, Any] | None, Path]]:
    """Restore one user's ChatGPT credential into an isolated Codex home.

    The model working directory is deliberately different from CODEX_HOME, so
    even a tool-capable Codex turn is not started in the directory containing
    ``auth.json``. The website controller still supplies all source context in
    prompts and remains the only component allowed to mutate its workspace.
    """
    with isolated_codex_home(user_id, access_token, restore=True) as (home, row):
        if not (home / "auth.json").exists():
            raise CodexVaultError("ChatGPT Codex is not connected for this Nexora account. Click Connect ChatGPT first.")
        try:
            from openai_codex import Codex, CodexConfig
        except ImportError as exc:
            raise CodexVaultError("The OpenAI Codex SDK is not installed in this deployment. Redeploy with requirements.txt.") from exc
        with TemporaryDirectory(prefix="nexora-codex-work-") as work_raw:
            work = Path(work_raw).resolve()
            config = CodexConfig(
                env=codex_env(home),
                cwd=str(work),
                config_overrides=('cli_auth_credentials_store="file"', 'forced_login_method="chatgpt"'),
                client_name="nexora_vercel",
                client_title="Nexora AI",
            )
            with Codex(config) as client:
                yield client, home, row, work


def refresh_and_persist(user_id: str, access_token: str, client: Any, home: str | Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    account = account_summary(client.account(refresh_token=True))
    models = models_summary(client.models(include_hidden=False))
    save_codex_home(
        user_id,
        access_token,
        home,
        account_email=account.get("email"),
        plan_type=account.get("plan_type"),
        models=models,
    )
    return account, models
