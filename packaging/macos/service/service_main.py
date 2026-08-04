from __future__ import annotations

import runpy
import sys
from pathlib import Path

# Imported so PyInstaller includes runtime dependencies used by payload/main.py.
import fastapi  # noqa: F401
import httpx  # noqa: F401
import PIL  # noqa: F401
import PIL.Image  # noqa: F401
import pydantic  # noqa: F401
import requests  # noqa: F401
import uvicorn  # noqa: F401


def main() -> int:
    work_dir = Path.cwd()
    sys.path.insert(0, str(work_dir))
    runpy.run_path(str(work_dir / "main.py"), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
