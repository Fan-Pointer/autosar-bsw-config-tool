# TASK-011 阶段性交接 — 架构师部分完成，剩余清单与修法

> 背景：用户 2026-11-01 08:01 直接指令（Dem 官方定义全量界面 + 右键优化），因 Codex 执行权限
> 未恢复（esbuild spawn EPERM / git index.lock），由架构师（WorkBuddy）直接执行。
> 本文档是「已完成部分 + 剩余失败的精确修法」交接，Codex 权限恢复后按此继续。

---

## 一、已完成（全部已提交，基线见 git log）

| 项 | 内容 |
|---|---|
| 官方 Dem 定义切换 | `bswmd/dem_bswmd.json` 已替换为官方生成版：**67 容器 / 162 参数 / 64 引用**（旧手写版 7/31/9），带 `$source` 溯源 + 每元素 `definitionPath` + 6 处 `exportRole` 迁移 |
| 生成脚本 | `scripts/gen-bswmd-from-arxml.mjs <模块名>`：任意官方模块 → 内部 JSON，可重跑 |
| 导入器四类引用 | `ECUC-REFERENCE-DEF` / `CHOICE-REFERENCE-DEF`（`DESTINATION-REFS` 多候选）/ `FOREIGN` / `INSTANCE`（无静态目标 → `isExternal` 只读），新增 `destinationRefs/kind/isExternal` 字段 |
| 映射设施 | `scripts/map-legacy-dem-ids.mjs`（47/47 全匹配，含 9 条人工裁定）；`tests/helpers/definitionIndex.ts`（`legacy()/byPath()/byShort()`）；`tests/helpers/legacy-map.json` |
| 测试适配 | 180 处旧语义 id → `legacy()` 调用；core.test.ts 实例段**重写为合成迷你 Dem**（`synthDem()`/`synthFixture()`，与真实定义解耦）——**core 43/43 全绿** |
| **右键添加容器优化** | `ContainerActions.vue`：列表形态 + 搜索框（自动聚焦/Enter 快选）+ 约束徽标（mult x..y）+ 已实例数/上限 + 必选未满足置顶标红 + 禁用原因 inline |
| 需求矩阵 | `docs/FEATURE-MATRIX.md`：参考站功能全景 × 覆盖状态 × P0/P1/P2 差距（按 6 张截图 + i18n 词表） |

**界面现状（浏览器实测）**：官方 67 容器已可在树上导航，`DemConfigSet`/`DemGeneral` 两个顶级页签，CHOICE 候选选择可用，一键确认建议值可用。

## 二、测试现状

`npm test -- --run`：**179 通过 / 70 失败**（切换前 112 失败）。`npm run build` 通过。

## 三、剩余 70 个失败的分布与修法

### 1. `io-ui.test.ts`（16 失败）— 最大块，同根因

失败几乎全部源于其本地 fixture 构造的旧结构 JSON（7 容器/31 参数语义 id）。
**修法**：fixture 改用 `synthFixture()`（core.test.ts 已有，可抽到 `tests/helpers/`）或改用官方 `dem_bswmd.json` + `legacy()` 定位；涉及「DemDTC 31 参数」的数量断言按新定义重算（DemDTC 5 参数）。
注意：`reads an actual file...` 用例断言四列冲突内容，需按新参数名（`DemDtcValue` 等）改期望值。

### 2. `io.test.ts`（18 失败）— 与 io-ui 同根因

fixture() 用官方 JSON 但断言旧值。修法同上；其中 CSV 用例断言 `0x1A2B3C` 等值 —— fixture 若沿用「设 DemDtcValue=0x1a2b3c」则输出不变，仅需把定位换成 `legacy()`/`byShort()`。
**特别项**：`preserves literal CDATA...`、实体转义用例原依赖 STRING 参数 —— 官方定义无 STRING，改用 `legacy('ecuc-dem-dtc-j1939-node-ref')`（→ 官方 ENUM `DemDTCSeverity`，readValue 对 ENUM 不做值域校验，字符串行为一致）或合成定义。

