@echo off
rem Opens the VOIDtv Beta admin page already unlocked. The key stays on this PC (backend\.env) and in the
rem page's address fragment, which browsers never send to a server.
for /f "tokens=1,* delims==" %%a in ('findstr /b "BETA_ADMIN_KEY=" "%~dp0backend\.env"') do set "K=%%b"
if not defined K ( echo BETA_ADMIN_KEY missing in backend\.env & pause & exit /b 1 )
start "" "https://voidtv-beta.pages.dev/admin#k=%K%"
