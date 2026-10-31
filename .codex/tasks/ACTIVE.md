# ACTIVE TASK — TASK-007

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**（含标题、编号、验收项）。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-007** |
| 任务名 | 官方 ECUC ARXML 直读 BSWMD + 第二模块（NvM）跑通全链路 |
| 阶段 | PHASE-7 |
| 指派 | codex |
| 前置 | TASK-006 APPROVED（commit `5f541c2`），19 条验收 18 通过 1 部分 |
| 为什么现在做 | 见 §1 |

---

## 0. 本轮目标（一句话）

让产品能吃 AUTOSAR **官方** `ECUC-MODULE-DEF` 定义文件，并据此跑通第二个模块（NvM）的「加载 → 编辑 → 校验 → 导出」全链路，且 `src/core` 不为 NvM 改动一行。

---

## 1. 为什么这是当前最高优先级

现状：`bswmd/dem_bswmd.json` 是**手写**的自定义 JSON。这带来两个致命问题：

1. **产品无法使用真实工具链的定义文件**。用户的 `D:\ProFile\教培业务\配置器\AUTOSAR_MOD_ECUConfigurationParameters.arxml`（14.6 MB，含 **98 个 ECUC 模块**）至今**未被产品读取一次**。没有它，工具只能配一个 DEM，不能配真实 ECU。
2. **"BSWMD 驱动"未经第二个模块检验**。所有模块相关代码只跑过 Dem 一个样本，抽象是否成立仍是假设。

这是「通用 BSW 配置器」与「DEM 编辑器」的分水岭。**必须先过这道闸门，再做引用图和拖拽。**

---

## 2. 输入材料

| 材料 | 路径 | 说明 |
|---|---|---|
| 官方定义文件 | `D:\ProFile\教培业务\配置器\AUTOSAR_MOD_ECUConfigurationParameters.arxml` | 14.6 MB，AUTOSAR R21-11 之后版本，含 98 个 `ECUC-MODULE-DEF`。**项目外一层目录，只读，不要复制入库** |
| 现有 BSWMD 类型 | `src/core/bswmd/BswmdTypes.ts` | 解析输出必须落到这套结构 |
| 现有解析入口 | `src/core/bswmd/BswmdParser.ts` | 已有 `parseFromJson`，本轮新增 ARXML 入口，不要改动其既有语义 |

已确认可用模块（不必再查）：`NvM`、`CanIf`、`Dcm`、`Com`、`EcuM`、`Can` 等均在其中。

---

## 3. 交付清单（A/B/C/D 四组，共 16 项）

### A. ECUC ARXML 解析器（A1–A6）

| 编号 | 交付内容 | 文件建议 |
|---|---|---|
| A1 | 新增 `src/core/bswmd/EcucArxmlImporter.ts`，函数 `importEcucModuleArxml(source, moduleShortName)` → `BswmdModule` | 新建 |
| A2 | 解析 `ECUC-MODULE-DEF`：`SHORT-NAME`、`DESC`、`LOWER/UPPER-MULTIPLICITY`、`CONTAINERS` | 同上 |
| A3 | 递归解析 `ECUC-PARAM-CONF-CONTAINER-DEF`：`SHORT-NAME`、`DESC`、multiplicity、`SUB-CONTAINERS`、`PARAMETER-DEFS`、`REFERENCE-DEFS` | 同上 |
| A4 | 解析参数类型：`ECUC-BOOLEAN-PARAM-DEF`、`ECUC-INTEGER-PARAM-DEF`（含 `MIN`/`MAX`/`DEFAULT-VALUE`）、`ECUC-FLOAT-PARAM-DEF`、`ECUC-ENUMERATION-PARAM-DEF`（含 `LITERALS` 与默认字面量）、`ECUC-STRING-PARAM-DEF`（含 `MIN-LENGTH`/`MAX-LENGTH`/`REGULAR-EXPRESSION`）、`ECUC-FUNCTION-NAME-DEF` | 同上 |
| A5 | 解析 `ECUC-REFERENCE-DEF`：`DESTINATION-REF`、multiplicity、是否必填 | 同上 |
| A6 | **按模块名过滤后再解析**：不得把 14.6 MB 全量建成内存树。可用流式/分片定位 `ECUC-MODULE-DEF` 段后再局部解析 | 同上 |

