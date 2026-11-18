@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Запускаю адмінку портфоліо...
node admin\server.mjs --open
pause
