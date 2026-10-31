param([string]$TaskId)
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'run-task.cjs') $TaskId
exit $LASTEXITCODE
