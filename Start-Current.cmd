@echo off
cd /d "%~dp0"
if exist "foundation-0.4.2\Start-Foundation.cmd" (
  call "foundation-0.4.2\Start-Foundation.cmd"
  exit /b %errorlevel%
)
echo Current canonical source is missing: foundation-0.4.2
pause
exit /b 1
