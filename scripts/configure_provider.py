#!/usr/bin/env python3
"""Configure Infinite Canvas API providers safely from an agent or terminal."""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


PROVIDER_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{2,40}$")
VALID_PROTOCOLS = {"openai", "apimart"}
VIDEO_KEYS = [
    "veo",
    "sora",
    "wan2",
    "wanx",
    "doubao-seedance",
    "doubao-1",
    "kling",
    "hailuo",
    "video",
    "t2v-",
    "i2v-",
    "s2v",
]
IMAGE_KEYS = [
    "image",
    "dalle",
    "dall-e",
    "imagen",
    "flux",
    "stable",
    "sdxl",
    "midjourney",
    "nano-banana",
    "ideogram",
    "fal-ai",
    "z-image",
    "qwen-image",
    "klein",
    "gpt-image",
]


class ConfigError(ValueError):
    pass


def unique(values: list[str] | tuple[str, ...] | None) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in values or []:
        item = str(raw or "").strip()
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def normalize_id(value: str, fallback: str = "custom-api") -> str:
    normalized = (
        str(value or "")
        .strip()
        .lower()
        .replace(" ", "-")
    )
    normalized = re.sub(r"[^a-z0-9_-]", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-_")
    if not normalized:
        normalized = fallback
    return normalized[:40]


def provider_key_env(provider_id: str) -> str:
    if provider_id == "comfly":
        return "COMFLY_API_KEY"
    if provider_id == "modelscope":
        return "MODELSCOPE_API_KEY"
    return f"API_PROVIDER_{re.sub(r'[^A-Za-z0-9]', '_', provider_id).upper()}_KEY"


def mask_secret(value: str | None) -> str:
    if not value:
        return ""
    tail = value[-4:] if len(value) > 4 else value
    return f"********{tail}"


def env_quote(value: str) -> str:
    text = str(value or "")
    if not text or re.search(r"\s|#|['\"]", text):
        return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return text


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(path.parent), delete=False) as tmp:
        tmp.write(text)
        tmp_name = tmp.name
    os.replace(tmp_name, path)


