# 航海科技 · OneSAR Configurator

## 当前使用入口（TASK-021）

安装 Node.js 18+ 后执行 `npm install`、`npm run dev`，打开 `http://localhost:3000/`。
首页采用蓝白产品目录，提供新建工程、本机工程列表以及知识库/订阅中心的「待更新」页面。
首页「打开配置器」进入 `/configurator` 起始页，默认显示新建工程表单；左侧可切换导入、打开工程，各入口显示独立内容，不自动续开上次工程。新建成功后进入配置工作区，打开页可继续已有工程或独立配置集。
只有点选具体工程才进入 `/workspace`。工作区工具栏的房子图标返回首页。
起始页导入目前接受 JSON/ARXML 配置文件，固定新建配置集并归入默认工程，不覆盖上次工程；完整工程包归后续 S5。
Windows 桌面入口由 `scripts/desktop/Install-DesktopShortcut.ps1` 安装，双击已有的
「BSW 配置器」快捷方式即可打开当前仓库的最新首页；启动器不会复制旧版本，也不修改系统执行策略。

新建工程分两步：填写名称、AUTOSAR 版本、芯片与描述，然后勾选模块。
内置目录包含 CP **4.4.0 的全部 98 个模块**和 CP **4.2.2 的全部 84 个模块**，按所选版本展示。
目前分别有 94 / 23 个模块可选择，其他模块显示具体原因；可选择不代表所有字段或供应商集成都已支持。
Dem 4.2.2 已验证创建、编辑、保存、校验、JSON/ARXML 往返及通用 C 代码编译；旧手写资产仍只用于只读恢复。
S32K1XX、S32K3XX 是工程属性，不表示已实现 MCAL/芯片驱动适配。

工程元信息保存在独立 `autosar-projects` 索引中；配置集沿用原来的 v3 库。
旧配置集自动显示在「默认工程」，不进行迁移或覆盖。移除工程归属只移除索引关联，配置仍保留。
数据属于当前浏览器及来源地址，请保持使用 `localhost:3000`；定期导出备份。
工程向导和模块管理共用分类、搜索、左右加入/移除选择器。已建工程可通过模块管理调整归属，提交前需确认；
移除只隐藏该工程的模块，配置数据保留，重新加入会恢复原配置。取消不写入数据。
工程整体导出与跨模块边界收口属于后续 S5；不宣称供应商 BSW 集成已验证。

右键实例仅显示「新建实例、克隆实例、删除实例」。悬停新建即展开子容器名称，移出两级菜单
300ms 后收起；键盘 ArrowRight/ArrowLeft/Esc 仍可使用。参数说明保留在底部说明区。

### 重建内置定义

官方源位于仓库父目录。当前用户提供的 `AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml`
**内部声明为 CP 4.4.0**（SHA256 `c01fbd95…209bf`），以文件内容为准，执行：

```powershell
node scripts/gen-bswmd-from-arxml.mjs Dem ../AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml bswmd/dem_bswmd.json
node scripts/gen-bswmd-from-arxml.mjs CanIf ../AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml bswmd/builtin/4.4.0/canif_bswmd.json
node scripts/gen-bswmd-from-arxml.mjs NvM ../AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml bswmd/builtin/4.4.0/nvm_bswmd.json
node scripts/gen-bswmd-from-arxml.mjs --all ../AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml bswmd/builtin/4.4.0
node scripts/gen-bswmd-from-arxml.mjs --all ../AUTOSAR_MOD_ECUConfigurationParameters_4.2.2.arxml bswmd/builtin/4.2.2
npm run build
npm run test:verify
```

生成物带 `$source`、源 SHA256、内容 SHA256 和相邻 `changelog.json`，对象键稳定排序、数组保留定义顺序。
全目录按模块构建为独立资源块；所选模块才加载，既有 Dem 基线仍由配置 store 初始化。
最新解析数是 4.2.2 的 78/84、4.4.0 的 94/98；其中 55 个已解析的 4.2.2 模块仍等待符号名引用全库验证。
完整状态、来源哈希和输出边界检查保存在各版本的 `catalog.json`。后续类型批次见
[TASK-021 交付与限制](.codex/reports/TASK-021-REPORT.md)，不把目录可见等同于全功能交付。

当前范围和阶段依据 [产品设计](docs/product-design/02-TECH-DESIGN.md) 与
[任务状态](.codex/STATE.json)。下面保留早期项目说明以供追溯，其中路线表不是当前完成状态；
变体、Python 插件和供应商集成不作为本轮已实现能力。

---

## 早期项目说明

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
