#!/usr/bin/env python3
import os
import pwd
import shutil
import sys


APP_DIR = "/app"
DREAMINA_CLI_DIR = "/home/appuser/.dreamina_cli"
DREAMINA_CLI_TEMPLATE_DIR = "/opt/dreamina-cli-template"
DREAMINA_MANAGED_FILES = [
    "version.json",
    os.path.join("dreamina", "SKILL.md"),
]
RUNTIME_DIRS = [
    "/app/API",
    "/app/data",
    "/app/assets",
    "/app/assets/input",
    "/app/assets/output",
    "/app/assets/library",
    "/app/output",
    "/app/workflows/custom",
    DREAMINA_CLI_DIR,
]


def app_identity():
    user = pwd.getpwnam("appuser")
    uid = int(os.environ.get("APP_UID") or user.pw_uid)
    gid = int(os.environ.get("APP_GID") or user.pw_gid)
    return uid, gid


def ensure_runtime_files():
    for path in RUNTIME_DIRS:
        os.makedirs(path, exist_ok=True)

    defaults = {
        "/app/data/history.json": "[]\n",
        "/app/data/global_config.json": "{}\n",
    }
    for path, content in defaults.items():
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(content)

    links = {
        "/app/history.json": "/app/data/history.json",
        "/app/global_config.json": "/app/data/global_config.json",
    }
    for link, target in links.items():
        if os.path.islink(link) and os.readlink(link) == target:
            continue
        if os.path.exists(link) or os.path.islink(link):
            os.remove(link)
        os.symlink(target, link)


def should_replace_file(source, target):
    if not os.path.exists(target):
        return True
    with open(source, "rb") as source_handle, open(target, "rb") as target_handle:
        return source_handle.read() != target_handle.read()


def ensure_dreamina_cli_state():
    if not os.path.isdir(DREAMINA_CLI_TEMPLATE_DIR):
        return

    os.makedirs(DREAMINA_CLI_DIR, exist_ok=True)
    for relative_path in DREAMINA_MANAGED_FILES:
        source = os.path.join(DREAMINA_CLI_TEMPLATE_DIR, relative_path)
        target = os.path.join(DREAMINA_CLI_DIR, relative_path)
        if not os.path.exists(source):
            continue
        if not should_replace_file(source, target):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(source, target)


def chown_if_needed(path, uid, gid):
    try:
        stat = os.stat(path, follow_symlinks=False)
        if stat.st_uid != uid or stat.st_gid != gid:
            os.chown(path, uid, gid, follow_symlinks=False)
    except PermissionError as exc:
        print(f"Warning: cannot chown {path}: {exc}", file=sys.stderr)


def chown_runtime(uid, gid):
    for root_path in RUNTIME_DIRS + ["/app/history.json", "/app/global_config.json"]:
        if not os.path.exists(root_path) and not os.path.islink(root_path):
            continue
        chown_if_needed(root_path, uid, gid)
        if os.path.isdir(root_path) and not os.path.islink(root_path):
            for dirpath, dirnames, filenames in os.walk(root_path):
                chown_if_needed(dirpath, uid, gid)
                for name in dirnames + filenames:
                    chown_if_needed(os.path.join(dirpath, name), uid, gid)


def drop_privileges(uid, gid):
    if os.getuid() != 0:
        return
    os.setgroups([])
    os.setgid(gid)
    os.setuid(uid)
    os.environ["HOME"] = "/home/appuser"


def main():
    uid, gid = app_identity()
    ensure_runtime_files()
    ensure_dreamina_cli_state()
    chown_runtime(uid, gid)
    drop_privileges(uid, gid)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
