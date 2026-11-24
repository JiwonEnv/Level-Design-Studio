@echo off
cd /d "%~dp0"
if exist "release-0.4.2\library-home-current\win-unpacked\Level Design Studio Foundation 0.4.2.exe" (
  start "" "release-0.4.2\library-home-current\win-unpacked\Level Design Studio Foundation 0.4.2.exe"
  exit /b 0
)
echo Level Design Studio build is missing. Run "npm run package:dir" in foundation-0.4.2.
pause
exit /b 1
