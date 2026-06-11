@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-museai.ps1"
if errorlevel 1 exit /b %errorlevel%
