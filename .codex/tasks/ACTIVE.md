# ACTIVE TASK — TASK-011

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**（含标题、编号、验收项）。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-011** |
| 任务名 | Dem 切换官方 ECUC 定义（67 容器全量界面）+ 右键添加容器体验优化 |
| 阶段 | PHASE-11 |
| 指派 | codex |
| 用户指令 | 「模块的配置参数按照 AUTOSAR 的模块配置参数 XML 来；Dem 模块的容器不全；起码先把一个模块的完整容器界面搭建完成；容器右键添加容器的界面可以优化一下」 |
| 前置 | 参考基线 `819eb12`（架构师已打通数据通路，见 §1） |
| 与 TASK-010 的关系 | TASK-010（顺序稳定/覆盖率提示/引用图/拖拽）转入 `STATE.queue` 顺延，本轮不做 |

---

## 1. 现状（架构师已于 `819eb12` 验证，可直接采信）

| 项 | 值 |
|---|---|
| 官方 Dem 规模 | 2 顶层（`DemConfigSet` + `DemGeneral`）/ **67 容器** / **162 参数** / **64 引用**，解析 273 ms |
| `bswmd/dem_bswmd.json` | **已替换**为官方生成版（207 KB），每个参数/引用携带 `definitionPath`，`$source` 含溯源元数据（源文件 SHA-256、生成时间） |
| 手写旧版 | 备份于 `.temp/dem_bswmd.legacy.json`（不入库） |
| 生成脚本 | `scripts/gen-bswmd-from-arxml.mjs Dem` 可重跑 |
| 导入器 | `EcucArxmlImporter.reference()` 已支持四类引用（见下表） |
| 破坏面 | **252 测试中 112 失败**；200 处旧语义 id（`ecuc-dem-dtc-value` 等）在新定义中变为官方 `ECUC:guid`；**产品源码 `src/` 零依赖旧 id**，全部在 `tests/` |

四类引用的解析约定（已在 `819eb12` 实现，契约确认有效）：

| 标签 | 数量 | 目标表达 | 编辑器行为 |
|---|---|---|---|
| `ECUC-REFERENCE-DEF` | 47 | 单个 `<DESTINATION-REF>` | 复用现有引用选择器 |
| `ECUC-CHOICE-REFERENCE-DEF` | 10 | `<DESTINATION-REFS>` 多候选（如 `DemMemoryDestinationRef` 含 `DemPrimaryMemory`/`DemUserDefinedMemory`） | 从全部候选目标的实例中选 |
| `ECUC-FOREIGN-REFERENCE-DEF` | 4 | **无静态目标**（跨模块） | `isExternal=true`，只读展示 |
| `ECUC-INSTANCE-REFERENCE-DEF` | 3 | **无静态目标**（实例引用） | `isExternal=true`，只读展示 |

4 个 CHOICE 容器：`DemDebounceAlgorithmClass`、`DemDataElementClass`、`DemDiagnosisScaling`、`DemSRDataElementClass`，均已在 TASK-009 的互斥机制覆盖内。

---

## 2. 交付清单（A/B/C 三组，共 12 项）

### A. 测试适配（A1–A3，round 0 必做）

| 编号 | 交付内容 |
|---|---|
| A1 | 新建 `tests/helpers/definitionIndex.ts`：构建 `definitionPath → uuid` 与 `shortName → uuid`（参数/引用/容器三类）索引，导出 `byPath(path)`、`byShort(name, containerPath?)` 两个定位函数。**测试不得再出现任何 `ECUC:guid` 字面量** |
| A2 | 修复 112 个失败用例：把 200 处旧语义 id 字符串替换为 helper 调用。**优先用 `byShort`**（可读），歧义时用 `byPath`。替换映射以 `.temp/dem_bswmd.legacy.json` 的 id→shortName 与新 JSON 的 shortName→uuid 自动生成，人工核对差异 |
| A3 | 语义保持核查表：每个被改断言说明「旧断言意图 → 新断言意图」，覆盖面不得减少（沿用 TASK-008 C3 标准）。**特别注意**：新定义里 `DemDTC` 有 5 参数（旧 4）、`DemDTCAttributes` 有 6 参数 8 引用（旧 4 参数 4 引用），涉及数量断言的用例要按新定义重算，不是简单改数字 |

### B. 完整容器界面（B1–B5）

