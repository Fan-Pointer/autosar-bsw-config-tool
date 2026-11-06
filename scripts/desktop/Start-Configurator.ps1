param([switch]$NoBrowser, [ValidateRange(1024, 65535)][int]$Port = 3000)

$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$appUrl = "http://localhost:$Port/workspace"
$logDirectory = Join-Path $repoPath ".temp/desktop-launcher/$Port"
$mutex = New-Object System.Threading.Mutex($false, "Local\AutosarBswConfiguratorLauncher$Port")
$locked = $false

function Test-ConfiguratorReady {
    try {
        # Probe IPv4 directly: localhost IPv6 fallback can exceed a short health timeout.
        $package = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/package.json" -TimeoutSec 3
        return $package.name -eq 'autosar-bsw-config-tool'
    } catch { return $false }
}

try {
    $locked = $mutex.WaitOne(30000)
    if (-not $locked) { throw '配置器启动中，请稍后再试。' }
    if (-not (Test-ConfiguratorReady)) {
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        if (-not (Test-Path (Join-Path $repoPath 'node_modules/vite/package.json'))) {
            throw '缺少项目依赖。请在仓库目录运行 npm ci 后再打开快捷方式。'
        }
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $entryPath = Join-Path $PSScriptRoot 'server.mjs'
        $server = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $entryPath + '"'), "$Port") `
            -WorkingDirectory $repoPath -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDirectory 'server.log') `
            -RedirectStandardError (Join-Path $logDirectory 'server-error.log')
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if (Test-ConfiguratorReady) { $ready = $true; break }
            if ($server.HasExited) { break }
            Start-Sleep -Milliseconds 500
        }
        if (-not $ready) {
            throw "配置器未能启动。请检查 $Port 端口是否被其他程序占用。错误日志：$logDirectory\server-error.log"
        }
        Write-Output "Started server PID: $($server.Id)"
    }
    Write-Output "Ready: $appUrl"
    if (-not $NoBrowser) { Start-Process $appUrl }
} catch {
    $message = $_.Exception.Message
    if (-not $NoBrowser) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($message, 'BSW 配置器启动失败') | Out-Null
    }
    Write-Error $message
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
