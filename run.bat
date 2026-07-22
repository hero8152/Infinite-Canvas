@echo off
cd /d "%~dp0"

set "PYEXE=%~dp0python\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"

"%PYEXE%" -c "import requests, fastapi, uvicorn, pydantic, httpx, PIL" >nul 2>&1
if errorlevel 1 (
    echo Bundled Python dependencies are incomplete, falling back to system Python...
    set "PYEXE=python"
)

echo Starting ComfyUI-API-Modelscope...
echo Visit: http://127.0.0.1:3000/
echo Press Ctrl+C to stop.
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:3000/"
"%PYEXE%" main.py

echo.
echo Server stopped.
pause
