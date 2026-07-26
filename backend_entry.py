"""PyInstaller/Tauri sidecar entry point."""

import os
import sys

ENTRY_DIR = os.path.dirname(os.path.abspath(__file__))
if ENTRY_DIR not in sys.path:
    sys.path.insert(0, ENTRY_DIR)

from canvas_core.runtime import run_uvicorn
from main import app


if __name__ == "__main__":
    run_uvicorn(app)
