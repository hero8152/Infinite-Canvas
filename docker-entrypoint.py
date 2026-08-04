#!/usr/bin/env python3
import os
import pwd
import sys


APP_DIR = "/app"
RUNTIME_DIRS = [
    "/app/API",
    "/app/data",
    "/app/assets",
    "/app/assets/input",
    "/app/assets/output",
    "/app/assets/library",
    "/app/output",
    "/app/workflows/custom",
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
    chown_runtime(uid, gid)
    drop_privileges(uid, gid)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
