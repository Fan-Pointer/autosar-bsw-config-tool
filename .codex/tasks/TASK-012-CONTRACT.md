# ACTIVE TASK — TASK-012（v2，并入 CONTRACT_CLARIFY 六项裁定）

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。
> 设计依据：`docs/product-design/S0-LEGACY-DATA-RECOVERY.md` **v3**（裁定已并入）+ `02-TECH-DESIGN.md` §1.1/§2/§3 + `01-IA-AND-SCREENS.md` §2.1/W1/W2。
> 六项裁定摘要（详见 S0 v3 头部与 02 ADR-06/08）：
> R1 普通加载不写库；R2 锁定状态走 sidecar（`autosar-recovery-state`），**v3 原库锁定期间完全冻结（零写入零升级）**；R3 导出包 rawJson 与索引/状态分离，断言为"反序列化后深度相等"；R4 fail ≤70；R5 允许范围含 `src/views/WorkspaceView.vue`、`HomeView.vue` 挂载点；R6 S3 闸门消费方仅业务输出，JSON/整库备份永远可取回。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-012** |
| 任务名 | S1 旧数据安全恢复：逐条隔离 + 永久快照 + sidecar 写锁 + 原样导出 + 准确旧定义只读打开 |
| 阶段 | PHASE-12（R3-S1） |
| 指派 | codex（主对话实现，不另唤后台 worker） |
| 前置 | 用户已授权继续；研究基线 `1e03827`、规划链 `1b76986`→`715e2c7` |
| 明确不含 | 跨版本迁移（S6）；namespace/输出闸门（S3）；解锁写回原库（S6）；环形常规备份可顺带实现但不属验收主线 |

---

## 1. 交付清单（A/B/C 三组）

### A. 核心机制（round 0 必做）

| 编号 | 交付内容 |
|---|---|
| A1 | `loadConfig()` 逐配置集 try/catch：兼容条目正常恢复；失配条目进隔离状态（raw 原样保底 + reason + moduleRef + version + quarantinedAt）；importedModules/modulePreferences 逐项隔离；名称冲突降为隔离条件。**不变式：原库记录 ⇔ 内存+隔离区一一对应，无丢弃。普通加载不写库（R1）** |
| A2 | 锁定状态持久化于 sidecar `autosar-recovery-state`（locked/reason/snapshotKey/quarantinedSets/draftKey）；**检出隔离条目时先写永久快照 `autosar-recovery-snapshot-<ISO>`（JSON.parse 后与原库值深度相等）再建锁**；快照写入失败 → 照常建锁且本轮所有对原库写路径保持拒绝。**锁定期间 `LIBRARY_KEY` 零写入零结构升级（R2）** |
| A3 | `assertWritable()` 唯一写入口 guard：saveConfig / import-apply / 删除配置集 / 清空 / 结构升级 全部前置；锁定时抛 `DATA_LOCKED{reason}`。新建配置集允许：写入 `autosar-config-sets-v4-draft`，**该 key 持久化且重启后恢复为草稿配置集（R2）**，绝不触 v3 原库 |
| A4 | 全兼容路径：加载不写库；常规保存行为与现状一致，写入附加 `schemaVersion:4` 属非破坏性（读取 v3/v4 双向兼容，缺字段视为 v3），**不加快照**；"解锁写回前强制快照"为设计保留（S6 实现，本期不实现解锁写回）（R1/R3） |
| A5 | `exportRawLibrary()` 导出包（结构分离，R3）：`{ kind:'autosar-bsw-raw-export', exportedAt, sourceKey, rawJson, recoveryState, snapshotKeys, backupIndex }`；断言口径 `JSON.parse(rawJson)` 与原库当前值**深度相等**（含隔离条目原字段/uuid/version） |

### B. 界面（round 0 必做）