### B. 抽取与固化为测试样本（B1–B2）

| 编号 | 交付内容 |
|---|---|
| B1 | 新增 `scripts/extract-ecuc-module.mjs`：从全量文件抽取指定模块（含其全部子容器/参数/引用）为独立、结构完整的 ARXML，保留命名空间与层级 |
| B2 | 用它生成 `tests/fixtures/ecuc-nvm.arxml`（NvM）与 `tests/fixtures/ecuc-canif.arxml`（CanIf），**提交入库**，单个建议 ≤ 600 KB。全量文件不入库 |

### C. 第二模块跑通全链路（C1–C5）

| 编号 | 交付内容 |
|---|---|
| C1 | 界面新增「导入模块定义（ARXML）」入口：放在「模块管理」弹窗内，选择 `.arxml` 文件后解析并列出该文件内的**所有**模块供勾选导入 |
| C2 | 导入后模块进入 `BSW Modules` 树，可创建配置集（root 容器自动实例化，`lower=0` 仍不预建实例） |
| C3 | 树、表单、参数类型、必填标记、范围校验、枚举下拉**全部由新模块的 BSWMD 元数据驱动**，无任何 NvM 专用代码 |
| C4 | 约束校验：至少 2 条**由元数据自动派生**的通用规则对新模块生效（如必填未配、数值越界） |
| C5 | 导出 ARXML：`DEFINITION-REF` 必须是 `/AUTOSAR/EcucDefs/NvM/...`，命名空间 r4.2.2，UUID 唯一；导入导出可往返 |

### D. 遗留修复（D1–D3，必须做）

| 编号 | 来源 | 要求 |
|---|---|---|
| D1 | TASK-006 🟠-1 | `cacheDir` 层级修正：改为 Vite **根级** `cacheDir` 或 `test.deps.cacheDir`，使 vitest 缓存写入不再落到 `%TEMP%`。验收：连续 3 次 `npm test -- --run` 收集文件数一致 |
| D2 | TASK-005 🟡-1 | 注释里出现 `<!DOCTYPE` 字样的**合法**文件不应被拒：前置检查改为跳过注释段后再匹配（或对命中位置做上下文判定），并补一条「注释提及 DOCTYPE 可正常导入」的测试 |
| D3 | TASK-006 🟡-1 | 引用选择弹窗无候选时显示空状态：「暂无 <目标容器> 实例，请先新增」+ 快捷新增入口 |

---

## 4. 验收标准

### 功能（8 条）

1. **解析正确性**：`importEcucModuleArxml(ecuc-nvm.arxml, 'NvM')` 得到 ≥1 个根容器、递归子容器总数 ≥5、参数总数 ≥20、引用总数 ≥3；每个参数带 `type`，INTEGER 带 `min`/`max`（若源文件有）、ENUM 带字面量列表。
2. **CanIf 亦可解析**：`ecuc-canif.arxml` → `CanIf` 模块容器数 ≥5，且不抛错（证明不是为 NvM 特调）。
3. **界面导入闭环**：在模块管理弹窗导入 `ecuc-nvm.arxml` → 树中出现 `NvM` → 新建配置集 → 选中 root 实例 → 参数表单正常渲染（含枚举下拉、必填红标）。
4. **编辑与持久化**：改一个 NvM 参数 → 保存 → 刷新页面后值仍在。
5. **元数据驱动校验**：清空一个必填参数 → 校验面板报错并可定位；填超范围值 → 报范围错误。两条规则均**不得**写在 NvM 专用文件里。
6. **ARXML 导出合规**：导出 NvM 配置后，独立 DOMParser 断言：命名空间 `http://autosar.org/schema/r4.2.2`、全部 UUID 唯一、全部 `DEFINITION-REF` 以 `/AUTOSAR/EcucDefs/NvM` 开头。
7. **往返一致**：NvM 导出 → 导入到空库 → 容器/参数/引用逐项相等。
8. **Dem 不退化**：原有 DEM 全部能力（配置、校验、C 生成、导入导出、撤销、批量、搜索、主题）行为不变。

