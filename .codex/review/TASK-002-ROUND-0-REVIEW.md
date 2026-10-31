# TASK-002 评审意见（第 0 轮）— 不可覆盖快照

> 本文件为 round 0 的**冻结快照**，后续轮次不得修改本文件，只新增新的 ROUND 文件。

## 评审元信息

| 项 | 值 |
|---|---|
| reviewer | WorkBuddy（架构师，评审身份独立） |
| taskId | TASK-002 |
| round | 0 |
| reviewedCommit | `7c3a3a7f2cbcec6c84f89f2d6078e31ac093f7d5` |
| 评审时 HEAD | `5212a47b953848c700533c5240e52d5e06da541d`（仅多一个分工文档提交） |
| 评审时间 | 2026-10-31T23:25:00+08:00 |
| 契约 | `.codex/tasks/ACTIVE.md` |
| 报告 | `.codex/reports/TASK-002-REPORT.md` |

## 结论

**判定：`CHANGES_REQUESTED`**

| 项 | 数量 |
|---|---|
| 🔴 阻塞项 | 1 |
| 🟠 重要项 | 2 |
| 🟡 建议项 | 3 |
| 契约文件完成度 | 14 / 14 |
| 功能验收通过 | 7 / 8（1 项为契约文案歧义，归责评审方） |
| 工程验收通过 | 5 / 5 |

整体质量高于预期：核心引擎与 UI 完全解耦、规则引擎异常隔离正确、C 生成经 GCC `-Werror -pedantic` 实证、测试 35 项真实通过。阻塞项仅 1 条且修复量极小，问题源于契约措辞而非工程能力。

---

## 一、阻塞项 🔴

### 🔴-1 `lower = 0` 的可选容器被强制实例化，违反 AUTOSAR multiplicity 语义

| 项 | 内容 |
|---|---|
| 位置 | `src/core/config/ConfigInstance.ts:38-53`，关键行 `length: definition.multiplicity.upper === 0 ? 0 : Math.max(1, definition.multiplicity.lower)` |
| 问题 | `Math.max(1, lower)` 使 `lower = 0` 的容器仍创建 1 个实例。而 `bswmd/dem_bswmd.json` 中 DemDTC、DemDTCAttributes、DemEventParameter、DemDebounceCounterBasedClass、DemDebounceTimeBasedClass、DemOperationCycle **全部为 `lower: 0, upper: unbounded`**。 |
| 影响 | ① 违反 AUTOSAR ECUC multiplicity 语义（`0..n` 表示可不出现）；② 用户打开工具即被塞入 1 条 DTC，且经 grep 确认 `src/` 内**无任何容器新增/删除 API**（`addContainer`/`removeContainer`/`duplicateContainer` 均无匹配），因此**无法配置第二条 DTC、无法删除预置实例**，DEM DTC 配置器在最核心场景（多条 DTC）上不可用；③ 预置实例带着默认值参与校验，产生与用户操作无关的初始 violate 噪声。 |
| 修复要求 | ① 改为按 `lower` 精确取值，`lower = 0` 时不创建实例；② 在 `ConfigInstance` 暴露 `addContainerInstance(instance, parentContainerUuid, definitionUuid)` 与 `removeContainerInstance(instance, containerUuid)` 两个方法（本轮只做 API，UI 按钮留给 TASK-003 亦可，但 API 必须在 core 层可用）；③ 补 1 条测试：`lower=0` 的模块建实例后子容器数为 0，调用 add 后为 1，remove 后回到 0。 |
| 归责 | 契约"递归建出全部容器"措辞含糊，是 Codex 采用 `Math.max(1, lower)` 的直接诱因。**评审方认领该措辞责任**，故本条只要求修正语义与补 API，不追究实现理解。 |

---

## 二、重要项 🟠

### 🟠-1 契约"7 个子容器"文案歧义 —— 由评审方修正，不计入 Codex 缺陷

| 项 | 内容 |
|---|---|
| 位置 | `.codex/tasks/ACTIVE.md` 验收第 1 条 |
| 事实核查 | `node` 实测 `bswmd/dem_bswmd.json`：根容器 1 个（DemConfigSet），直接子容器 6 个（DemDTC / DemDTCAttributes / DemEventParameter / DemDebounceCounterBasedClass / DemDebounceTimeBasedClass / DemOperationCycle），**容器定义总数 7**。契约原文写"含 7 个子容器"，与"7 种容器含根"自相矛盾。 |
| 口径裁定 | **7 = 1 根 + 6 直接子容器。** Codex 保留 7 种定义、不擅自增加第八种的处理正确。本条**不构成 Codex 缺陷**。 |
| 要求 | 下轮契约必须改写为"共 7 个容器定义（1 个根 + 6 个直接子容器）"，并在下一版 `ACTIVE.md` 生效；本轮评审记录即口径依据。 |

