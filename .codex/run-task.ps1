# AUTOSAR BSW Config Tool - Codex 自动化任务脚本
# 使用方法: .\run-task.ps1 -TaskId 002

param(
    [Parameter(Mandatory=$true)]
    [string]$TaskId,
    
    [string]$CodexPath = "C:\Users\Pointer\AppData\Local\OpenAI\Codex\bin\22cfb1d302613eae\codex.exe",
    
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "AUTOSAR BSW Config Tool - Codex 自动化"
Write-Host "=========================================="
Write-Host ""

# 检查任务文件
$taskFile = ".\tasks\TASK-$TaskId-*.md"
$matches = Get-ChildItem -Path $taskFile -ErrorAction SilentlyContinue

if ($matches.Count -eq 0) {
    Write-Error "任务文件不存在: $taskFile"
    exit 1
}

$taskPath = $matches[0].FullName
$taskName = $matches[0].BaseName
Write-Host "📋 任务: $taskName"
Write-Host "📄 文件: $taskPath"
Write-Host ""

# 检查 Codex
if (-not (Test-Path $CodexPath)) {
    Write-Error "Codex 不存在: $CodexPath"
    Write-Host "请检查 Codex 安装路径"
    exit 1
}

Write-Host "✅ Codex 路径: $CodexPath"
Write-Host ""

# 生成提示文件
$tempPrompt = ".\tasks\temp-task-$TaskId-prompt.txt"

$content = @"
你是一个专业的 AUTOSAR BSW 配置工具开发工程师，精通 TypeScript 和 Vue 3。

请完成以下开发任务：

## 任务文件
请仔细阅读: $taskPath

## 项目背景
这是一个基于网页的 AUTOSAR BSW 配置工具，目标是对标 Vector DaVinci Configurator。
核心技术栈: Vue 3 + TypeScript + Pinia + Element Plus + Vite

## 当前工作目录
D:\ProFile\教培业务\配置器\autosar-bsw-config-tool

## 你的职责
1. 阅读任务文档，理解需求
2. 实现要求的所有文件
3. 确保代码质量 (TypeScript 严格模式)
4. 运行 npm run build 验证编译通过
5. 如有疑问，在代码中留下 TODO 注释

## 重要约束
- 禁止使用 'any' 类型
- 所有函数必须有明确的返回类型
- 复杂逻辑必须加注释
- 遵循项目已有的代码风格

## 开始实现
请开始实现任务文档中要求的所有文件。
完成后汇报: 1) 实现了哪些文件 2) 是否通过编译 3) 遇到的问题

任务文档内容如下:
---

$(Get-Content $taskPath -Raw)
"@

$content | Out-File -FilePath $tempPrompt -Encoding UTF8

Write-Host "📝 已生成提示文件: $tempPrompt"
Write-Host ""

if ($DryRun) {
    Write-Host "🧪 试运行模式，不实际调用 Codex"
    Write-Host "提示文件内容预览:"
    Write-Host "---"
    Get-Content $tempPrompt -Head 50
    Write-Host "---"
    exit 0
}

# 调用 Codex
Write-Host "🚀 启动 Codex..."
Write-Host ""

try {
    Get-Content $tempPrompt | & $CodexPath exec - 2>&1
    
    Write-Host ""
    Write-Host "=========================================="
    Write-Host "✅ Codex 任务执行完成"
    Write-Host "=========================================="
} catch {
    Write-Host ""
    Write-Host "=========================================="
    Write-Host "❌ Codex 执行失败"
    Write-Host "=========================================="
    Write-Host $_.Exception.Message
    exit 1
} finally {
    # 清理临时文件
    if (Test-Path $tempPrompt) {
        Remove-Item $tempPrompt
        Write-Host "🧹 已清理临时文件"
    }
}