def load_providers(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(raw, list):
        raise ConfigError(f"{path} must contain a JSON array")
    return [item for item in raw if isinstance(item, dict)]


def write_providers(path: Path, providers: list[dict[str, Any]]) -> None:
    atomic_write_text(path, json.dumps(providers, ensure_ascii=False, indent=2) + "\n")


def update_env_values(path: Path, updates: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8-sig").splitlines() if path.exists() else []
    seen: set[str] = set()
    next_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in updates:
            next_lines.append(f"{key}={env_quote(updates[key])}")
            seen.add(key)
        else:
            next_lines.append(line)
    for key, value in updates.items():
        if key not in seen:
            next_lines.append(f"{key}={env_quote(value)}")
    atomic_write_text(path, "\n".join(next_lines).rstrip() + "\n")


def classify_model(model_id: str) -> str:
    lower = model_id.lower()
    if any(key in lower for key in VIDEO_KEYS):
        return "video"
    if any(key in lower for key in IMAGE_KEYS):
        return "image"
    return "chat"


def fetch_models(base_url: str, api_key: str, timeout: float) -> dict[str, list[str]]:
    root = base_url.rstrip("/")
    url = f"{root}/models" if root.endswith("/v1") else f"{root}/v1/models"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:300]
        raise ConfigError(f"Upstream /v1/models failed with HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise ConfigError(f"Failed to reach upstream /v1/models: {exc}") from exc

    payload = json.loads(raw or "{}")
    items = payload.get("data") if isinstance(payload, dict) else []
    if not items and isinstance(payload, dict):
        items = payload.get("models") or payload.get("list") or []
    ids: list[str] = []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, str):
            ids.append(item)
        elif isinstance(item, dict):
            model_id = item.get("id") or item.get("name") or item.get("model")
            if model_id:
                ids.append(str(model_id))

    grouped = {"image": [], "chat": [], "video": []}
    for model_id in sorted(set(ids)):
        grouped[classify_model(model_id)].append(model_id)
    return grouped


def is_local_http_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def merge_models(existing: list[str], incoming: list[str], replace: bool) -> list[str]:
    if replace:
        return unique(incoming)
    return unique([*existing, *incoming])


def resolve_secret(args: argparse.Namespace) -> tuple[str | None, str]:
    modes = [bool(args.api_key), bool(args.api_key_env), bool(args.api_key_stdin), bool(args.clear_key)]
    if sum(modes) > 1:
        raise ConfigError("Use only one of --api-key, --api-key-env, --api-key-stdin, or --clear-key")
    if args.clear_key:
        return "", "cleared"
    if args.api_key:
        return args.api_key.strip(), "argument"
    if args.api_key_env:
        value = os.getenv(args.api_key_env, "").strip()
        if not value:
            raise ConfigError(f"Environment variable {args.api_key_env} is empty or missing")
        return value, f"env:{args.api_key_env}"
    if args.api_key_stdin:
        value = sys.stdin.read().strip()
        if not value:
            raise ConfigError("No API key received from stdin")
        return value, "stdin"
    return None, "unchanged"


def public_provider(provider: dict[str, Any], api_key: str | None, existing_env: dict[str, str]) -> dict[str, Any]:
    key_env = provider_key_env(str(provider["id"]))
    current_key = api_key if api_key is not None else existing_env.get(key_env, "")
    return {
        **provider,
        "has_key": bool(current_key),
        "key_env": key_env,
        "key_preview": mask_secret(current_key),
    }


def configure_provider(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.project_root).expanduser().resolve()
    providers_path = root / "data" / "api_providers.json"
    env_path = root / "API" / ".env"
    provider_id = normalize_id(args.id or args.name)
    if not PROVIDER_ID_RE.fullmatch(provider_id):
        raise ConfigError(f"Provider id must match {PROVIDER_ID_RE.pattern}: {provider_id}")
    protocol = str(args.protocol or "openai").lower()
    if protocol not in VALID_PROTOCOLS:
        raise ConfigError(f"Protocol must be one of: {', '.join(sorted(VALID_PROTOCOLS))}")
    base_url = str(args.base_url or "").strip().rstrip("/")
    if not re.match(r"^https?://", base_url):
        raise ConfigError("Base URL must start with http:// or https://")
    if base_url.startswith("http://") and not is_local_http_url(base_url):
        raise ConfigError("Use HTTPS for remote API providers. Plain HTTP is only allowed for localhost or 127.0.0.1.")

    secret, secret_source = resolve_secret(args)
    existing_env = read_env_file(env_path)
    fetch_key = secret if secret is not None else existing_env.get(provider_key_env(provider_id), "")
    fetched_models = {"image": [], "chat": [], "video": []}
    if args.fetch_models:
        if not fetch_key:
            raise ConfigError("--fetch-models requires --api-key, --api-key-env, --api-key-stdin, or an existing saved key")
        fetched_models = fetch_models(base_url, fetch_key, args.timeout)

    providers = load_providers(providers_path)
    existing = next((item for item in providers if item.get("id") == provider_id), None)
    provider = dict(existing or {})
    provider.update(
        {
            "id": provider_id,
            "name": str(args.name or provider.get("name") or provider_id).strip()[:60] or provider_id,
            "base_url": base_url,
            "protocol": protocol,
            "enabled": not args.disabled,
            "primary": bool(provider.get("primary", False)),
        }
    )
    provider["image_models"] = merge_models(
        provider.get("image_models") or [],
        [*args.image_model, *fetched_models["image"]],
        args.replace_models,
    )
    provider["chat_models"] = merge_models(
        provider.get("chat_models") or [],
        [*args.chat_model, *fetched_models["chat"]],
        args.replace_models,
    )
    provider["video_models"] = merge_models(
        provider.get("video_models") or [],
        [*args.video_model, *fetched_models["video"]],
        args.replace_models,
    )
    provider["ms_loras"] = provider.get("ms_loras") or []
    provider["ms_defaults_version"] = int(provider.get("ms_defaults_version") or 0)

    next_providers: list[dict[str, Any]] = []
    inserted = False
    for item in providers:
        if item.get("id") == provider_id:
            next_providers.append(provider)
            inserted = True
        else:
            next_providers.append(item)
    if not inserted:
        next_providers.append(provider)
    if args.set_primary:
        for item in next_providers:
            item["primary"] = item.get("id") == provider_id
        provider["primary"] = True

    key_env = provider_key_env(provider_id)
    env_updates = {key_env: secret} if secret is not None else {}
    if not args.dry_run:
        write_providers(providers_path, next_providers)
        if env_updates:
            update_env_values(env_path, env_updates)

    public = public_provider(provider, secret, existing_env)
    return {
        "status": "dry_run" if args.dry_run else "saved",
        "project_root": str(root),
        "providers_file": str(providers_path),
        "env_file": str(env_path),
        "provider": public,
        "secret_source": secret_source,
        "model_counts": {
            "image": len(public.get("image_models") or []),
            "chat": len(public.get("chat_models") or []),
            "video": len(public.get("video_models") or []),
        },
    }


def list_providers(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.project_root).expanduser().resolve()
    providers_path = root / "data" / "api_providers.json"
    env_path = root / "API" / ".env"
    env_values = read_env_file(env_path)
    providers = [public_provider(item, None, env_values) for item in load_providers(providers_path)]
    return {
        "status": "listed",
        "project_root": str(root),
        "providers_file": str(providers_path),
        "env_file": str(env_path),
        "providers": providers,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Safely configure Infinite Canvas API providers.")
    parser.add_argument("--project-root", default=Path(__file__).resolve().parents[1], help="Infinite Canvas project root")
    parser.add_argument("--list", action="store_true", help="List saved providers with masked key previews")
    parser.add_argument("--id", default="", help="Stable provider id; defaults to a slug from --name")
    parser.add_argument("--name", default="", help="Display name shown in API Settings")
    parser.add_argument("--base-url", default="", help="Provider API root, with or without /v1")
    parser.add_argument("--protocol", choices=sorted(VALID_PROTOCOLS), default="openai", help="Provider protocol")
    parser.add_argument("--api-key", default="", help="API key value. Prefer --api-key-env or --api-key-stdin for shared machines.")
    parser.add_argument("--api-key-env", default="", help="Read API key from this environment variable")
    parser.add_argument("--api-key-stdin", action="store_true", help="Read API key from stdin")
    parser.add_argument("--clear-key", action="store_true", help="Clear the saved key for this provider")
    parser.add_argument("--image-model", action="append", default=[], help="Add an image model id; repeatable")
    parser.add_argument("--chat-model", action="append", default=[], help="Add a chat model id; repeatable")
    parser.add_argument("--video-model", action="append", default=[], help="Add a video model id; repeatable")
    parser.add_argument("--replace-models", action="store_true", help="Replace existing model lists instead of merging")
    parser.add_argument("--fetch-models", action="store_true", help="Pull /v1/models and merge detected image/chat/video models")
    parser.add_argument("--set-primary", action="store_true", help="Make this provider the preferred fallback")
    parser.add_argument("--disabled", action="store_true", help="Save provider as disabled")
    parser.add_argument("--timeout", type=float, default=30.0, help="Network timeout for --fetch-models")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print result without writing files")
    parser.add_argument("--print-json", action="store_true", help="Print machine-readable JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.list:
            result = list_providers(args)
        else:
            missing = [flag for flag, value in [("--name", args.name), ("--base-url", args.base_url)] if not value]
            if missing:
                raise ConfigError(f"Missing required arguments: {', '.join(missing)}")
            result = configure_provider(args)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.print_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        provider = result.get("provider") or {}
        if result["status"] == "listed":
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(f"status: {result['status']}")
            print(f"provider: {provider.get('name')} ({provider.get('id')})")
            print(f"base_url: {provider.get('base_url')}")
            print(f"protocol: {provider.get('protocol')}")
            print(f"key_env: {provider.get('key_env')}")
            print(f"key_preview: {provider.get('key_preview') or 'not configured'}")
            print(f"models: image={result['model_counts']['image']} chat={result['model_counts']['chat']} video={result['model_counts']['video']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
