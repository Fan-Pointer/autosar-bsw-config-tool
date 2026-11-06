# ACTIVE TASK — TASK-014（v2，并入 CONTRACT_CLARIFY 三项裁定）

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。
> 设计依据：`docs/product-design/00-SCOPE-AND-FEATURES.md`（G03/G06）、`02-TECH-DESIGN.md` §1.2/§2（OutputGate）。
> 前置输入：TASK-013 报告记录的三个 S3 真实缺陷（definitionPath 丢失 / 校验输出分裂 / namespace 旧口径）——前两项本契约修复，第三项归 TASK-015。
> **v2 修订（2026-11-06，TASK014-CONTRACT-CLARIFY 三项裁定，评审方）**：
> R1 验收 4 废弃「官方 15→15」旧合成口径 → 官方改为**集合恒等断言**（已配置集 = ARXML VALUE 集 = C 字段集）+ 必填门槛不削弱；合成 fixture 保留精确等式回归。
> R2 闸门 = **纯函数重新求值**语义（见 A1/A2 修订）：禁止重复校验逻辑，也禁止跨动作复用结果对象（陈旧风险）；规则注入由 store 统一完成。
> R3 Arxml.ts 允许**仅路径取值接线**白名单（definitionPath 优先、缺省回退）+ A2 闸门消费接线；namespace/引用候选/DEST/结构标签仍归 TASK-015。

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
| A2 | 消费方接线与求值语义（R2 裁定）：闸门为**纯函数** `evaluateOutputReadiness(config, module, extraRules?)`——通用检查内置 core，模块规则（如 `DemConstraints`）由 **store 层统一注入**（core 不知道模块名）。四个消费方（校验面板 / exportArxml / exportCsv / CGenerator）**各自在自己动作的事务点调用同一函数重新求值**；**禁止**两件事：①任一入口另写校验逻辑（重复逻辑）②跨动作缓存复用结果对象（陈旧）。同一动作链内求值一次并传递。建议 store 提供薄封装（如 `getOutputCheck(configId)`）作为唯一注入点 |
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
4. **输出集合恒等（R1 裁定，废弃旧「15→15」合成口径）**：
   - 合成 fixture（TEST-SYNTHETIC-1）：保留精确等式回归 `已配置参数数 = ARXML <VALUE> 数 = C 字段数`；
   - **官方 Dem 4.4.0**：不预设数量。断言**集合恒等**——`已配置参数集合 ≡ ARXML <VALUE> 集合 ≡ C 字段集合`（逐 definitionRef 比对）；**必填门槛不削弱**：必填未配置仍拒绝输出（先以「一键确认建议值」或显式配置补齐全部必填再输出，断言此时三个集合相等且无多余 VALUE）。
5. gcc 实编译通过；`src/core` 改动仅限 OutputGate 新增、parser 元数据、消费方接线与 CGenerator 保真（改动清单进报告）。
6. 未修改 `STATE.json` 的 `stage`、`review/**`、本契约。

## 3. 红线

1. 不删测试、不削断言；S1/S2 交付机制（隔离/快照/写锁/fixture 双轨）不得回退。
2. **Arxml.ts 本契约允许的改动白名单（R3 裁定）**：仅两处——①**路径取值接线**：definitionRef/路径生成处优先读取解析产物携带的 `definitionPath`，缺省回退既有路径（数据来源替换，非结构生成变更）②A2 闸门消费接线。**仍然禁止**：namespace 常量、输入兼容、引用候选/DEST 逻辑、结构标签与元素生成顺序（均归 TASK-015）。
3. 闸门实现为**纯 TS core**（零 UI 依赖、零模块名硬编码）；校验面板只消费结果。
4. 不做供应商 ABI 承诺；生成头注释不得宣称官方兼容。

## 4. 报告要求

交付对照逐项文件+要点 / 闸门语义与四类输出一致性矩阵 / L08 回归证据 / gcc 编译原文 / 收集守卫说明 / 既有用例变更逐条说明 / 未完成与限制显式列出 / 提交后单独提交 STATE（SUBMITTED + submissionCommit 完整 SHA）。
