@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py start_nexora.py
) else (
  python start_nexora.py
)
if errorlevel 1 (
  echo.
  echo Nexora could not start. Review the error above.
  pause
)
endlocal