### 3. `lifecycle.test.ts`（8 失败）— 同根因

fixture 引用旧容器索引（`subContainers[0]`=DemDTC 假设）。修法：按 shortName 定位；数量断言重算（新 DemDTCAttributes 有 6 参数 8 引用）。

### 4. `editor.test.ts`（7 失败）

- `batch edits` 两个：fixture 选中的实例集合变化（新 root 下 DemEventParameter 预建），批量交集为空 → fixture 显式选 DemDTC 实例（参照 core.test.ts 的处理）。
- `500 instances`：行数断言 500 → 实际 507（新定义多预建 7 个），重算。
- `import hardening` 4 个：REPORT 中「actual/expected UUID」「CDATA」等断言的构造载体用旧 id → `legacy()` 替换；其中 CDATA 用例的 STRING 载体同 §2 特别项。

### 5. `editor-ui.test.ts`（4 失败）

- `Ctrl/Shift selection` / `dangling references` / `searches across sets` / `twenty undo steps`：
  全部是 workspace 挂载后选中的容器与旧不同（DemComponent 在前）。修法：`store.selectContainer(<DemDTC 实例 uuid>)` 显式定位；二十步撤销断言的初值经 `exportJson` 对比，确认 fixture 一致后应自然通过。

### 6. `ui.test.ts`（8 失败）

- 树断言（容器数/顺序）按新定义重算；
- `opens a child-definition chooser` 已兼容新弹窗（按钮名 = shortName 保留），若失败检查 `upper multiplicity 1 reached` 文案是否仍出现在 disabledReason（已在）。

### 7. `arxml-editor.test.ts`（3 失败）/ `arxml-fidelity.test.ts`（2 失败）

- fidelity 的「31-field reproduction」用例：**31 参数的前提不存在了**（官方 DemDTC 5 参数）——按新定义重写为「5 参数/1 配置 → 1 VALUE」；其余 25 个已过。
- editor 3 个：fixture 载体同 §2/§3。

### 8. `ecuc.test.ts`（1 失败）

`retains choice alternatives and cross-module destinations`：断言 NvM 的 `arxmlExportBlockers` 数量或 warning 文本 —— CHOICE 容器数量在 NvM 未变，怀疑是 warnings 计数（CHOICE-REFERENCE 的新增 warning）。按实际输出重算。

### 9. `ecuc-ui.test.ts`（1 失败）

D3 引用空状态：候选目标容器在新 Dem 里路径变化（`DemMemoryDestinationRef` 候选 `DemPrimaryMemory/DemUserDefinedMemory` 现真实存在）→ 空状态场景需选一个**确实无实例候选**的引用（如 `DemExtendedDataClassRef`）。

### 10. `replica.test.ts`（2 失败）

右键菜单禁用数（5→4 在 TASK-005 已改）；本轮右键弹窗改造后如断言按钮文本，仍以 shortName 命中（兼容已保留）。按实际输出微调。

---

## 四、给接手者的三条护栏

1. **不要**把 `synthFixture` 从 core.test.ts 抽走后弃用 —— 它是「实例管理器行为单测与真实定义解耦」的正确形态；可把它上移到 `tests/helpers/` 供 io-ui 等复用。
2. **不要**为通过测试而回退 `bswmd/dem_bswmd.json` 或删除断言；数量断言一律按新定义**重算**并在报告列重算清单。
3. 修完一批跑 `npm test -- --run`；最终目标 **249+ 全绿**（允许 gcc skipIf 波动）。

## 五、与 Codex 的同步方式

- 全部成果已本地提交（`git log` 可见 `arch(dem)` / `plan(task-011)` 等提交），调度器恢复后快进同步。
- Codex 接手时：读本文档 → `npm test -- --run` 复核 70 失败清单 → 按文件顺序修复 → 报告按 TASK-011 契约 §6（加一节「架构师已完成部分」引用本文档，不重复实现）。
