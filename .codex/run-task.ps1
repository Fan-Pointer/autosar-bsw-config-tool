# Codex 任务下发脚本
param(
    [Parameter(Mandatory=$true)]
    [string]$TaskId
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$codexPath = "C:\Users\Pointer\AppData\Local\OpenAI\Codex\bin\22cfb1d302613eae\codex.exe"
$workDir = "D:\ProFile\教培业务\配置器\autosar-bsw-config-tool"

Set-Location $workDir

# 查找任务文件
$taskFiles = Get-ChildItem -Path ".\tasks\TASK-$TaskId-*.md" -ErrorAction SilentlyContinue
if ($taskFiles.Count -eq 0) {
    Write-Host "ERROR: Task file not found: tasks\TASK-$TaskId-*.md"
    exit 1
}

$taskPath = $taskFiles[0].FullName
Write-Host "Task: $($taskFiles[0].Name)"

# 构建提示词
$promptLines = @(
    "You are a senior TypeScript and Vue 3 engineer working on an AUTOSAR BSW configuration tool.",
    "",
    "Please complete the development task described in this file: $taskPath",
    "",
    "Working directory: $workDir",
    "",
    "Project context:",
    "- Web-based AUTOSAR BSW configuration tool (similar to Vector DaVinci Configurator)",
    "- Tech stack: Vue 3 + TypeScript + Pinia + Element Plus + Vite",
    "- Core engine must be pure TypeScript (no Vue dependencies)",
    "",
    "Requirements:",
    "1. Read the task file carefully",
    "2. Implement ALL required files listed in the task",
    "3. Use strict TypeScript - no 'any' type",
    "4. All exported functions need JSDoc comments",
    "5. Run 'npm install' then 'npm run build' to verify",
    "",
    "Start implementing now."
)

$promptFile = ".\tasks\.prompt-$TaskId.txt"
$promptLines | Out-File -FilePath $promptFile -Encoding UTF8

Write-Host "Calling Codex..."

Get-Content $promptFile | & $codexPath exec - 2>&1 | Tee-Object -FilePath ".\tasks\.codex-$TaskId.log"

Write-Host ""
Write-Host "Codex execution finished. Log: tasks\.codex-$TaskId.log"
