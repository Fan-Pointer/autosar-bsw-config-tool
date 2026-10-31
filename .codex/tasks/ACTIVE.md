# ACTIVE TASK — TASK-002

> 本文件是**当前唯一有效任务契约**。`STATE.json.task.contractPath` 指向此处。
> Codex 在 `task.status == "READY"` 时执行本文件。

## 元信息

| 项 | 值 |
|---|---|
| 任务 ID | `TASK-002` |
| 阶段 | Phase 2 |
| 优先级 | P0 |
| 依赖 | TASK-001（已完成，骨架已就绪） |
| 验收方 | 架构师 |

## 目标（一句话）

把配置器从「硬编码 DEM 字段」改造为「**BSWMD 定义驱动**」——参数定义、表单渲染、约束校验、代码生成全部由数据决定，核心引擎与模块解耦。

## 为什么现在做这个

当前 `src/modules/dem/models/*.ts` 是手写模型，加一个模块就得抄一遍。BSW 有近百个模块，这条路走不通。必须先把「模块无关的核心引擎」立住，后续每加一个模块只写一份 `bswmd/*.json`。

## 交付清单（14 个文件）

### A. BSWMD 层（纯 TS）

| # | 文件 | 职责要点 |
|---|---|---|
| 1 | `src/core/bswmd/BswmdTypes.ts` | 参数类型枚举、模块/容器/参数/引用四类接口、`ConfigClass` 三态 |
| 2 | `src/core/bswmd/BswmdParser.ts` | JSON → `BswmdModule`。必须**递归**处理 `subContainers`；缺 `uuid`/`shortName`/`type` 要抛带字段名的错误 |
| 3 | `src/core/bswmd/BswmdLoader.ts` | 支持 `loadFromUrl` / `loadFromString` / `loadFromFile`，按 `shortName` 缓存，提供 `listModules` |

### B. 配置实例层（纯 TS）

| # | 文件 | 职责要点 |
|---|---|---|
| 4 | `src/core/config/ConfigTypes.ts` | `ConfigInstance` / `ConfigContainer` / `ConfigParameterValue` / `ConfigReferenceValue` |
| 5 | `src/core/config/ConfigInstance.ts` | 从 BSWMD 建空实例（递归建容器）；`findContainer` 递归查；`setParameterValue` / `setReferenceTarget` |

### C. 约束层（纯 TS）

| # | 文件 | 职责要点 |
|---|---|---|
| 6 | `src/core/constraint/ConstraintTypes.ts` | `ConstraintRule`（含 `scope`/`severity`/`check`）、`ConstraintViolation`、`ConstraintContext` |
| 7 | `src/core/constraint/ConstraintEngine.ts` | 规则注册/注销/批量校验；单条规则抛异常时**捕获并转成 violation**，不能中断整体校验 |
| 8 | `src/core/constraint/DemConstraints.ts` | DEM 内置规则，见下方「约束清单」 |

### D. 生成层（纯 TS）

| # | 文件 | 职责要点 |
|---|---|---|
| 9 | `src/core/generator/TemplateEngine.ts` | 封装 Handlebars：注册模板 + 编译输出；模板缺失抛明确错误 |
| 10 | `src/core/generator/CGenerator.ts` | 生成 `Dem_Cfg.h` 与 `Dem_PBCfg.c`；整数走十进制、布尔走 `TRUE/FALSE`、枚举/字符串加引号 |

### E. UI 层（Vue 3）

| # | 文件 | 职责要点 |
|---|---|---|
| 11 | `src/ui/FormEditor/DynamicForm.vue` | 按 `type` 自动选控件：INTEGER/FLOAT→`el-input-number`（带 min/max）、ENUM→`el-select`、BOOLEAN→`el-switch`、其余→`el-input`；`isOptional=false` 显示必填星号 |
| 12 | `src/ui/ConfigTree/ConfigTree.vue` | 递归渲染容器树；容器节点显示 multiplicity（`1` / `0..1` / `0..n`）；参数/引用用不同图标 |
| 13 | `src/ui/Validator/ValidationPanel.vue` | 展示 violations，按 ERROR/WARNING/INFO 三色区分；显示 ruleId、message、suggestion、path；点击可回跳 |

### F. 数据

| # | 文件 | 职责要点 |
|---|---|---|
| 14 | `bswmd/dem_bswmd.json` | DEM 模块 BSWMD，覆盖 DemConfigSet / DemDTC / DemDTCAttributes / DemEventParameter / DemDebounceCounterBasedClass / DemDebounceTimeBasedClass / DemOperationCycle |

> 注：仓库中可能已有上述文件的早期版本（commit `019befc`）。**以本契约为准重写/校正**，发现与契约冲突以实现契约。

## 约束清单（DemConstraints.ts 必须实现）

| 规则 ID | 校验内容 | 级别 |
|---|---|---|
| `DEM-001` | DemDtcValue 全模块唯一 | ERROR |
| `DEM-002` | DemDtcValue ∈ [0x000001, 0xFFFFFF] 且 ≠ 0x000000 | ERROR |
| `DEM-003` | CounterFailedThreshold > 0；CounterPassedThreshold < 0 | ERROR |
| `DEM-006` | DemEventId ∈ [1,65535] 且唯一 | ERROR |
| `DEM-008` | DemAgingAllowed=true 时 DemAgingCycleRef 必须已设置 | ERROR |

## 验收标准（评审逐条对照）

**功能**
- [ ] `BswmdParser` 能解析 `bswmd/dem_bswmd.json`，得到含 7 个子容器的树
- [ ] 解析器对缺失 `uuid` 的容器抛错，错误信息含容器名/索引
- [ ] `ConfigInstanceManager.createFromBswmd()` 递归建出全部容器，参数带默认值
- [ ] `ConstraintEngine` 在一条规则抛异常时仍返回其余规则结果
- [ ] 构造「两个 DTC 同值」配置，`DEM-001` 必须报 ERROR
- [ ] 构造 `DemAgingAllowed=true` 且无 AgingCycleRef，`DEM-008` 必须报 ERROR
- [ ] `CGenerator.generateHeader()` 输出可直接编译的 `.h`（宏名不含中文、不含非法字符）
- [ ] `DynamicForm` 对 ENUM 参数渲染下拉、对 BOOLEAN 渲染开关

**工程**
- [ ] `npm run build` 通过（含 `vue-tsc --noEmit`）
- [ ] `src/core/**` 全目录 grep 不到 `from 'vue'` / `pinia` / `element-plus`
- [ ] 全仓库 `: any` 出现次数为 0（`unknown` 不算）
- [ ] 导出函数均有 JSDoc
- [ ] 无 `@ts-ignore`

**交付物**
- [ ] `.codex/reports/TASK-002-REPORT.md` 已按模板填写
- [ ] `.codex/STATE.json` 中 `task.status == "SUBMITTED"`

## 明确不做（避免范围蔓延）

- ❌ 不做 ARXML 导入导出（Phase 4）
- ❌ 不做 Vue Flow 引用图（Phase 3）
- ❌ 不做 Python 约束运行时（Phase 3）
- ❌ 不新增 DEM 以外的 BSW 模块
- ❌ 不接后端、不改路由结构

## 自检命令

```bash
cd "D:/ProFile/教培业务/配置器/autosar-bsw-config-tool"
npm install
npm run build
grep -rn "from 'vue'" src/core/ || echo "OK: core 无 Vue 依赖"
grep -rn ": any" src/ || echo "OK: 无 any"
```
