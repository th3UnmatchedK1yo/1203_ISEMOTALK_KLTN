@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ISEmoTalk] Chua tim thay Node.js 22 trong PATH. Can cai Node hoac mo tu moi truong da cai.
  pause
  exit /b 1
)
node "%~dp0scripts\open-isemotalk.mjs"
if errorlevel 1 (
  echo.
  echo [ISEmoTalk] Khong the mo web. Xem thong bao tren hoac thu muc .isemotalk-launcher.
  pause
)