### 工程（7 条）

9. `npm run build` 通过。
10. `npm test -- --run` 全绿，用例数 **≥ 164**；**既有 8 个测试文件不得删改用例**（如需调整必须在报告逐行说明并给等价覆盖）。
11. `src/core/` **零** `NvM`/`CanIf`/`Dem` 等模块名硬编码（新增解析器同样适用；`EcucArxmlImporter` 只能通过入参模块名工作）。
12. `src/core/` 仍零 vue/pinia/element-plus。
13. 无新增运行时依赖。
14. D1/D2/D3 三项修复各有对应测试。
15. 全量 14.6 MB **不入库**；`tests/fixtures/` 新增文件合计 ≤ 1.2 MB。

### 性能（2 条）

16. 从 14.6 MB 全量文件解析单个模块（NvM）**≤ 3 s**，且解析期间界面不白屏（可用 Web Worker、分片 yield 或进度提示；报告需说明选型）。
17. 导入后首次渲染树 ≤ 500 ms（≥5 容器、≥20 参数规模）。

---

## 5. 红线

1. **不得**把 14.6 MB 全量 ARXML 提交入库，也不得在测试中依赖它存在（测试只能用 `tests/fixtures/`）。
2. **不得**为 NvM 写专用解析或专用表单分支；一切差异必须来自 BSWMD 元数据。
3. **不得**删改既有测试用例变绿。
4. **不得**在 `src/core/` 引入 UI 框架依赖或读取 DOM。
5. **不得**声称完成真实浏览器验收除非实际执行。
6. **不得**修改 `STATE.json` 的 `stage`、`review/**`、本契约。
7. 若某一参数类型（如 `ECUC-FUNCTION-NAME-DEF`）在源文件中结构特殊导致无法完整解析，**允许降级为 STRING 并在报告显式列出**，不得静默丢弃。

---

## 6. 分批交付许可

本任务允许**两轮交付**，但 **round 0 必须至少完成 A1–A6 + B1–B2 + C1–C3 + D1–D3**（即「能解析、能导入、能在树上看到、能编辑」）；C4/C5 与性能项可留至 round 1。
若选择分批，在报告开头写明本轮覆盖到哪几项，**不得把未做项报告为已做**。

---

## 7. 报告要求

`.codex/reports/TASK-007-REPORT.md` 必须含：

| 章节 | 内容 |
|---|---|
| 交付对照 | A1–D3 逐项「文件 + 实现要点」 |
| 解析策略 | 如何按模块过滤、如何避免全量建树、14.6 MB 实测耗时 |
| 元数据映射表 | ARXML 元素 → `BswmdTypes` 字段的对照，含缺失字段的降级说明 |
| NvM 实测 | 容器数/参数数/引用数、界面截图路径（若有） |
| 可插拔性证据 | `grep -rn 'NvM\|CanIf' src/core` 的输出（应为空） |
| 遗留修复 | D1/D2/D3 各自的「改了什么 + 新测试名」 |
| 既有用例变更 | 若有，逐行 diff 与理由 |
| 未完成与限制 | 未做、未验证、降级的项，必须显式列出 |
| 自检日志 | build / test 原文关键行 |

---

## 8. 完成后动作

1. 提交代码、fixture 与本报告（提交信息 `feat: TASK-007 ...`）。
2. 单独提交 `STATE.json`：`task.status = "SUBMITTED"`、`submittedAt`、`submissionCommit`（**指向代码提交的完整 SHA**）。
3. 不修改 `stage`、不写 `review/**`、不发起下一任务。
