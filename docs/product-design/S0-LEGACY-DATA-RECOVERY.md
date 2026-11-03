# S0 设计：旧数据安全恢复（v3 — 并入 Codex 六点澄清裁定）

> 状态：**设计定稿 v3**（随 TASK-012 契约下发）。
> 修订史：v1 草案 → v2 修正评审方两处错误（legacy-map 反例、D2/A3 时序）→ **v3 并入 TASK012_CONTRACT_CLARIFY_20261103 六项裁定（评审方全部采纳）**：
> 1. 普通加载不写库；升级与快照时机重定义（见 D3/D5）
> 2. 隔离状态走**独立 sidecar**，原 v3 key 锁定期间完全冻结（含不做结构升级）
> 3. 导出包拆分：`rawJson` 与索引/状态分离；"逐字节"改为"反序列化后深度相等"（IndexedDB 值本无原文件空白字节）
> 4. （C2 数值）契约侧修订
> 5. （UI 范围）契约侧修订
> 6. （S3 闸门范围）`02-TECH-DESIGN.md` 修订：JSON/整库备份永远可取回，不走过闸门
> 核心不变量（v3 明确）：**S1 期间原 v3 key 是 read-only**——锁定态零写入；全兼容态行为与现状一致。

---

## 1. 问题与故障链

```
用户旧库 autosar-config-sets-v3 含 version=4.2.2 配置集
   │ loadConfig() L793: find(shortName && version 严格相等)
   ▼ 内置 Dem 已 4.4.0 → throw 'BSWMD module not found: Dem (4.2.2)'
   ▼ 整库恢复失败（一条失败全体失败），configSets 为空
   ▼ 风险（未复现但代码成立）：下一次 saveConfig/import-apply（L779/L951）
      从内存序列化 → setItem(LIBRARY_KEY) → 原 IndexedDB 记录被空/残库覆盖
```

| 判定 | 内容 |
|---|---|
| 已证实 | 旧库加载失败、功能禁用（Codex 实测 DOM 证据） |
| 代码级风险 | 覆盖写路径存在；**禁止在用户真实数据上故意复现** |
| 禁止修法 | 改版本号伪装匹配 / 清空存储 / 静默转换 / 用 legacy-map 做自动迁移 |

## 2. 设计：五道防线（v3）

### D1 逐条隔离恢复（状态入 sidecar，不动原库）

- `loadConfig()` 逐配置集 try/catch：兼容条目正常恢复；失配条目原样进入隔离状态（raw 原样保底 + reason + moduleRef + version + quarantinedAt）
- 隔离状态**不写回 `LIBRARY_KEY`**，存独立 sidecar（见 D2/D5）；原 v3 记录原样保留
- `importedModules` / `modulePreferences` 逐项隔离（失败项剔除并记录，其余照常）
- **不变式**：恢复结束后「原库记录 ⇔ 内存 + 隔离区」一一对应，无丢弃

### D2 恢复写锁（sidecar 承载，v3 原库冻结）

- 锁定状态持久化于独立 sidecar key **`autosar-recovery-state`**：
  ```ts
  interface RecoveryState {
    schemaVersion: 1;
    locked: boolean;
    reason: string | null;
    snapshotKey: string | null;        // 永久快照
    quarantinedSets: Array<{ raw: unknown; reason: string; moduleRef: string; version: string; quarantinedAt: string }>;
    draftKey: 'autosar-config-sets-v4-draft';
  }
  ```
- 锁定效果：`assertWritable()` guard 拦截**一切对 `LIBRARY_KEY` 的写入**（saveConfig / import-apply / 删除 / 清空 / **库结构升级**），抛 `DATA_LOCKED{reason}` —— **S1 期间 v3 原库零写入、零结构升级**
- **新建配置集允许**：写入 `autosar-config-sets-v4-draft`；**该 key 持久化并在重启时恢复**（启动时存在则恢复为草稿配置集列表），绝不触 v3 原库
- 解锁条件（满足其一）：a) 隔离条目全部显式迁移（S6）或被用户**导出确认后**显式放弃；b) 用户显式确认丢弃（必须先完成 D4 导出）。解锁后首次写回原库前必须出快照（设计保留，S6 实现；本期不实现解锁写回）
- 全兼容库：无锁、无 sidecar、无快照，读写行为与现状一致

### D3 恢复快照（永久，建锁之前）

- **时机**：恢复流程检出任何隔离/异常条目时，**在建立写锁之前**，把 `LIBRARY_KEY` 当前原始读取值原样写入 `autosar-recovery-snapshot-<ISO时间戳>`，key 记入 sidecar 的 `snapshotKey`
- **永久保留**：不参与环形轮转、不被常规清理删除；仅用户在 UI 显式确认「数据已取回，删除快照」才允许删除
- **失败阻止覆盖**：快照写入失败（quota/异常）→ 视为保护未建立 → 锁定照常建立且本轮所有对原库的写路径保持拒绝
- 解锁后的**常规**备份（环形 3 份 `autosar-backup-<ts>`）与 recovery 快照是两类对象，互不影响

