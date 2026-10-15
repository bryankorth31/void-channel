@echo off
rem VOID kit: make this PC a catalog builder for a profile. Usage: setup.cmd [profile]
cd /d "%~dp0"
if not "%~1"=="" set VOID_PROFILE=%~1
node scripts\setup.js
pause
