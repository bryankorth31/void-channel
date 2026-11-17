' Runs a VoidTV node script with no window, so scheduled jobs never take the focus from what B is typing.
' Used by the scheduled tasks "VoidTV Publish" and "VoidTV Nightly" (17 Nov 2026).
' Usage: wscript.exe run-hidden.vbs <script.js>
Set sh = CreateObject("WScript.Shell")
node = "C:\Users\bryan\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\node.exe"
sh.CurrentDirectory = "C:\Users\bryan\void-channel"
code = sh.Run("""" & node & """ """ & WScript.Arguments(0) & """", 0, True)
WScript.Quit code
