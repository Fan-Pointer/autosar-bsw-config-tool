# AUTOSAR BSW Config Tool

基于网页的 AUTOSAR Classic 基础软件（BSW）配置工具，对标 Vector DaVinci Configurator / ETAS ISOLAR。

## 设计理念

**不是"表单编辑器"，而是完整的 BSW 配置工作流：**

```
BSWMD 定义输入 → 配置编辑 → 约束验证 → 代码生成
     ↓              ↓           ↓           ↓
  ARXML/JSON      GUI        Python/TS    C代码/ARXML
```

### 核心能力

| 能力 | 说明 | 状态 |
|------|------|------|
| **BSWMD 驱动** | 从模块定义自动生成 UI，不硬编码 | 🚧 开发中 |
| **动态表单** | 根据参数类型（INT/ENUM/BOOL/REF）自动渲染控件 | 🚧 开发中 |
| **约束引擎** | Python 可编写验证规则（R-001~R-008） | 📝 规划中 |
| **代码生成** | Handlebars 模板生成 `_Cfg.h` / `_PBCfg.c` | 📝 规划中 |
| **ARXML 互操作** | 导入/导出 AUTOSAR 4.2.2 规范文件 | 📝 规划中 |
| **变体支持** | PreCompile / LinkTime / PostBuild | 📝 规划中 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite |
| UI | Element Plus |
| 状态 | Pinia |
| ARXML | fast-xml-parser |
| 模板 | Handlebars |
| Python | Pyodide (WebAssembly) |
| 图形 | @vue-flow/core |
| 存储 | LocalForage (IndexedDB) |

## 快速开始

```bash
npm install      # 安装依赖
npm run dev      # 开发模式 (http://localhost:3000)
npm run build    # 生产构建
```

## 项目结构

```
autosar-bsw-config-tool/
├── src/
│   ├── core/                       # 🧠 核心引擎（纯 TS，无 Vue 依赖）
│   │   ├── bswmd/                  # BSWMD 解析（ARXML/JSON → 参数定义树）
│   │   ├── config/                 # 配置实例管理
│   │   ├── constraint/             # 约束引擎（TS + Python）
│   │   ├── generator/              # 代码生成（模板 → C/ARXML）
│   │   └── variant/                # 变体管理
│   ├── modules/                    # 📦 BSW 模块定义
│   │   ├── dem/                    # DEM（诊断事件管理）
│   │   ├── dcm/                    # DCM（诊断通信管理）
│   │   ├── nvm/                    # NvM（非易失存储）
│   │   ├── can/                    # CAN 驱动
│   │   ├── com/                    # COM 通信
│   │   ├── pdur/                   # PDU Router
│   │   ├── os/                     # AUTOSAR OS
│   │   ├── ecum/                   # ECU Manager
│   │   ├── wdgm/                   # Watchdog Manager
│   │   └── bswm/                   # BSW Mode Manager
│   ├── ui/                         # 🎨 UI 组件
│   │   ├── ConfigTree/             # 配置树导航
│   │   ├── FormEditor/             # 动态表单
│   │   ├── GraphView/              # 引用关系图
│   │   ├── Validator/              # 验证面板
│   │   └── Generator/              # 生成器界面
│   ├── stores/                     # Pinia stores
│   ├── types/                      # TypeScript 类型
│   ├── utils/                      # 工具函数
│   └── views/                      # 页面视图
├── bswmd/                          # 📋 BSWMD 参数定义（.arxml / .json）
├── templates/                      # 📝 代码生成模板（.tmpl）
├── constraints/                    # 🐍 Python 约束规则（.py）
├── docs/                           # 📚 文档
├── .codex/                         # 🤖 Codex 自动化任务
└── project-engineering-file.md     # 项目工程档案
```

## 开发路线

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 项目骨架 + 基础数据模型 | ✅ 完成 |
| Phase 2 | BSWMD 解析器 + 动态配置引擎 | 🚧 进行中 |
| Phase 3 | 引用关系图 + Python 约束引擎 | 📝 规划 |
| Phase 4 | 代码生成器（C / ARXML） | 📝 规划 |
| Phase 5 | 多模块扩展（Dcm/NvM/Can...） | 📝 规划 |
| Phase 6 | 变体管理 + CLI 自动化 | 📝 规划 |

## Codex 自动化

本项目使用 Codex 自动执行开发任务：

```powershell
.\\.codex\run-task.ps1 -TaskId 002
```

任务文档位于 `.codex/tasks/`，详见 [.codex/README.md](./.codex/README.md)

## 文档

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE-v2.md](./docs/ARCHITECTURE-v2.md) | **架构设计（最新）** |
| [REQUIREMENTS.md](./docs/REQUIREMENTS.md) | 需求规格 |
| [internal-data-model.md](./docs/internal-data-model.md) | 数据模型 |
| [CODE-REVIEW-CHECKLIST.md](./docs/CODE-REVIEW-CHECKLIST.md) | 代码评审清单 |
| [project-engineering-file.md](./project-engineering-file.md) | 工程档案（ADR/风险/进度） |

## 参考

- AUTOSAR Classic Platform 4.2.2
- AUTOSAR RS ECU Configuration
- Vector DaVinci Configurator Classic
- ETAS ISOLAR-AB

## 许可证

MIT License
