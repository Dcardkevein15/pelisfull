@echo off
cd /d "%~dp0"
start "" http://localhost:9131/
node server.js
pause