### 🟠-2 定义约束把「空字符串」等同于「未配置」，且缺失/非法共用同一句错误信息

| 项 | 内容 |
|---|---|
| 位置 | `src/core/constraint/DefinitionConstraints.ts:29-33、45-50` |
| 问题 | `value === undefined \|\| value === null \|\| value === ''` 一律视为未配置，`STRING` 类型参数永远无法表达空串；同时"必填缺失"与"类型/范围/枚举非法"都走 `add(...)`，`STRING` 越界场景下报的是 `has an invalid type, range, or choice`，而必填场景报 `is required`，两类问题对用户的修复动作完全不同却共用一条 `suggestion: 'Use a value allowed by the module definition'`。 |
| 影响 | 用户看到"必填缺失"提示时不知道该填什么；看到"类型非法"时也拿不到具体允许值（如 ENUM 的合法枚举未列出）。诊断信息质量直接影响配置效率——这是配置器类工具的核心体验。 |
| 修复要求 | ① 仅 `undefined`/`null` 视为未配置，`''` 交由类型规则判定；② 三条独立消息：缺失（列出必填）、非法类型（写明期望类型）、越界/枚举非法（**列出允许范围或全部枚举字面量**）；③ 补测试覆盖 ENUM 非法值的提示文案含候选值。 |

---

## 三、建议项 🟡

| # | 位置 | 建议 |
|---|---|---|
| 🟡-1 | `src/core/constraint/DemConstraints.ts:5` | `if (ctx.bswmdModule.shortName !== 'Dem') return []` 以模块名字符串硬守门，模块更名或大小写差异即静默失效。建议规则携带 `moduleName` 元数据由引擎统一过滤，或归一化比较。 |
| 🟡-2 | 构建产物 | 主包 1.18 MB（gzip 380 KB），Element Plus 全量引入。建议按需引入或 `build.rollupOptions.output.manualChunks` 拆 vendor。非阻塞。 |
| 🟡-3 | `src/core/generator/CGenerator.ts:132-156` | 宏名采用 `P{idx}_` / `R{idx}_` / `C{idx}_` 前缀去重，可读性下降（`DEM_C0_DEMDTC_P0_DEMDTCVALUE`）。建议保留序号后缀而非前缀，形如 `DEM_DTC_0_DTCVALUE`，更贴近供应商代码习惯。非阻塞，可在 TASK-004 生成器细化时一并处理。 |

---

## 四、独立核查命令与结果

全部由 reviewer 在本机独立执行，不采信报告中的自述数据。

| # | 命令 | 期望 | 实测结果 |
|---|---|---|---|
| 1 | `git show --stat 7c3a3a7` | 范围符合契约 | ✅ 40 文件，含 14 个契约文件 + 2 个新增 core 文件 + 测试 + 依赖锁定 |
| 2 | `grep -rn "from 'vue'\|pinia\|element-plus" src/core/` | 无匹配 | ✅ 无匹配（架构铁律成立） |
| 3 | `grep -rn ":\s*any\b\|@ts-ignore\|@ts-expect-error" src/ tests/` | 无匹配 | ✅ 无匹配 |
| 4 | `grep -rn "Dem[A-Z]\|demDtc\|DemDTC" src/ui/` | 无匹配 | ✅ UI 层零 DEM 硬编码（模块可插拔成立） |
| 5 | `node -e` 统计 `dem_bswmd.json` 容器 | 1 根 + 6 子 = 7 | ✅ 实测 根 1 / 子 6 / 总 7，子容器名单与契约列举一致 |
| 6 | `npm run build` | 通过 | ✅ `vue-tsc --noEmit` + Vite 构建成功，14.34s；有主包 >500 kB 提示（非阻塞） |
| 7 | `npm test -- --run` | 全绿 | ✅ 2 文件 35 测试全通过，7.86s；GCC 编译用例实际执行（非跳过） |
| 8 | `grep -n "gcc" tests/core.test.ts` | 有条件跳过 | ✅ `it.skipIf(!compilerAvailable)`，无 gcc 环境不会误报 |
| 9 | `grep -rn "addContainer\|removeContainer\|duplicateContainer" src/` | 用于定位缺口 | ⚠️ 无匹配 → 支撑 🔴-1 |
| 10 | `node -e` 读 `package.json` | handlebars 在 dependencies | ✅ `^4.7.10` 位于 dependencies |

### 关键代码抽检

