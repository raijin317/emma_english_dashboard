@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Emma English Studio
cd /d "%~dp0"

rem ===== Settings =====
set "PORT=3210"
set "URL=http://127.0.0.1:%PORT%"
set "NEXT_TELEMETRY_DISABLED=1"

echo.
echo   ==================================================
echo        🍀  Emma English Studio
echo   ==================================================
echo.

rem ----- 1. Node.js installed? -----
where node >nul 2>nul
if errorlevel 1 goto :no_node

rem ----- 2. Already running? Just open the browser -----
curl -s -f -o nul -m 3 "%URL%/api/settings" >nul 2>nul
if not errorlevel 1 (
  echo   App đang chạy rồi. Đang mở trình duyệt...
  if not defined SUNNY_NO_BROWSER start "" "%URL%"
  timeout /t 3 >nul
  exit /b 0
)

rem ----- 3. First run: install libraries -----
if not exist "node_modules\next\package.json" (
  echo   [1/3] Lần đầu: đang cài đặt thư viện ^(vài phút, cần Internet^)...
  call npm install --no-fund --no-audit
  if errorlevel 1 goto :fail
)

rem ----- 4. Build when missing, when the code changed, or when the folder was moved/renamed -----
set "NEEDBUILD=0"
if not exist ".next\BUILD_ID" set "NEEDBUILD=1"
if "%NEEDBUILD%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Get-Content '.next\required-server-files.json' -Raw | ConvertFrom-Json; if ($r.appDir -ne (Get-Location).Path) { exit 1 } } catch { exit 1 }; $b=(Get-Item '.next\BUILD_ID').LastWriteTime; $n=(Get-ChildItem 'src','package.json','next.config.ts' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime; if ($n -gt $b) { exit 1 } else { exit 0 }"
  if errorlevel 1 set "NEEDBUILD=1"
)
if "%NEEDBUILD%"=="1" (
  echo   [2/3] Đang chuẩn bị ứng dụng ^(khoảng 1 phút^)...
  call npm run build
  if errorlevel 1 goto :fail
)

rem ----- 5. Open the browser as soon as the server answers -----
if not defined SUNNY_NO_BROWSER (
  start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/settings' | Out-Null; Start-Process '%URL%'; break } catch { Start-Sleep -Seconds 1 } }"
)

echo   [3/3] Đang khởi động...
echo.
echo   --------------------------------------------------
echo    ✅ Trình duyệt sẽ tự mở trang:  %URL%
echo.
echo    ⚠  KHÔNG tắt cửa sổ đen này khi đang học.
echo       Muốn tắt ứng dụng: đóng cửa sổ này.
echo   --------------------------------------------------
echo.
call npm run start -- -p %PORT%

echo.
echo   Ứng dụng đã dừng.
pause
exit /b 0

:no_node
echo   [!] Máy chưa cài Node.js.
echo       Trang tải Node.js sẽ mở ra: chọn bản "LTS", cài đặt xong
echo       rồi nhấp đúp lại file này.
start "" "https://nodejs.org/"
pause
exit /b 1

:fail
echo.
echo   [!] Có lỗi xảy ra. Hãy chụp màn hình cửa sổ này
echo       và gửi cho người hỗ trợ.
pause
exit /b 1
