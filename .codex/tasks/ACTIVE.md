# ACTIVE TASK — TASK-014

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。
> 设计依据：`docs/product-design/00-SCOPE-AND-FEATURES.md`（G03/G06）、`02-TECH-DESIGN.md` §1.2/§2（OutputGate）。
> 前置输入：TASK-013 报告记录的三个 S3 真实缺陷（definitionPath 丢失 / 校验输出分裂 / namespace 旧口径）——前两项本契约修复，第三项归 TASK-015。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-014** |
| 任务名 | S3a 输出同源闸门：isOutputReady 单一事实源 + C 生成保真 + BswmdParser 元数据保留 |
| 阶段 | PHASE-14（R3-S3a） |
| 指派 | codex（主对话实现） |
| 前置 | TASK-013 APPROVED（`a153315`，265/265 全绿基线） |
| 明确不含 | namespace/输入兼容（TASK-015）；引用候选与 DEST（TASK-015）；存储层（S1 已冻结语义不得回退） |

---

## 1. 交付清单

### A. 输出有效性闸门（G03 核心）

| 编号 | 交付内容 |
|---|---|
| A1 | 新增 `src/core/output/OutputGate.ts`：`isOutputReady(config, module)` 单一事实源。语义：`isConfigured=false` 的必填 → ERROR；CHOICE 未选 → ERROR；可选未配 → **不出现于输出**（不是错误也不是建议值）；`false/0` 已配置**不误报**；issue 携带 `severity/path/reason/anchor{containerUuid, definitionRef?}` |
| A2 | 消费方接线（同一结果对象，禁止各自另算）：①校验面板/WorkspaceView 验证结果 ②`exportArxml`（必填未配拒绝，逐项列清单——现行为保留但改为消费闸门）③`exportCsv` ④`CGenerator.generateHeader/Source` |
| A3 | **一致性断言**：同一配置下，校验面板显示的问题集合 ≡ 四类输出的拒绝原因集合（要么都可输出，要么报同一批问题）；「验证通过却拒绝导出 28 项」（L08 缺陷）回归用例必须存在且通过 |

### B. C 生成保真（G06）

| 编号 | 交付内容 |
|---|---|
| B1 | 必填未配 → 拒绝生成（经 A1 闸门）；可选未配 → **不写任何假值**；删除「遍历全部参数回退 defaultValue」路径 |
| B2 | 已配置值输出正确：转义边界、数字进制、布尔样例沿用既有断言；**gcc -Werror 实编译**生成文件（既有编译用例保持） |
| B3 | 样例附通用 C 数据接口说明注释（生成文件头注释说明数据用途与初始化职责，不承诺供应商 ABI） |

### C. BswmdParser 元数据保留（TASK-013 记录的真实缺陷）

| 编号 | 交付内容 |
|---|---|
| C1 | `definitionPath` 与来源元数据在解析产物中保留（不因 identity/参数返回路径丢失）；官方 raw 的 `$source` 不被剥离 |
| C2 | **非默认包路径往返回归测试**：构造非标准层级定义，验证路径保留与解析正确（TASK-013 指出「标准层级能重建、任意路径不保证」——本项消除该不保证） |

### D. 附带（TASK-013 🟡）

| 编号 | 交付内容 |
|---|---|
| D1 | 测试收集守卫：断言收集文件数 === 磁盘 `.test.ts` 数（防宿主静默漏收导致误判） |
| D2 | 删除 `tests/helpers/legacy-map.json`（已无代码引用；如需留档移 `docs/archive/`） |
| D3 | `02-TECH-DESIGN.md` §5 补 fixture 双轨选型规则两行（评审方文档，Codex 提供要点即可） |

## 2. 验收标准

1. `npm run build` 通过。
2. 265 项既有测试全绿保持 + 新增测试全绿（recovery 15 项不回退；XXE 攻击矩阵回归全拒）。
3. **L08 场景回归**：有必填未配时，校验面板即显示 ERROR（不再出现"验证通过"）；导出拒绝清单与面板问题集合一致。
4. Dem 官方：15 配置 → 精确 15 VALUE（C 与 ARXML 同口径）；全未配置场景拒绝生成/导出。
5. gcc 实编译通过；`src/core` 改动仅限 OutputGate 新增、parser 元数据、消费方接线与 CGenerator 保真（改动清单进报告）。
6. 未修改 `STATE.json` 的 `stage`、`review/**`、本契约。

## 3. 红线

1. 不删测试、不削断言；S1/S2 交付机制（隔离/快照/写锁/fixture 双轨）不得回退。
2. 不动 namespace 与输入兼容（TASK-015）；不动引用候选/DEST 逻辑（TASK-015）——闸门消费 ARXML 时只做 ready 判定接线，不改其结构生成。
3. 闸门实现为**纯 TS core**（零 UI 依赖、零模块名硬编码）；校验面板只消费结果。
4. 不做供应商 ABI 承诺；生成头注释不得宣称官方兼容。

## 4. 报告要求

交付对照逐项文件+要点 / 闸门语义与四类输出一致性矩阵 / L08 回归证据 / gcc 编译原文 / 收集守卫说明 / 既有用例变更逐条说明 / 未完成与限制显式列出 / 提交后单独提交 STATE（SUBMITTED + submissionCommit 完整 SHA）。
