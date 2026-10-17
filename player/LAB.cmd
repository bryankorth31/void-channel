@echo off
rem Opens the VOID Player Lab: a local server for this folder on port 8792, then the lab in your browser.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" "http://127.0.0.1:8792/lab/"
python -m http.server 8792 --bind 127.0.0.1