| 编号 | 交付内容 |
|---|---|
| B1 | 官方 Dem 创建配置集后：`DemConfigSet` 与 `DemGeneral`（均 lower=1）自动实例化为两个顶层分支，全部 **67 个容器定义可在树中导航** |
| B2 | 表单渲染 162 个参数：六类控件（ENUM 下拉含 197 个字面量 / INTEGER 范围 / FLOAT / BOOLEAN / STRING / FUNCTION-NAME）全部由元数据驱动 |
| B3 | 4 个 CHOICE 容器在表单中提供候选选择（复用 TASK-009 的互斥机制，不新写） |
| B4 | 外部引用（`isExternal`）只读展示：显示目标路径或「外部引用」占位 + tooltip 说明，**不得**出现在可选目标列表里 |
| B5 | 树性能：67 容器全展开渲染不卡顿（el-tree 懒渲染默认支持，验证即可）；配置集保存/加载含完整实例状态 |

### C. 右键添加容器体验（C1–C4）

| 编号 | 交付内容 |
|---|---|
| C1 | 「选择允许的子定义」弹窗改为**列表形态**：每行 = 名称 + 截断描述 + 约束徽标（`mult 0..65535`）+ 当前已实例数/上限（如 `3 / ∞`） |
| C2 | 弹窗顶部**搜索框**（按名称/描述过滤，输入即筛） |
| C3 | **必选未满足的候选置顶并标红**（lower>0 且当前实例数 < lower）；禁用原因 inline 显示，不再只靠 title |
| C4 | 无新增依赖；键盘可达（搜索框自动聚焦，Enter 选中第一个可用项） |

---

## 3. 验收标准

### A 组（4 条）

1. `npm run build` 通过。
2. `npm test -- --run` 全绿，用例数 **≥ 252**；旧语义 id 字符串在 `tests/` 中清零（`grep -r "ecuc-dem-" tests/ --include=*.ts` 仅允许出现在 helper 的映射注释里）。
3. `ecuc.test.ts` 零删改（它测的是 NvM/CanIf，与本次无关）。
4. 语义核查表完整（A3）。

### B 组（4 条）

5. 界面创建 Dem 官方配置集：树中可达容器数 = 67（写测试断言 `collectContainers` 结果）。
6. 参数总数 162、引用总数 64 全部可在界面呈现（CHOICE 内候选参数计入其定义，实例化后才出现）。
7. 外部引用只读展示，不可选入目标列表。
8. 保存 → 刷新 → 恢复完整。

### C 组（3 条）

9. 右键添加弹窗具备搜索、约束徽标、已实例计数、必选置顶四项。
10. 无新增运行时依赖。
11. 主包体积增幅 ≤ 30 KB（本次不应有大依赖）。

### 工程（3 条）

12. `src/core` 零 `Dem`/`NvM`/`CanIf` 字面量、零 UI 依赖。
13. 既有核心能力不退化：导入导出、XXE 防线、撤销重做、批量修改、悬空引用、全局搜索、主题（抽测即可）。
14. 未修改 `STATE.json` 的 `stage`、`review/**`、本契约。

---

## 4. 红线

1. **不得**回退 `bswmd/dem_bswmd.json` 到手写版；官方生成版是唯一事实来源（重跑生成脚本可再生）。
2. **不得**删除或跳过既有测试来变绿；断言调整必须等价或更强并逐条说明（A3）。
3. **不得**在 `src/core` 出现任何模块名或对旧语义 id 的兼容硬编码。
4. **不得**为 67 容器写任何 Dem 专用 UI 分支；一切由元数据驱动。
5. **不得**声称完成真实浏览器验收除非实际执行。
6. **不得**修改 `STATE.json` 的 `stage`、`review/**`、本契约。

---

## 5. 分批交付

round 0 必须完成 **A 组全部 + B1–B3**（测试全绿 + 界面能配置）；
B4–B5 与 C 组可留 round 1。若分批，报告开头写明覆盖范围，未做项不得报告为已做。

---

## 6. 报告要求

| 章节 | 内容 |
|---|---|
| 交付对照 | A1–C4 逐项「文件 + 实现要点」 |
| 替换映射 | 200 处的替换统计：byShort 多少、byPath 多少、无法自动映射需人工的多少（列清单） |
| 数量重算 | DemDTC 5 参数、DemDTCAttributes 6+8 等涉及的断言重算清单 |
| 界面承载 | 树/表单/CHOICE/外部引用的实现要点与截图路径（若有） |
| 右键优化 | C1–C4 各自的实现方式 |
| 不退化 | 核心能力抽测结果 |
| 既有用例变更 | 逐条说明（A3 核查表） |
| 未完成与限制 | 显式列出 |
| 自检日志 | build / test 原文关键行 |

---

## 7. 完成后动作

1. 提交代码与本报告（`feat: TASK-011 ...`）。
2. 单独提交 `STATE.json`：`status = "SUBMITTED"`、`submittedAt`、`submissionCommit`（完整 SHA）。
3. 不改 `stage`、不写 `review/**`、不发起下一任务。
