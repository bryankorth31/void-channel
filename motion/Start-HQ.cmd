@echo off
title voidtv.net HQ
cd /d "%~dp0"
start "" http://127.0.0.1:8221
node hq\server.mjs
pause