### D4 自助取回与准确历史定义恢复

锁定横幅（浅黄警示，不阻塞兼容条目正常编辑）：

> ⚠️ 检测到 N 个不兼容配置集（如 Dem 4.2.2，当前内置 4.4.0），已锁定保存以保护数据。
> [导出原始数据] [查看隔离详情] [用旧版本定义只读打开] [暂时搁置]

- **导出原始数据**：下载包结构（raw 与索引/状态**分离**，不是同一根对象混排）：
  ```json
  {
    "kind": "autosar-bsw-raw-export",
    "exportedAt": "<ISO>",
    "sourceKey": "autosar-config-sets-v3",
    "rawJson": "<原库当前值的 JSON.stringify 原样，独立字段>",
    "recoveryState": { "...sidecar 内容..." },
    "snapshotKeys": ["autosar-recovery-snapshot-..."],
    "backupIndex": ["..."]
  }
  ```
  断言口径：`JSON.parse(export.rawJson)` 与原库当前值**深度相等**（无增删改字段，含隔离条目原字段/uuid/version）。IndexedDB 值本无"原文件空白字节"，不使用"逐字节"表述。
- **隔离详情**：逐条列 moduleRef / version / 配置集名 / 原因；含导出与快照信息
- **用旧版本定义只读打开**：内置准确历史定义（Git 历史 `819eb12^` 手写 4.2.2 定义 → `bswmd/legacy/` 只读资产），隔离条目加载为只读视图——树/参数原样可见，编辑/保存/导出禁用；**零映射零改写**（J1939 节点仍是节点字符串、ImmediateNv 仍是立即 NV）
- **暂时搁置**：横幅收起，锁保持，数据不动

### D5 写入与升级时机（v3 重定义，消除与 A7 的矛盾）

| 路径 | 行为 |
|---|---|
| 普通加载（任何库） | **只读**，不写库、不升级、不建快照 |
| 全兼容库的常规保存 | 行为与现状一致；写入时附加 `schemaVersion: 4` 属**非破坏性加字段**，读取端 v3/v4 双向兼容（缺字段视为 v3）；**不加快照** |
| 锁定态（存在隔离条目） | sidecar 承载全部新增状态；**v3 原库零写入零升级**；新集写 draft key |
| 解锁后首次写回原库（S6） | **写回前强制快照**（设计保留，本期不实现解锁写回） |

## 3. 明确不做（S0 边界）

- ❌ 任何自动迁移、映射驱动改写（legacy-map 禁止产品化）
- ❌ 锁定态下对 v3 原库的任何写入（含结构升级）
- ❌ 改版本号伪装匹配、清空存储、静默转换、反向迁移
- ❌ 动 namespace（归 S3）、动输出闸门（归 S3）
- ❌ 云端备份/同步；在用户真实数据上故意复现覆盖路径

## 4. 验收断言（v3，进 TASK-012 契约）

| # | 断言 |
|---|---|
| A1 | 混合库（兼容 + 4.2.2）加载：兼容条目正常恢复；4.2.2 条目入 sidecar 隔离区；无整库异常；**`LIBRARY_KEY` 值与加载前深度相等（原库零写入）** |
| A2 | 锁定态 save/import/删除/清空/升级：全部 `DATA_LOCKED`；`LIBRARY_KEY` 深度不变；新集写入 draft key 且与原库隔离 |
| A3 | 快照在锁建立前存在，`JSON.parse` 后与原库值深度相等；recovery 快照不被轮转淘汰；模拟快照写入失败 → 本轮写路径全拒 |
| A4 | 原样导出：包结构 `kind/sourceKey/rawJson/recoveryState/snapshotKeys/backupIndex`；`rawJson` 反序列化后与原库值深度相等（含隔离条目原字段）；rawJson 与索引/状态非同一根对象混排 |
| A5 | 只读打开：legacy 定义加载隔离条目，树/参数原样可见（零映射），编辑/保存/导出禁用 |
| A6 | 锁定状态与隔离信息随 sidecar 刷新后仍在；**draft 草稿重启后恢复** |
| A7 | 全兼容库：无锁、无快照、无 sidecar；加载不写库；常规保存行为与现状一致（附加 schemaVersion 非破坏、读取双向兼容） |
| A8 | 既有 250 项基线不退化：**pass ≥179、fail ≤70**；S1 新增用例全绿；不得沿用 legacy-map 错误映射削弱断言 |

## 5. 与后续阶段的关系

- **S6（迁移预览）**：隔离条目最终归宿；解锁写回原库前的强制快照在 S6 实现
- **S3**：输出闸门消费方为 ARXML/CSV/C + 校验面板；**JSON 导出与整库备份永远可取回、不拦截**（可附未完成项提示，不阻止）—— 见 `02-TECH-DESIGN.md` §1.2
- legacy 定义资产：`bswmd/legacy/dem_bswmd_4.2.2.json` 仅用于只读恢复展示，不注册为可编辑定义
