# -*- coding: ascii -*-
"""Auto-run all Infinite-Canvas patch_*.py tools."""

import os
import sys
import subprocess
from pathlib import Path

KNOWN_PATCH_PRIORITY = {
    "patch_comfly.py": 10,
    "patch_listenhub.py": 20,
    "patch_feature_optimization.py": 30,
    "patch_jimeng_cli.py": 40,
}


def log(level, message):
    print("[%s] %s" % (level, message), flush=True)


def has_project_files(path):
    root = Path(path)
    return (root / "main.py").is_file() and (root / "static").is_dir()


def resolve_project_root(path, label):
    target = Path(path).resolve()
    if has_project_files(target):
        return target
    raise SystemExit("[ERROR] %s is not an Infinite-Canvas root: %s" % (label, target))


def find_target_root(argv, tool_root):
    if len(argv) > 1 and argv[1].strip():
        return resolve_project_root(argv[1], "Target")

    env_target = os.environ.get("INFINITE_CANVAS_ROOT", "").strip()
    if env_target:
        return resolve_project_root(env_target, "INFINITE_CANVAS_ROOT")

    parent = tool_root.parent.resolve()
    if has_project_files(parent):
        return parent

    cwd = Path.cwd().resolve()
    if has_project_files(cwd):
        return cwd

    default_e = Path("E:/Infinite-Canvas")
    if has_project_files(default_e):
        return default_e.resolve()

    sibling = tool_root.parent / "Infinite-Canvas"
    if has_project_files(sibling):
        return sibling.resolve()

    raise SystemExit("[ERROR] Could not find target root. Pass it as the first argument.")


def find_python(target_root):
    bundled = target_root / "python" / "python.exe"
    if bundled.is_file():
        return str(bundled)
    return sys.executable


def patch_sort_key(tool_root, path):
    priority = KNOWN_PATCH_PRIORITY.get(path.name, 1000)
    rel = str(path.relative_to(tool_root)).replace("\\", "/").lower()
    return (priority, rel)


def find_patches(tool_root):
    current = Path(__file__).resolve()
    patches = []
    for path in tool_root.rglob("patch_*.py"):
        path = path.resolve()
        if path == current:
            continue
        if "__pycache__" in path.parts:
            continue
        patches.append(path)
    patches = sorted(set(patches), key=lambda p: patch_sort_key(tool_root, p))
    if not patches:
        raise SystemExit("[ERROR] No patch_*.py scripts found under: %s" % tool_root)
    return patches


def run_patch(python_exe, patch_path, target_root):
    log("RUN", str(patch_path))
    result = subprocess.run([python_exe, str(patch_path)], cwd=str(target_root))
    if result.returncode != 0:
        raise SystemExit("[ERROR] Patch failed: %s" % patch_path)


def main(argv):
    tool_root = Path(__file__).resolve().parent
    target_root = find_target_root(argv, tool_root)
    python_exe = find_python(target_root)
    patches = find_patches(tool_root)

    log("INFO", "Tool root: %s" % tool_root)
    log("INFO", "Target root: %s" % target_root)
    log("INFO", "Python: %s" % python_exe)
    log("INFO", "Patch count: %d" % len(patches))

    for patch_path in patches:
        run_patch(python_exe, patch_path, target_root)

    log("SUCCESS", "All patches applied.")


if __name__ == "__main__":
    main(sys.argv)