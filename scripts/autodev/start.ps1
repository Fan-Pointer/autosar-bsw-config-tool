param([switch]$Foreground)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$dispatcher = Join-Path $PSScriptRoot 'dispatch.mjs'
$runtimeDir = Join-Path $projectRoot '.temp\autodev'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$codexExe = (Get-Command codex -ErrorAction Stop).Source
# Initialize the local configuration and pin the observed CLI path (not a version guess).
& $nodeExe $dispatcher status | Out-Null
$configPath = Join-Path $runtimeDir 'config.json'
$localConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$localConfig.codexExecutable = $codexExe
$localConfig | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding utf8
if ($Foreground) { & $nodeExe $dispatcher run; exit $LASTEXITCODE }
$lockPath = Join-Path $runtimeDir 'dispatcher.lock'
if (Test-Path -LiteralPath $lockPath) {
    $lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (Get-Process -Id $lock.pid -ErrorAction SilentlyContinue) {
        Write-Output "Dispatcher already running: $($lock.pid)"
        exit 0
    }
}
$background = Start-Process -FilePath $nodeExe -ArgumentList @('"' + $dispatcher + '"', 'run') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $runtimeDir 'dispatcher.stdout.log') `
    -RedirectStandardError (Join-Path $runtimeDir 'dispatcher.stderr.log')
Write-Output "Dispatcher started: PID $($background.Id). Status: node scripts/autodev/dispatch.mjs status"
