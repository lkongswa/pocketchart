Set WshShell = WScript.CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")
strProjectDir = Replace(WScript.ScriptFullName, "\create-shortcut.vbs", "")

Set oShellLink = WshShell.CreateShortcut(strDesktop & "\PocketChart.lnk")
oShellLink.TargetPath = strProjectDir & "\release\win-unpacked\PocketChart.exe"
oShellLink.WorkingDirectory = strProjectDir & "\release\win-unpacked"
oShellLink.IconLocation = strProjectDir & "\build\icon.ico,0"
oShellLink.WindowStyle = 1
oShellLink.Description = "PocketChart - Clinical Documentation"
oShellLink.Save
WScript.Echo "Shortcut created on Desktop!"
