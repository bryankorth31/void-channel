@echo off
rem Opens the VOID Player Lab: a local server for this folder on port 8790, then the lab in your browser.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" "http://127.0.0.1:8790/lab/"
python -m http.server 8790 --bind 127.0.0.1
