@echo off
setlocal

set "SCRIPT=%~dp0run_all_patches.py"
set "PY="

if not "%~1"=="" if exist "%~1\python\python.exe" set "PY=%~1\python\python.exe"
if not defined PY if exist "%~dp0..\python\python.exe" set "PY=%~dp0..\python\python.exe"
if not defined PY if exist "E:\Infinite-Canvas\python\python.exe" set "PY=E:\Infinite-Canvas\python\python.exe"
if not defined PY set "PY=python"

echo ======================================================
echo        Infinite-Canvas All Patches Tool
echo ======================================================
echo.
"%PY%" "%SCRIPT%" %*
if errorlevel 1 (
    echo.
    echo [ERROR] Some patch failed.
    echo.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] All patches finished.
echo.
pause