@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo        Infinite-Canvas Feature Optimization Tool
echo ======================================================
echo.

set "PY_EXE=python"

if exist "python\python.exe" set "PY_EXE=python\python.exe"
if exist "..\Infinite-Canvas\python\python.exe" set "PY_EXE=..\Infinite-Canvas\python\python.exe"
if exist "..\Infinite-Canvas-main\python\python.exe" set "PY_EXE=..\Infinite-Canvas-main\python\python.exe"
if exist "E:\Infinite-Canvas\python\python.exe" set "PY_EXE=E:\Infinite-Canvas\python\python.exe"
if exist "E:\Infinite-Canvas-main\python\python.exe" set "PY_EXE=E:\Infinite-Canvas-main\python\python.exe"

echo [INFO] Tool dir: %CD%
echo [INFO] Using Python: %PY_EXE%
echo.

"%PY_EXE%" "%~dp0patch_feature_optimization.py"
if errorlevel 1 goto PATCH_FAILED

echo.
echo [SUCCESS] Patch applied successfully!
goto END

:PATCH_FAILED
echo.
echo [ERROR] Patch failed!

:END
echo.
echo ======================================================
pause
