# ACTIVE TASK — TASK-008

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**（含标题、编号、验收项）。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-008** |
| 任务名 | 导出保真修复（语义正确）+ NvM CHOICE 全链路收口 |
| 阶段 | PHASE-8 |
| 指派 | codex |
| 前置 | TASK-007 APPROVED（commit `f72bcf5`），round 0 分批范围达成，C5 留待本轮 |
| 优先级说明 | **先修导出语义，再做 CHOICE**。地基不对，上层白做 |

---

## 0. 本轮目标（一句话）

让导出的 ARXML 忠实表达「用户到底配了什么」——未配置的参数不出现、配置过的原样还原、描述不丢、时间戳不漂；
在此地基上补完 NvM 的 CHOICE 容器语义，让 NvM 也能完整导出与往返。

---

## 1. 本轮必须先解决的问题（P0）

评审实测（`TASK-007-ROUND-0-REVIEW.md` 🟠-1）：

| 模块 | 内存参数总数 | 用户实际配置 | 导出 `<VALUE>` 数 | 再导入后 `isConfigured` |
|---|---|---|---|---|
| Dem | 31 | **1** | **31** | 31 个全变 `true` |
| CanIf | 45 | **0** | **45** | 45 个全变 `true` |

示例（真实导出片段）：

```xml
<ECUC-NUMERICAL-PARAM-VALUE UUID="…">
  <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR/EcucDefs/CanIf/…/CanIfCtrlId</DEFINITION-REF>
  <VALUE>0</VALUE>
</ECUC-NUMERICAL-PARAM-VALUE>
```

用户从未配置过 `CanIfCtrlId`，导出却声称「我要它等于 0」。在 AUTOSAR 里
**"未配置"与"配成 0"是两种不同语义**，写错会让下游工具把默认值当成显式配置、覆盖模块默认行为。
这是语义错误，不是格式瑕疵。

---

## 2. 交付清单（A/B/C 三组，共 14 项）

### A. 导出语义保真（A1–A5）— P0

| 编号 | 交付内容 | 文件建议 |
|---|---|---|
| A1 | 导出**仅**产出 `isConfigured === true` 的参数与引用；`isConfigured === false` 的一律不生成 `ECUC-*-PARAM-VALUE` / `ECUC-REFERENCE-VALUE` 元素 | `src/core/io/Arxml.ts` |
| A2 | 未配置但**必填**（`isOptional === false`）的参数：导出前由校验拦截并报错，**不得**用默认值填充后写出 | 同上 |
| A3 | 可选且未启用（`isOptional && value === undefined`）的参数与引用：静默省略 | 同上 |
| A4 | `description` 往返不丢：导入时若 ARXML 无 `DESC`，从 BSWMD 定义（`definition.description`）回填容器/参数描述 | `src/core/io/Arxml.ts` |
| A5 | 时间戳稳定：`export → import` 后 `createdAt` / `lastModified` 与原配置完全一致（导入保留文件内时间戳，不在水合时重赋） | 同上 |

### B. NvM CHOICE 容器收口（B1–B4）— P1

| 编号 | 交付内容 |
|---|---|
| B1 | 解析 `ECUC-CHOICE-CONTAINER-DEF` 的 `CHOICES`，得到候选容器列表；`BswmdContainer` 增加可选字段表达"本容器是 CHOICE 分组，候选为 X/Y/Z" |
| B2 | 编辑模型：CHOICE 分组下**同一时刻至多一个候选**可选（当前是"保留全部候选"，需改为互斥语义）；切换候选时给出明确提示（原候选的配置将丢失） |
| B3 | 导出：按 AUTOSAR 值文件约定表达 CHOICE 选择（只写被选中的候选实例）；**移除 NvM 的 `arxmlExportBlockers`** |
| B4 | 往返：NvM `export → import` 后，容器结构、被选中的候选、参数值、`isConfigured` 集合全部一致 |

### C. 不退化保障（C1–C5）

