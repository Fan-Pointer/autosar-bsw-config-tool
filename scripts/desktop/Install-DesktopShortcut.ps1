$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'BSW 配置器.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'Start-Configurator.ps1') + '"'
$shortcut.WorkingDirectory = $repoPath
$shortcut.Description = '打开当前仓库的最新 BSW 配置器；未启动时自动启动本地服务。'
$shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32/shell32.dll') + ',14'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output $shortcutPath