| 文件 | 抽检结论 |
|---|---|
| `DemConstraints.ts`（188 行） | DEM-001/002/003/006/008 五条规则齐备；DEM-002 用 `integerInRange(v,1,0xffffff)` 正确排除 0x000000；DEM-008 比契约更严格（要求 target 必须指向已存在的 DemOperationCycle），**优于契约，予以肯定** |
| `BswmdParser.ts`（212 行） | 深度上限 128 且错误携带完整路径；输入从 `unknown` 逐层校验，无类型断言穿透；定义 UUID 去重 |
| `DefinitionConstraints.ts`（72 行） | 从定义树驱动类型/范围/枚举/必填/引用目标类型校验，完全模块无关，是本轮最有价值的架构产出 |
| `ConfigInstance.ts`（213 行） | 仅 `createContainers` 一处 multiplicity 语义错误（🔴-1），其余递归/查找/赋值正确 |
| `DynamicForm.vue` | 引用字段渲染为 `el-select`，placeholder 用 `destinationContainerType`，按定义驱动，无硬编码 |

---

## 五、契约偏差核查表

### 功能验收（8 条）

| 条目 | 结果 | 证据 |
|---|---|---|
| 解析 `dem_bswmd.json` 得到 7 个子容器 | ⚠️ 口径修正为 7 个容器定义（1 根 + 6 子） | 命令 5 实测；契约文案有误，见 🟠-1，不计 Codex 缺陷 |
| 缺 `uuid` 容器抛错含名称/索引 | ✅ | 测试 `reports missing nested container uuid with its index and name` |
| `createFromBswmd` 递归建容器带默认值 | ✅（语义另有 🔴-1） | 测试 `recursively creates instances, preserves definitions...` |
| 规则异常时其余规则仍执行 | ✅ | 测试 `isolates rule exceptions, supports replacement and unregistration` |
| 两个 DTC 同值报 DEM-001 | ✅ | 测试 `reports duplicate DTC values across separate config sets`，跨 ConfigSet 亦覆盖 |
| Aging 开启无 CycleRef 报 DEM-008 | ✅ | 测试 `requires an existing operation cycle only when aging is enabled` |
| 生成的 `.h` 可编译、宏名合法 | ✅ | 测试 `compiles generated DEM and unusual-name C files using gcc -Werror` 实跑 GCC |
| DynamicForm 按类型渲染控件 | ✅ | 测试 `renders enum, boolean, numeric and string controls...` |

### 工程验收（5 条）

| 条目 | 结果 | 证据 |
|---|---|---|
| `npm run build` 通过 | ✅ | 命令 6 |
| core 无 Vue/Pinia/Element | ✅ | 命令 2 |
| 无 `any` | ✅ | 命令 3 |
| 导出函数有 JSDoc | ✅（采信报告 AST 审计 41 项，抽检 5 个文件均有） | 抽检 `ConfigInstance.ts`、`DemConstraints.ts`、`DefinitionConstraints.ts`、`CGenerator.ts`、`TemplateEngine.ts` 均含 JSDoc |
| 无类型忽略指令 | ✅ | 命令 3 |

### 交付物

| 条目 | 结果 |
|---|---|
| 报告按模板填写 | ✅ 含自检命令输出、待确认、关键实现说明 |
| `STATE.json` 为 `SUBMITTED`、round 0、stage 未变 | ✅ 已核对 |

---

## 六、范围合规

| 契约"明确不做" | 实际 |
|---|---|
| ARXML 导入导出 | 未做 ✅ |
| Vue Flow 引用图 | 未做 ✅ |
| Python 约束运行时 | 未做 ✅ |
| 新增 DEM 以外模块 | 未做 ✅（`src/modules/` 仍只有 dem） |
| 接后端 / 改路由 | 未做 ✅（`src/router/index.ts` 未在提交中） |

额外新增的 `ConfigTraversal.ts`、`DefinitionConstraints.ts` 属引擎内聚的合理拆分，未越界。

---

## 七、下一轮要求（round 1）

1. **只修 🔴-1 与 🟠-2**；🟠-1 由评审方在下一版契约中改写，Codex 无需动作；🟡 三项本轮不做。
2. 🔴-1 修完必须在 core 层提供容器实例增删 API，并补 3 条断言测试（建/加/删）。
3. 在 `.codex/reports/TASK-002-REPORT.md` **追加**「## 第 1 轮修复」对照表，逐条对应 🔴-1 / 🟠-2。
4. `STATE.json`：`task.status` 改回 `SUBMITTED`，`task.round` 由 0 改为 1，`reportPath` 不变。
5. 推送后停止，等待 round 1 评审。不要顺手改动 review 目录、stage、契约文件或调度脚本。

---

**评审方签署**：WorkBuddy（架构师）｜ 2026-10-31T23:25:00+08:00
