@echo off
rem The trivia morning, by hand (scripts/trivia/morning.js). Normally the scheduled task "VoidTV Trivia Morning" runs it at 4:30 AM,
rem after VoidTV Nightly has rebuilt the catalog. It checks the transcripts and moments, makes the timed questions and the question
rem bank from today's catalog, and opens the gate for the hourly publish only when every question passed. The publish then takes a
rem changed bank to voidtv.net by itself. It waits while the catalog night is still running. Full log: catalog\cache\trivia\night.log
cd /d "%~dp0"
node scripts\trivia\morning.js
echo.
echo The last lines of the trivia log (the "-- gate:" line says whether the publish may take the bank today):
powershell -NoProfile -Command "Get-Content catalog\cache\trivia\night.log -Tail 14"
pause
