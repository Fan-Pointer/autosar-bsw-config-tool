# ACTIVE TASK — TASK-012

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。
> 设计依据：`docs/product-design/S0-LEGACY-DATA-RECOVERY.md`（v2 定稿）+ `02-TECH-DESIGN.md` §1.1/§2/§3 + `01-IA-AND-SCREENS.md` §2.1/W1/W2。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-012** |
| 任务名 | S1 旧数据安全恢复：逐条隔离 + 永久快照 + 写锁 + 原样导出 + 准确旧定义只读打开 |
| 阶段 | PHASE-12（R3-S1） |
| 指派 | codex（主对话实现，不另唤后台 worker） |
| 前置 | 用户已授权继续（PRODUCT_RESEARCH_HANDOFF_20261103）；研究基线 `1e03827`、规划 `1b76986` |
| 明确不含 | 跨版本迁移（S6）；namespace/输出闸门（S3）；环形常规备份可顺带实现但不属验收主线 |

---

## 1. 交付清单（A/B/C 三组）

### A. 核心机制（round 0 必做）

| 编号 | 交付内容 |
|---|---|
| A1 | `loadConfig()` 逐配置集 try/catch：兼容条目正常恢复；失配条目进 `quarantinedSets`（raw 原样保底 + reason + moduleRef + version + quarantinedAt）；importedModules/modulePreferences 逐项隔离；名称冲突降为隔离条件。**不变式：原库记录 ⇔ 内存+隔离区一一对应，无丢弃** |
| A2 | `dataSafety = { locked, reason, snapshotKey }`；检出隔离条目时**先**写永久快照 `autosar-recovery-snapshot-<ISO>`（内容 === 原库原始值）**再**建锁；快照写入失败 → 照常建锁且本轮所有对原库写路径保持拒绝 |
| A3 | `assertWritable()` 唯一写入口 guard：saveConfig / import-apply / 删除配置集 / 清空 / 库升级 全部前置；锁定时抛 `DATA_LOCKED{reason}`。新建配置集允许，写入 `autosar-config-sets-v4-draft`（不触 v3 原库） |
| A4 | v3 → v4 就地升级：纯加字段（schemaVersion/quarantinedSets/dataSafety），保留全部原字段；升级动作本身先走快照 |
| A5 | `exportRawLibrary()`：导出原库 JSON（含隔离条目原字段/uuid/version）+ 快照与备份索引，文件内容与库内记录逐字节等价 |

### B. 界面（round 0 必做）

| 编号 | 交付内容 |
|---|---|
| B1 | 数据安全横幅（W1）：`⚠ 检测到 N 个不兼容配置集…` + 四动作 [导出原始数据][查看隔离详情][用旧版本定义只读打开][暂时搁置]；横幅不阻塞兼容条目正常编辑 |
| B2 | 隔离详情弹窗（W2）：逐条 名称/模块/版本/原因；含 [导出原始数据] 与快照信息；[删除快照] 需二次确认且仅提示性提供 |
| B3 | 只读打开：用 `bswmd/legacy/dem_bswmd_4.2.2.json`（从 Git 历史 `819eb12^` 恢复的新增只读资产）加载隔离条目为只读视图——树/参数原样可见，编辑/保存/导出禁用；**零映射零改写**（J1939 节点仍是节点字符串、ImmediateNv 仍是立即 NV） |
| B4 | 锁定态不显示任何"已保存"类误导反馈；被拒写操作给出 `DATA_LOCKED` 原因 |
| B5 | 刷新后隔离信息、锁定状态仍在（随库持久化） |

### C. 测试

| 编号 | 交付内容 |
|---|---|
| C1 | 新增 S1 测试覆盖设计验收断言 A1–A9（见 S0 设计 §4）：混合库隔离/锁与逐字节不变/快照时序与永久性/快照失败拒写/原样导出/只读打开/v3→v4 升级/全兼容零回归/刷新保持 |
| C2 | 既有 250 项测试**不退化**（pass ≥179、fail ≤71 且无新增失败文件）；不得删测试、不得削断言 |

---

## 2. 验收标准

1. `npm run build` 通过。
2. C1 全绿 + C2 基线不退化（引用 `.temp` 新 JSON 报告原文）。
3. 手工核验（真实浏览器，隔离 origin 或测试库，**绝不在用户真实 4.2.2 库上做破坏性操作**）：横幅四动作可用、导出文件可解析且与库一致、只读视图可浏览、刷新状态保持。证据截图+DOM 归 `evidence/`。
4. `src/core/**` 零改动（S1 禁区）；`src/stores/configStore.ts`、UI、`bswmd/legacy/`、`tests/` 为允许范围。
5. 未修改 `STATE.json` 的 `stage`、`review/**`、本契约。

## 3. 红线

1. **禁止任何自动迁移与映射驱动改写**；`tests/helpers/legacy-map.json` 禁止产品化（它是测试替换表，含已核实反例 J1939→Severity、ImmediateNv→AgingAllowed）。
2. 禁止改版本号伪装匹配、清空存储、静默转换、4.4.0→4.2.2 反向迁移。
3. 禁止在用户真实数据上故意复现覆盖路径；测试一律用构造库/隔离 origin。
4. 禁止在用户可见界面保留"工程/自动计算"等未核实占位措辞于本任务新增文案中。
5. 不动 `src/core/**`、不动 namespace、不动输出闸门（S3 范围）。

## 4. 分批交付

round 0 必须完成 A 全部 + B1/B2/B4/B5 + C 全部；B3（只读打开）可留 round 1（若留，报告写明，且隔离区仍可用导出取回数据，不构成交付阻塞）。

## 5. 报告要求

交付对照逐项文件+要点 / 故障链修复前后对照（引用真实报错文本）/ 测试报告原文关键行 / 浏览器证据路径 / 未完成与限制显式列出 / 提交后单独提交 STATE（status=SUBMITTED、submittedAt、submissionCommit 完整 SHA）。