| 编号 | 交付内容 |
|---|---|
| C1 | **Dem 全部既有能力不退化**：配置、校验、C 生成、JSON/ARXML/CSV 导入导出、撤销/批量/搜索/主题 |
| C2 | **CanIf 不退化**：解析、导入、编辑、导出 |
| C3 | 既有 ARXML 相关用例（`io.test.ts`、`ecuc.test.ts`）若因 A1–A5 语义变更需要调整，**必须逐行说明理由**，且调整后覆盖面不得减少（例如原来断言"31 个 VALUE"，改为"1 个 VALUE + 30 个省略"，并新增 `isConfigured` 集合断言） |
| C4 | `src/core` 仍零 `Dem`/`NvM`/`CanIf` 字面量；零 UI 依赖 |
| C5 | 无新增运行时依赖 |

---

## 3. 验收标准

### 导出语义（6 条）

1. **未配置不导出**：CanIf 新建配置集（45 参数全未配置）直接导出 → `ECUC-*-PARAM-VALUE` 元素数为 **0**（必填项报错则应先被校验拦住；若 CanIf 根容器存在必填未配，导出应抛错并说明是哪几项）。
2. **部分配置**：Dem 配置 1 个参数导出 → 恰好 **1 个** `VALUE`，且其 `DEFINITION-REF` 指向该参数。
3. **`isConfigured` 往返一致**：`export → import` 后，全部参数与引用的 `isConfigured` 集合与原配置**完全相同**（逐项比对，非"值相等"）。
4. **全未配置往返**：全未配置的模块 → 导出 → 导入 → 仍全未配置。
5. **描述不丢**：往返后容器与参数的 `description` 与原配置一致（来自 BSWMD 回填）。
6. **时间戳不漂**：往返后 `createdAt`/`lastModified` 与原值相等。

### NvM CHOICE（4 条）

7. `NvMTargetBlockReference` 被解析为 CHOICE 分组，候选列表非空。
8. 选择候选 A 后，不能再同时配候选 B（互斥生效）；切换候选有提示。
9. NvM **可导出**：`arxmlExportBlockers` 为空，导出文件 DOMParser 无错、命名空间 r4.2.2、UUID 唯一、`DEFINITION-REF` 全以 `/AUTOSAR/EcucDefs/NvM` 开头。
10. NvM `export → import` 往返：容器结构、选中候选、参数值、`isConfigured` 全部一致。

### 工程（4 条）

11. `npm run build` 通过。
12. `npm test -- --run` 全绿，用例数 **≥ 205**；既有用例调整须逐行说明（C3）。
13. `src/core` 零模块名、零 UI 依赖（C4）。
14. 无新增运行时依赖（C5）。

---

## 4. 红线

1. **不得**用"给未配置参数填默认值再导出"的方式绕过 A1；那正是要修的缺陷。
2. **不得**为了 NvM 导出而在 `src/core` 写 `NvM` 字面量或专用分支。
3. **不得**删改既有测试用例变绿；调整必须等价或更强（C3）。
4. **不得**把 `arxmlExportBlockers` 改成"警告但照常导出"——要么能正确导出，要么明确拒绝，不能产出半对的文件。
5. **不得**声称完成真实浏览器验收除非实际执行。
6. **不得**修改 `STATE.json` 的 `stage`、`review/**`、本契约。

---

## 5. 分批交付

本轮允许两轮，但 **round 0 必须完成 A1–A5 + C1–C5**（导出语义保真是地基）；
B1–B4（CHOICE）可留至 round 1。若分批，报告开头写明覆盖范围，**未做项不得报告为已做**。

---

## 6. 报告要求

`.codex/reports/TASK-008-REPORT.md` 必须含：

| 章节 | 内容 |
|---|---|
| 交付对照 | A1–C5 逐项「文件 + 实现要点」 |
| 导出语义前后对比 | 修前/修后 Dem 与 CanIf 的 `VALUE` 元素数、`isConfigured` 往返结果 |
| CHOICE 语义方案 | 如何表达互斥、如何在 ARXML 中只写选中候选 |
| 不退化证据 | Dem / CanIf 各自的全链路自检结果 |
| 既有用例变更 | 若有，逐行 diff 与理由（C3） |
| 未完成与限制 | 显式列出 |
| 自检日志 | build / test 原文关键行 |

---

## 7. 完成后动作

1. 提交代码与本报告（提交信息 `feat: TASK-008 ...`）。
2. 单独提交 `STATE.json`：`task.status = "SUBMITTED"`、`submittedAt`、`submissionCommit`（**完整 SHA**）。
3. 不修改 `stage`、不写 `review/**`、不发起下一任务。
