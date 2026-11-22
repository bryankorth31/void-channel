@echo off
rem The PLAY controller layout editor (play/tools/layout.html): move and resize each part of the pads, then Save.
rem It starts the local PLAY server on this PC and opens the editor. Close this window to stop it.
cd /d "%~dp0"
start "" http://127.0.0.1:8789/play/tools/layout.html
node play\serve.js
