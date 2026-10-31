@echo off
chcp 65001 >nul

:: AUTOSAR BSW Config Tool - Codex 自动化任务脚本
:: 使用方法: run-task.bat <TaskId>

if "%~1"=="" (
    echo 用法: run-task.bat ^<TaskId^>
    echo 示例: run-task.bat 002
    exit /b 1
)

set TASK_ID=%~1
set CODEX_PATH=C:\Users\Pointer\AppData\Local\OpenAI\Codex\bin\22cfb1d302613eae\codex.exe

echo ==========================================
echo AUTOSAR BSW Config Tool - Codex 自动化
echo ==========================================
echo.

:: 检查任务文件是否存在
set TASK_FILE=tasks\TASK-%TASK_ID%-*.md
if not exist "%TASK_FILE%" (
    echo [错误] 任务文件不存在: %TASK_FILE%
    exit /b 1
)

:: 获取第一个匹配的文件
for %%f in (%TASK_FILE%) do set TASK_PATH=%%f
for %%f in (%TASK_FILE%) do set TASK_NAME=%%~nf

echo [任务] %TASK_NAME%
echo [文件] %TASK_PATH%
echo.

:: 检查 Codex
if not exist "%CODEX_PATH%" (
    echo [错误] Codex 不存在: %CODEX_PATH%
    echo 请检查 Codex 安装路径
    exit /b 1
)

echo [Codex] %CODEX_PATH%
echo.

:: 生成临时提示文件
set TEMP_PROMPT=tasks\temp-task-%TASK_ID%-prompt.txt

echo 生成提示文件...
> "%TEMP_PROMPT%" (
    echo 你是一个专业的 AUTOSAR BSW 配置工具开发工程师，精通 TypeScript 和 Vue 3。
    echo.
    echo 请完成以下开发任务：
    echo.
    echo ## 任务文件
    echo 请仔细阅读: %TASK_PATH%
    echo.
    echo ## 项目背景
    echo 这是一个基于网页的 AUTOSAR BSW 配置工具，目标是对标 Vector DaVinci Configurator。
    echo 核心技术栈: Vue 3 + TypeScript + Pinia + Element Plus + Vite
    echo.
    echo ## 当前工作目录
    echo D:\ProFile\教培业务\配置器\autosar-bsw-config-tool
    echo.
    echo ## 你的职责
    echo 1. 阅读任务文档，理解需求
    echo 2. 实现要求的所有文件
    echo 3. 确保代码质量 ^(TypeScript 严格模式^)
    echo 4. 运行 npm run build 验证编译通过
    echo 5. 如有疑问，在代码中留下 TODO 注释
    echo.
    echo ## 重要约束
    echo - 禁止使用 'any' 类型
    echo - 所有函数必须有明确的返回类型
    echo - 复杂逻辑必须加注释
    echo - 遵循项目已有的代码风格
    echo.
    echo ## 开始实现
    echo 请开始实现任务文档中要求的所有文件。
    echo 完成后汇报: 1^) 实现了哪些文件 2^) 是否通过编译 3^) 遇到的问题
    echo.
    echo 任务文档内容如下:
    echo ---
    type "%TASK_PATH%"
)

echo [提示文件] %TEMP_PROMPT%
echo.

:: 调用 Codex
echo [启动] Codex...
echo.

type "%TEMP_PROMPT%" | "%CODEX_PATH%" exec -

if errorlevel 1 (
    echo.
    echo ==========================================
    echo [错误] Codex 执行失败
    echo ==========================================
) else (
    echo.
    echo ==========================================
    echo [完成] Codex 任务执行完成
    echo ==========================================
)

:: 清理临时文件
if exist "%TEMP_PROMPT%" del "%TEMP_PROMPT%"
echo [清理] 已清理临时文件

goto :eof
