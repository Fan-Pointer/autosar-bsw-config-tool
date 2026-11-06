# ACTIVE TASK — TASK-013

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。
> 设计依据：`docs/product-design/00-SCOPE-AND-FEATURES.md`（G07）、`02-TECH-DESIGN.md` §5 测试策略。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-013** |
| 任务名 | S2 测试基线重建：265 项全绿（0 fail），语义适配不削弱 |
| 阶段 | PHASE-13（R3-S2） |
| 指派 | codex（主对话实现） |
| 前置 | TASK-012 APPROVED（`ee843449`，评审快照 TASK-012-ROUND-0-REVIEW.md）；当前基线 265 总 = 195 pass + 70 fail（评审方实测；gcc skip 摊平） |
| 明确不含 | 业务功能新增；core 架构语义变更（修复测试暴露的真实缺陷除外，逐条列明） |

---

## 1. 交付清单

| 编号 | 交付内容 |
|---|---|
| A1 | **70 项既有失败清零**。方法：合成定义测通用算法（实例管理/历史栈/约束引擎等核心行为），官方定义测集成（Dem 67 容器导入导出往返）。fixture 双轨分离后不再因定义切换整批红 |
| A2 | **legacy-map 借位断言语义修正**：`ecuc-dem-dtc-j1939-node-ref` 字符串用例改走合成 STRING 参数；`ecuc-dem-attr-immediate-nv` 用例改走合成 BOOLEAN；**禁止映射到 DemDTCSeverity / DemAgingAllowed**（已核实反例）。每个保留的 legacy() 借用点须注释其非等价性 |
| A3 | 语义核查表：每个被改断言「旧意图 → 新意图」逐条说明，覆盖面不得减少（沿用 TASK-008 C3 标准）；数量断言按官方定义重算（DemDTC 5 参数、DemDTCAttributes 6+8 等） |
| A4 | 真实缺陷记录：若失败根因是产品缺陷（非测试过时），**不悄悄改测试迁就**——记入报告「真实缺陷清单」并给出 S3 修复建议；确属紧急且小者可修，逐条列明 |
| A5 | 附带修复（TASK-012 评审 🟡）：🟡-2 导出包加 readme 字段说明三段数据语义；🟡-3 sidecar 写失败时横幅追加「请勿关闭页面前导出数据」 |
| A6 | 🟡-4：`02-TECH-DESIGN.md` 补存储状态机小图（评审方文档，Codex 提出要点即可，不强制） |

## 2. 验收标准

1. `npm run build` 通过。
2. **265 总数中 0 fail、pass ≥264（≤1 个明确编译器环境 skip，报告注明 gcc 可用性）**。
3. 既有测试文件零删除；断言调整全部有语义核查表（A3）；`legacy-map` 无新增产品化引用。
4. `src/core/**` 仅允许修复真实缺陷的改动且逐条列明（预期为空或极少）；`src/stores`、`src/ui`、`src/views` 允许测试配套小改。
5. 未修改 `STATE.json` 的 `stage`、`review/**`、本契约。

## 3. 红线

1. 不删测试、不削断言、不用降低标准变绿（沿用历轮红线）。
2. 禁止用 legacy-map 语义替换「修好」测试（J1939→Severity、ImmediateNv→AgingAllowed 为已核实反例）。
3. 不动 namespace、不动输出闸门、不做迁移（S3/S6 范围）。
4. S1 交付的安全机制（隔离/快照/写锁/草稿）不得回退；recovery 测试 15 项必须保持全绿。

## 4. 报告要求

失败清零对照（70 项逐条：修法归类 测试适配/语义重算/真实缺陷）/ 语义核查表 / gcc 可用性说明 / 恢复测试回归确认 / 自检原文关键行 / 未完成与限制显式列出 / 提交后单独提交 STATE（SUBMITTED + submissionCommit 完整 SHA）。
