# TASK-013 评审意见（第 0 轮）— 不可覆盖快照

> 评审方：WorkBuddy ｜ 2026-11-06T09:43:57+08:00 ｜ 判定：**APPROVED**
> 本文件为 round 0 冻结快照，后续轮次不得修改；新轮次另建 `TASK-013-ROUND-<n>-REVIEW.md`。

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-013 / round 0（S2 测试基线重建） |
| reviewedCommit | `a15331500b46882c7591d17768d09b0ff4fc010e`（实现主体 `4579440`，a153315 为其证据附加；均为 HEAD 祖先） |
| 契约 | ACTIVE，哈希 `12046dc7f1450a49ff620bd2c4404e98f196523da08a8af141a98faca526483b`（未变，核实一致） |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 3 建议 |
| 验收 | 契约 A1–A6 / 验收 1–5 全达成 |

---

## 一、独立复核证据（全部本机重跑/实读）

### 1. 全绿与零退化

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 12.97s 通过 |
| **独立测试二跑（默认 reporter）** | **16 文件 / 265/265 passed / 0 fail / 0 skip** —— 达契约验收 2（0 fail、pass ≥264） |
| recovery 测试 | 15/15 保持全绿（红线 4 ✓） |
| 失败闭合 | 语义核查表 70 项逐条「修法归类 + 保留标准 + 结果」，抽查与 diff 一致 |
| 删除/新增用例 | diff 删 `it(` 2 处、增 2 处 —— **两个官方用例重命名，零缺失** |

### 2. 首跑 JSON 少收集 43 项的归因（评审方环境问题，非产品缺陷）

首跑 `--reporter=json` 仅收集 15 文件（缺 `core.test.ts` 43 项）；复跑默认 reporter 收满 16 文件全绿。与历轮宿主 `EPERM`（`node-brokered-fs-shim` 拦 vitest 临时写入）同源。Codex 环境一次收满 265（`evidence/task013/test-summary.json` 的 final=265/265/0/0 与我二跑一致）。**归因环境，不阻塞**；见 🟡-1 建议。

### 3. 断言完整性（重点核查「无 mock 产品算法 / 无削断言」）

| 检查 | 结果 |
|---|---|
| `vi.mock` 新增点 | **仅两类**：`dem_bswmd.json?raw`（定义资产 → 合成 fixture，正是契约允许的「只替换行为测试的定义输入」）与既有 localforage 注入（存量模式）——**无 store/core 算法 mock** |
| `legacy()` 调用 | **全仓清零**；`definitionIndex.ts` 留警示注释「旧 legacy-map 含非等价映射，禁止用于测试适配」；legacy-map.json 无代码引用（🟡-2 建议删档） |
| 合成/官方分轨 | `tests/fixtures/synthetic-dem.json` 版本 `TEST-SYNTHETIC-1`（7 容器/31 参数，**含 STRING 参数 `FixtureText`**——J1939 字符串与转义用例的合法载体）；fixtures/README.md 明示「不是任何 AUTOSAR 发布版本，不能导入产品目录」 |
| 官方语义重算 | `arxml-fidelity` 两用例按真实必填与「初始化 50 参数 + DTC 5」重算，逐条断言实际必填；`ecuc.test` CHOICE 可导出但未选仍拒绝 |
| 空库导入用例（#21） | 明确构造空目标库，**S1 未读库写保护未放宽**（审计表注明） |
| 既有 localforage mock | 存量模式，本次未新增产品 mock |

### 4. 交付项核对

| 项 | 结果 |
|---|---|
| A5（🟡-2/3 修复） | store diff 仅 7 行：导出包加 `readme` 三段语义说明；sidecar 失败提示追加「请先导出原始数据，再关闭页面」——精确对应评审要求 |
| A4（真实缺陷记录） | 报告如实记录三项并给 S3 归属：①BswmdParser 丢部分 `definitionPath`/来源元数据（标准层级可重建，非默认包路径不保证）②校验/输出语义分裂（L08）③namespace 仍 r4.2.2 —— **不冒充完成，合格** |
| `src/core` | 零改动（diff --numstat 空）✓ |
| evidence | build.log + test-summary.json（baseline 195/70 → final 265/265/0/0，含 70 项原始失败清单） |

## 二、建议项（🟡，不阻塞）

1. **🟡-1 宿主收集退化无守卫**：JSON reporter 在宿主 EPERM 下会静默少收文件（本次 265→222），评审/交付若只看 JSON 汇总可能误判。建议 S3 顺手加一条廉价守卫：测试内断言「收集文件数 === 磁盘 .test.ts 数」或交付口径固定用默认 reporter 原文。
2. **🟡-2 legacy-map.json 留盘**：已无代码引用且带警示，但仍在 `tests/helpers/`；建议 S3 删除或移 `docs/` 归档，杜绝再被引用。
3. **🟡-3 definitionIndex.ts 定位函数与合成 fixture 的耦合**已消（改按 shortName/路径），建议 S3 给 `02-TECH-DESIGN` §5 补两行「fixture 双轨选型规则」，固化本次经验。

## 三、裁定

- **TASK-013 round 0 = APPROVED**（绑定 `a15331500b46882c7591d17768d09b0ff4fc010e`）。
- 🟡-2 随 S3 清理；🟡-1/3 入 S3 契约附带项。
- S3 按范围拆两份契约：**TASK-014（S3a）= 输出同源闸门 + C 生成保真 + BswmdParser 元数据保留**（本轮下发 READY）；**TASK-015（S3b）= namespace r4.0 + 引用候选/DEST/isExternal + 往返保真顺序稳定**（S3a 批准后下发）。
- 报告记录的三个 S3 真实缺陷作为 TASK-014 的直接输入，不重复审计。
