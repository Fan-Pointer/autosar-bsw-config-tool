# ACTIVE TASK — TASK-009

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**（含标题、编号、验收项）。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-009** |
| 任务名 | NvM CHOICE 全链路收口 + 必填项一键确认建议值 |
| 阶段 | PHASE-9 |
| 指派 | codex |
| 前置 | TASK-008 APPROVED（commit `4ef677d`），A1–A5 + C1–C5 达成，B1–B4 按 §5 留至今轮 |
| 为什么现在做 | NvM 现在**能读、能改、不能导出**，第二模块闸门只过一半 |

---

## 0. 本轮目标（一句话）

让 NvM 也能完整导出并往返：CHOICE 容器按「选中一个候选」表达，`arxmlExportBlockers` 清空；
同时给必填项一个「一键确认建议值」的入口，别让用户手填 37 个字段。

---

## 1. 现状（我实测，非推测）

| 项 | 实测值 |
|---|---|
| NvM 解析 | 3 根 / 6 容器 / 51 参数 / 9 引用 |
| `arxmlExportBlockers` | **1 条** |
| 导出结果 | **被拒绝**：`该模块暂不能导出 ARXML：NvMTargetBlockReference：CHOICE 暂按编辑分组保留全部候选，互斥及 ARXML 选择容器语义尚未支持。` |
| CHOICE 定义形式 | `<ECUC-CHOICE-CONTAINER-DEF>` 内含 `<CHOICES>`，候选是**内联的** `ECUC-PARAM-CONF-CONTAINER-DEF`（不是引用）；`lower=1, upper=1`，即**必须选且只能选一个** |

---

## 2. 交付清单（A/B/C 三组，共 13 项）

### A. CHOICE 元数据与编辑（A1–A4）

| 编号 | 交付内容 | 文件建议 |
|---|---|---|
| A1 | 解析 `ECUC-CHOICE-CONTAINER-DEF` 的 `CHOICES`，得到候选列表（候选是内联容器定义，需保留其 `shortName`、`definitionPath`、multiplicity、参数/引用） | `src/core/bswmd/EcucArxmlImporter.ts`、`BswmdTypes.ts` |
| A2 | `BswmdContainer` 增加可选字段表达「本容器是 CHOICE 分组 + 候选清单」；**不得**用 `arxmlExportBlockers` 兜底 | 同上 |
| A3 | 编辑模型：CHOICE 分组下**同一时刻至多一个候选**被实例化。当前是「保留全部候选」，需改为互斥 | `ConfigInstance.ts` / `configStore` |
| A4 | 切换候选时明确提示「原候选的配置将丢失」，并作为**一条**可撤销历史记录 | UI |

### B. CHOICE 导出与往返（B1–B4）

| 编号 | 交付内容 |
|---|---|
| B1 | 导出按 AUTOSAR r4.2.2 值文件约定表达选择（只写被选中的候选实例，`DEFINITION-REF` 指向该候选路径） |
| B2 | 移除 NvM 的 `arxmlExportBlockers`；保留该机制本身（未来其他模块仍可用） |
| B3 | 导入时按 `DEFINITION-REF` 恢复「选中的是哪个候选」 |
| B4 | NvM 往返：容器结构、**选中候选**、参数值、引用目标、`isConfigured` 全部一致 |

### C. 必填项 UX 与不退化（C1–C5）

| 编号 | 交付内容 |
|---|---|
| C1 | 「一键确认建议值」：把所有**带 `DEFAULT-VALUE` 的必填项**按建议值显式写入（`isConfigured = true`） |
| C2 | 该操作作为**一条**历史记录，`Ctrl+Z` 一次全部还原 |
| C3 | 没有 `DEFAULT-VALUE` 的必填项**不处理**，并在结果中提示还剩几项需手工填 |
| C4 | Dem / CanIf 全链路不退化（配置、校验、C 生成、JSON/ARXML/CSV、撤销/批量/搜索/主题） |
| C5 | `src/core` 仍零 `Dem`/`NvM`/`CanIf` 字面量、零 UI 依赖、无新增运行时依赖 |

