@echo off
cd /d "%~dp0"
echo Starting Next.js...
start "Next.js" cmd /k "C:\nvm4w\nodejs\node.exe C:\nvm4w\nodejs\node_modules\next\dist\bin\next dev"