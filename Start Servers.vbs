' Office Management System — Server Launcher
' Double-click this file to start both servers.
' No black console window will flash.

Option Explicit

Dim oShell, oFSO, sRoot

Set oShell = CreateObject("WScript.Shell")
Set oFSO   = CreateObject("Scripting.FileSystemObject")

' Root folder = same folder as this script
sRoot = oFSO.GetParentFolderName(WScript.ScriptFullName)

' ── Start Backend (API) in a new coloured cmd window ────────────────────────
oShell.Run "cmd /k ""cd /d """ & sRoot & "\server"" && color 0B && title API Server (port 5000) && npx ts-node src/index.ts""", 1, False

' Brief pause before launching the second window
WScript.Sleep 2000

' ── Start Frontend (React) in a new coloured cmd window ─────────────────────
oShell.Run "cmd /k ""cd /d """ & sRoot & "\client"" && color 0E && title React App (port 3000) && npm start""", 1, False

' Wait for React dev server to be ready, then open the browser
WScript.Sleep 12000
oShell.Run "http://localhost:3000"

MsgBox "Both servers are running!" & vbCrLf & vbCrLf & _
       "  API  →  http://localhost:5000" & vbCrLf & _
       "  App  →  http://localhost:3000" & vbCrLf & vbCrLf & _
       "Close the two server windows to stop the servers.", _
       vbInformation, "Office Management System"

Set oShell = Nothing
Set oFSO   = Nothing