---

## 3. 验收标准

### CHOICE（6 条）

1. **候选解析**：`NvMTargetBlockReference` 被识别为 CHOICE，候选数 **≥ 2**，每个候选带 `shortName` 与定义路径。
2. **互斥**：选中候选 A 后，候选 B 不可同时被实例化；尝试添加 B 时被拒绝或有明确交互。
3. **切换提示**：从 A 切到 B 时给出「将丢失 A 的配置」提示；确认后 A 的实例消失、B 出现。
4. **可撤销**：切换后 `Ctrl+Z` 能恢复 A。
5. **导出成功**：NvM `arxmlExportBlockers` 为空，导出不抛错；DOMParser 无错、命名空间 r4.2.2、UUID 唯一、`DEFINITION-REF` 全以 `/AUTOSAR/EcucDefs/NvM` 开头。
6. **往返**：NvM `export → import` 后，选中候选、容器结构、参数值、`isConfigured` 集合全部一致。

### 必填 UX（3 条）

7. NvM 新建配置集（37 个必填）点「一键确认建议值」后，有 `DEFAULT-VALUE` 的项全部变为已配置，剩余项数量在提示中给出。
8. 该操作产生**一条**历史记录；一次 `Ctrl+Z` 全部还原到操作前。
9. 无 `DEFAULT-VALUE` 的必填项不被赋任意值（不得填 0/空串充数）。

### 不退化（4 条）

10. `npm run build` 通过。
11. `npm test -- --run` 全绿，用例数 **≥ 205**；既有用例调整须逐行说明理由（同 TASK-008 C3 标准）。
12. Dem 与 CanIf：导出语义（未配置不导出、必填拦截）、`isConfigured` 往返、结构合规、XXE 防线全部保持。
13. `src/core` 零模块名、零 UI 依赖、无新增依赖。

---

## 4. 红线

1. **不得**为 NvM 写专用分支或 `NvM` 字面量；CHOICE 必须是通用元数据能力（未来 CanIf/Dcm 有 CHOICE 同样适用）。
2. **不得**把 `arxmlExportBlockers` 改成「警告但照常导出」；要么正确导出，要么明确拒绝。
3. **不得**用「填 0 / 空串」充数来满足 C1；只处理带 `DEFAULT-VALUE` 的项。
4. **不得**删改既有测试用例变绿；调整须等价或更强并逐行说明。
5. **不得**声称完成真实浏览器验收除非实际执行。
6. **不得**修改 `STATE.json` 的 `stage`、`review/**`、本契约。

---

## 5. 分批交付

本轮允许两轮：**round 0 必须完成 A1–A4 + B1–B2 + C1–C3**（能选、能导、能一键确认）；
B3–B4（导入恢复候选 + 完整往返）可留 round 1。若分批，报告开头写明覆盖范围，未做项不得报告为已做。

---

## 6. 报告要求

| 章节 | 内容 |
|---|---|
| 交付对照 | A1–C5 逐项「文件 + 实现要点」 |
| CHOICE 值文件表达 | 选中的候选在 ARXML 里具体怎么写的（贴真实片段），依据哪条规范 |
| NvM 前后对比 | 修前 `blockers=1/导出被拒` → 修后实体数据（候选数、导出长度、往返结果） |
| 一键确认 | 覆盖了多少必填项、剩余多少、如何保证可一次撤销 |
| 不退化证据 | Dem / CanIf 各自自检结果 |
| 既有用例变更 | 若有，逐行 diff 与理由 |
| 未完成与限制 | 显式列出 |
| 自检日志 | build / test 原文关键行 |

---

## 7. 完成后动作

1. 提交代码与本报告（`feat: TASK-009 ...`）。
2. 单独提交 `STATE.json`：`status = "SUBMITTED"`、`submittedAt`、`submissionCommit`（完整 SHA）。
3. 不改 `stage`、不写 `review/**`、不发起下一任务。