| 编号 | 交付内容 |
|---|---|
| B1 | 数据安全横幅（W1）挂载于 `src/views/WorkspaceView.vue` 与 `HomeView.vue`（R5）：四动作 [导出原始数据][查看隔离详情][用旧版本定义只读打开][暂时搁置]；不阻塞兼容条目正常编辑 |
| B2 | 隔离详情弹窗（W2）：逐条 名称/模块/版本/原因；含 [导出原始数据] 与快照信息；[删除快照] 需二次确认 |
| B3 | 只读打开：用 `bswmd/legacy/dem_bswmd_4.2.2.json`（从 Git 历史 `819eb12^` 恢复的只读资产）加载隔离条目为只读视图——树/参数原样可见，编辑/保存/导出禁用；**零映射零改写** |
| B4 | 锁定态不显示任何"已保存"类误导反馈；被拒写操作给出 `DATA_LOCKED` 原因 |
| B5 | 刷新后锁定状态与隔离信息随 sidecar 仍在；**draft 草稿重启后恢复**（R2） |

### C. 测试

| 编号 | 交付内容 |
|---|---|
| C1 | 新增 S1 测试覆盖设计断言 A1–A8（S0 v3 §4）：混合库隔离且原库零写入/锁与深度相等/快照时序与永久性/快照失败拒写/导出包结构与 rawJson 深度相等/只读打开零映射/全兼容零快照零锁/draft 重启恢复/sidecar 刷新保持 |
| C2 | 既有 250 项测试**不退化：pass ≥179、fail ≤70（R4）**；S1 新增用例全绿；不得删测试、不得削断言、不得沿用 legacy-map 错误映射 |

---

## 2. 验收标准

1. `npm run build` 通过。
2. C1 全绿 + C2 达标（引用 `.temp` 新 JSON 报告原文）。
3. 手工核验（真实浏览器，隔离 origin 或构造库，**绝不在用户真实 4.2.2 库上做破坏性操作**）：横幅四动作可用、导出包可解析且 rawJson 与库一致、只读视图可浏览、刷新与重启（draft）状态保持。证据截图+DOM 归 `evidence/`。
4. **允许触碰**：`src/stores/configStore.ts`、`src/ui/**`、`src/views/WorkspaceView.vue` 与 `src/views/HomeView.vue`（仅横幅/入口挂载，R5）、`bswmd/legacy/*`（新增资产）、`tests/**`（新增 S1 用例）。**禁区**：`src/core/**`（S1 零改动）、`src/core/io/Arxml.ts`。
5. 未修改 `STATE.json` 的 `stage`、`review/**`、本契约。

## 3. 红线

1. **禁止任何自动迁移与映射驱动改写**；`tests/helpers/legacy-map.json` 禁止产品化（已核实反例 J1939→Severity、ImmediateNv→AgingAllowed）。
2. 禁止改版本号伪装匹配、清空存储、静默转换、反向迁移；**锁定态禁止对 v3 原库任何写入（含结构升级）**。
3. 禁止在用户真实数据上故意复现覆盖路径；测试一律用构造库/隔离 origin。
4. 本任务新增文案不出现"工程/自动计算"等未核实占位措辞。
5. 不动 `src/core/**`、不动 namespace、不动输出闸门（S3 范围；JSON/备份不拦截已由 ADR-06 范围修订裁定，S3 实现时遵循）。

## 4. 分批交付

round 0 必须完成 A 全部 + B1/B2/B4/B5 + C 全部；B3（只读打开）可留 round 1（若留，报告写明，隔离区仍可导出取回，不构成交付阻塞）。

## 5. 报告要求

交付对照逐项文件+要点 / 存储路径梳理结论（sidecar/draft/快照键清单）/ 故障链修复前后对照（引用真实报错文本）/ 测试报告原文关键行 / 浏览器证据路径 / 未完成与限制显式列出 / 提交后单独提交 STATE（status=SUBMITTED、submittedAt、submissionCommit 完整 SHA）。
