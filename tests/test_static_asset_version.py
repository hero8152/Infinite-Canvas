import ast
import hashlib
import os
import re
import time
import urllib.parse
from pathlib import Path
from typing import Dict


def load_static_version_namespace():
    root = Path(__file__).resolve().parents[1]
    source = (root / "main.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    selected = []
    wanted_functions = {
        "current_app_version",
        "static_asset_fingerprint_bytes",
        "static_asset_version",
        "versioned_static_html",
    }
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "STATIC_ASSET_VERSION_CACHE"
            for target in node.targets
        ):
            selected.append(node)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "STATIC_ASSET_VERSION_CACHE":
            selected.append(node)
        elif isinstance(node, ast.FunctionDef) and node.name in wanted_functions:
            selected.append(node)
    namespace = {
        "BASE_DIR": str(root),
        "STATIC_DIR": str(root / "static"),
        "Dict": Dict,
        "hashlib": hashlib,
        "os": os,
        "re": re,
        "time": time,
        "urllib": urllib,
    }
    exec(compile(ast.Module(body=selected, type_ignores=[]), "main_static_version_subset", "exec"), namespace)
    return namespace


def test_versioned_static_html_uses_static_content_fingerprint():
    main = load_static_version_namespace()
    html = '<script src="/static/js/i18n.js?v=old"></script>'
    app_version = main["current_app_version"]()

    rendered = main["versioned_static_html"](html)

    assert f"/static/js/i18n.js?v={app_version}." in rendered
    assert f"?v={app_version}\"" not in rendered


def test_static_asset_version_changes_when_i18n_loader_changes(tmp_path, monkeypatch):
    main = load_static_version_namespace()
    static_dir = tmp_path / "static"
    js_dir = static_dir / "js"
    js_dir.mkdir(parents=True)
    (tmp_path / "VERSION").write_text("2026.05.30\n", encoding="utf-8")
    (static_dir / "index.html").write_text("<html></html>", encoding="utf-8")
    i18n = js_dir / "i18n.js"
    i18n.write_text("one", encoding="utf-8")
    main["BASE_DIR"] = str(tmp_path)
    main["STATIC_DIR"] = str(static_dir)
    main["STATIC_ASSET_VERSION_CACHE"].clear()

    first = main["static_asset_version"]()
    i18n.write_text("two", encoding="utf-8")
    second = main["static_asset_version"]()

    assert first.startswith("2026.05.30.")
    assert second.startswith("2026.05.30.")
    assert first != second


def test_static_asset_version_ignores_existing_html_version_values(tmp_path):
    main = load_static_version_namespace()
    static_dir = tmp_path / "static"
    js_dir = static_dir / "js"
    js_dir.mkdir(parents=True)
    (tmp_path / "VERSION").write_text("2026.05.30\n", encoding="utf-8")
    index = static_dir / "index.html"
    index.write_text('<script src="/static/js/i18n.js?v=one"></script>', encoding="utf-8")
    (js_dir / "i18n.js").write_text("loader", encoding="utf-8")
    main["BASE_DIR"] = str(tmp_path)
    main["STATIC_DIR"] = str(static_dir)
    main["STATIC_ASSET_VERSION_CACHE"].clear()

    first = main["static_asset_version"]()
    index.write_text('<script src="/static/js/i18n.js?v=two"></script>', encoding="utf-8")
    second = main["static_asset_version"]()

    assert first == second
