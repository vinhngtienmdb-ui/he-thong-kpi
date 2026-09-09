@echo off
chcp 65001 > nul
echo =========================================================================
echo    HỆ THỐNG QUẢN LÝ CÔNG VIỆC & CHẤM ĐIỂM KPI (DANH MỤC CBQL)
echo =========================================================================
echo Đang khởi động Backend Server (Port 5000)...
start "KPI Backend API" cmd /k "cd /d %~dp0\backend && node server.js"

echo Đang khởi động Frontend Web Interface (Port 3000)...
start "KPI Frontend" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo Hệ thống đang mở trên trình duyệt: http://localhost:3000
echo.
timeout /t 3 > nul
start http://localhost:3000
