# AUTOSAR BSW Config Tool - Codex 自动化工作流

## 快速开始

### 运行任务

```powershell
# 方式1: PowerShell 脚本
.\run-task.ps1 -TaskId 002

# 方式2: Batch 脚本
run-task.bat 002
```

### 任务列表

| 任务 | 描述 | 状态 |
|------|------|------|
| Task-001 | 项目骨架与数据模型 | ✅ 已完成 |
| Task-002 | BSWMD 解析器与动态配置引擎 | 📝 待执行 |
| Task-003 | 引用关系图与 Python 约束 | 📝 规划中 |
| Task-004 | 代码生成器与模板 | 📝 规划中 |

---

## 任务结构

```
.codex/
├── tasks/                    # 任务文档
│   ├── TASK-001-*.md
│   ├── TASK-002-*.md
│   └── ...
├── prompts/                  # 提示模板
├── run-task.ps1             # PowerShell 脚本
├── run-task.bat             # Batch 脚本
└── README.md               # 本文档
```

---

## 创建新任务

1. 复制 `TASK-001-SKELETON.md` 模板
2. 修改任务编号和内容
3. 放置到 `tasks/` 目录
4. 运行: `run-task.ps1 -TaskId XXX`

---

## Codex 配置要求

- Codex CLI 路径: `C:\Users\Pointer\AppData\Local\OpenAI\Codex\bin\...\codex.exe`
- 工作目录: 项目根目录
- 自动读取任务文件并执行
