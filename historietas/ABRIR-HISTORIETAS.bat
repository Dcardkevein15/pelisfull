@echo off
cd /d "%~dp0"
start "" http://localhost:9130/
node server.js
pause
