@echo off
cd /d "%~dp0"
start "" http://localhost:8780
node scripts\hq.js
