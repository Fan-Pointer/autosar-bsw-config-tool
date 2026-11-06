# ACTIVE TASK — TASK-015

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。
> 设计依据：`docs/product-design/00-SCOPE-AND-FEATURES.md`（G04/G05/G17）、`02-TECH-DESIGN.md` §1.3/§1.5。
> 前置输入：TASK-014 APPROVED（`ccb8f12`）；OutputGate 语义（S3a 定稿）不得回退。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-015** |
| 任务名 | S3b ARXML 互操作：namespace r4.0 + 引用全候选/DEST 分类 + 往返保真顺序稳定 |
| 阶段 | PHASE-15（R3-S3b） |
| 指派 | codex（主对话实现） |
| 前置 | TASK-014 APPROVED；S3a 闸门与四消费方一致性已定稿 |
| 明确不含 | 存储层/S1 机制变更；OutputGate 语义变更；跨模块引用支持（边界不变，G05）；供应商集成承诺 |

---

## 1. 交付清单

### A. namespace 与版本口径（G04）

| 编号 | 交付内容 |
|---|---|
| A1 | `AUTOSAR_NAMESPACE` 由 `http://autosar.org/schema/r4.2.2` 改为 **`http://autosar.org/schema/r4.0`**（CP 4.4.0 序列化规则 TPS_ASR_00011/00017）；发布版本字段维持 4.4.0 |
| A2 | **输入兼容**：读入 r4.2.2（旧产品导出）文件 → 正常解析 + 显式警告「来源为旧版本命名空间」；非 AUTOSAR 根元素拒绝（既有行为保持） |
| A3 | 测试内手写 `r4.2.2` 字符串的 fixture/断言随口径统一（逐处列出）；**不宣称官方 XSD 验证通过**（完整 XSD 未取得，报告显式声明该限制） |

### B. 引用语义（G05）

| 编号 | 交付内容 |
|---|---|
| B1 | 目标解析覆盖**全部 `destinationRefs[]` 候选**（现行只取首项）；CHOICE-REFERENCE 多候选选择与校验贯通 |
| B2 | 导出 `DEST` 按 `reference.kind` 分类生成（REFERENCE/FOREIGN/INSTANCE/CHOICE-REFERENCE 各自正确）；不得全写一种 |
| B3 | `isExternal` 引用只读展示；**有损导出拒绝**并给具体原因（沿 G05 红线）；TASK-014 的两类拒绝原因（未配置/跨模块）不回归 |

### C. 往返保真与顺序稳定（G17）

| 编号 | 交付内容 |
|---|---|
| C1 | 导出**顺序稳定**：参数/引用按「BSWMD 定义顺序或保留原序」输出（二选一，报告说明选型），`export→import` 后顺序逐项一致；**禁止按字母排序** |
| C2 | 往返断言补全：值/isConfigured/描述/UUID/顺序/时间戳逐项（TASK-008 已有部分，补顺序维度） |
| C3 | 无私有 metadata 的文件可读（标准内容独立成立）——延续既有断言 |

### D. 附带

| 编号 | 交付内容 |
|---|---|
| D1 | TASK-014 🟡-1：store 封装对 `outputCheck` 结果做 `configUuid + lastModified` 校验，同动作约束类型化（防陈旧结果传入） |
| D2 | TASK-014 🟡-3：非 DTC 配置的 CSV 行为显式断言（拒绝或空导出+原因，报告说明语义） |
| D3 | **EXT-001 吸收**（用户 2026-11-06 确认）：`gen-bswmd-from-arxml.mjs` 增确定性输出（去时间戳/键序固定）+ `contentSha256` + `changelog.json` 字段级 diff；数据源仍仅官方 4.4.0 |

## 2. 验收标准

1. `npm run build` 通过；`test:verify` 18+ 文件全绿（0 fail，收集守卫通过）。
2. 导出文件根命名空间 = r4.0；读入旧 r4.2.2 文件有显式警告且解析成功。
3. CHOICE-REFERENCE 第二候选可选择、校验与往返通过（多候选贯通实证）。
4. `export→import` 顺序逐项一致；三模块（Dem/CanIf/NvM）现有断言不回归；CanIf/NvM 拒绝原因分类不回归。
5. `gen-bswmd-from-arxml.mjs` 两次连续运行输出逐字节相同；对上一次运行的变更产出 changelog。
6. 未修改 `STATE.json` 的 `stage`、`review/**`、本契约。

## 3. 红线

1. 不删测试、不削断言；S1/S2/S3a 机制（隔离/快照/写锁/fixture 双轨/OutputGate 语义）不得回退。
2. 不做跨模块引用支持（G05 边界）；不宣称官方 XSD 验证或供应商集成。
3. `AUTOSAR_NAMESPACE` 是本契约唯一允许的口径改动；不动存储、不动恢复协议。
4. 禁止为顺序稳定按字母重排语义顺序。

## 4. 报告要求

交付对照逐项 / namespace 前后对照与兼容警告证据 / 多候选贯通证据 / 顺序稳定往返证据 / gen 脚本确定性验证（连跑两次 diff 为空 + changelog 样例）/ 既有用例变更逐条说明 / 未完成与限制显式列出 / 提交后单独提交 STATE（SUBMITTED + submissionCommit 完整 SHA）。
