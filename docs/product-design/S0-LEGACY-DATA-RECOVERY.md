# S0 设计：旧数据安全恢复（v2 — 修正评审方 v1 的两处错误）

> 状态：**设计定稿**（随 TASK-012 契约下发）。
> v1 错误认领（2026-11-03 18:05，评审方）：
> 1. **D5 产品化迁移是错的**。`tests/helpers/legacy-map.json` 是测试替换表，不是无损迁移表。评审方独立核实两处反例：`ecuc-dem-dtc-j1939-node-ref` 映射到 `DemDTC/DemDTCSeverity`（ENUM，旧语义是 J1939 节点字符串，测试还曾向它塞 `'CDATA_SENTINEL'` 做转义用例——类型完全不符）；`ecuc-dem-attr-immediate-nv` 映射到 `DemDTCAttributes/DemAgingAllowed`（BOOLEAN，业务含义无关）。且存在多对一替换、层级变化。**47/47 命中 ≠ 语义等价**。跨版本自动迁移撤出 S0，独立为 S6（见 ROADMAP），须逐字段语义依据 + 差异预览 + 未映射保留。
> 2. **措辞修正**：实测证据是「打开旧库加载失败、原 IndexedDB 记录仍在」；空/残库**覆盖是代码级风险，未在用户真实数据上复现**，不得表述为"打开即已丢失"。
> 3. **时序矛盾修正**：v1 的 D2（锁定拒写）与 A3（首次写尝试触发备份）矛盾——锁定后根本没有"首次写尝试"。修正见 D3：恢复快照在**异常检出时**、**建立写锁之前**创建，且**永久保留、不参与轮转**。
> 证据来源：Codex `docs/product-research/00-STATUS.md`、`evidence/local-legacy-load-error.dom.txt`；评审方独立只读复核 `configStore.ts` loadConfig ≈L793、写路径 L779/L951、legacy-map 两处映射。

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

## 2. 设计：五道防线

### D1 逐条隔离恢复

- `loadConfig()` 逐配置集 try/catch：兼容条目正常恢复；失配条目原样进入 `quarantinedSets: Array<{ raw: StoredConfig; reason: string; moduleRef: string; version: string }>`
- `importedModules` / `modulePreferences` 同样逐项隔离；名称冲突降为隔离条件，不再抛整库异常
- **不变式**：恢复结束后「原库记录 ⇔ 内存 + 隔离区」一一对应，无丢弃
- 隔离状态随库持久化（见 D5 数据结构），刷新后仍在（G01 验收要求）

### D2 恢复写锁（dataSafety）

- 恢复中存在隔离条目 → `dataSafety = { locked: true, reason, snapshotKey }`
- 锁定效果：`saveConfig` / `import-apply` / 删除配置集等**一切对 `LIBRARY_KEY` 的写入**先过 `assertWritable()` guard，锁定时抛 `DATA_LOCKED` 并在 UI 给出原因
- **新建配置集允许**，但写入独立 draft key（`autosar-config-sets-v4-draft`），绝不触 `v3` 原库
- 解锁条件（满足其一）：a) 隔离条目全部被显式迁移（S6，本期不实现）或被用户**导出确认后**显式放弃；b) 用户显式确认丢弃（必须先完成 D4 导出）

### D3 恢复快照（永久，写锁之前）

- **时机**：恢复流程检出任何隔离/异常条目时，**在建立写锁之前**，把 `LIBRARY_KEY` 当前原始值原样写入 `autosar-recovery-snapshot-<ISO时间戳>`，并把 key 记入 `dataSafety.snapshotKey`
- **永久保留**：recovery 快照**不参与**环形轮转、不被任何常规清理删除；只有用户在 UI 显式确认「数据已取回，删除快照」才允许删除
- **失败阻止覆盖**：快照写入**失败**（quota/异常）→ 视为保护未建立 → 锁定照常建立且**本轮所有对原库的写入路径保持拒绝**（比 v1 更严：不是"备份失败仍可写"，而是"备份失败就绝不写"）
- 后续解锁后的**常规**备份（环形 3 份，`autosar-backup-<ts>`）与 recovery 快照是两类对象，互不影响

### D4 自助取回与准确历史定义恢复

锁定横幅（浅黄警示，不阻塞浏览兼容条目的正常编辑）：

> ⚠️ 检测到 N 个不兼容配置集（如 Dem 4.2.2，当前内置 4.4.0），已锁定保存以保护数据。
> [导出原始数据] [查看隔离详情] [用旧版本定义只读打开] [暂时搁置]

- **导出原始数据**：`LIBRARY_KEY` 原始 JSON（含 4.2.2 条目原字段、原 uuid、原 version）+ 备份索引打包下载；文件内容与库内记录**逐字节等价**（验收断言）
- **隔离详情**：逐条列 moduleRef / version / 配置集名 / 不兼容原因
- **用旧版本定义只读打开**：产品内置**准确历史定义**（从 Git 历史恢复的手写 4.2.2 定义，入 `bswmd/legacy/` 只读资产），把隔离条目加载为**只读视图**——树可见、参数可看、编辑/保存/导出禁用。用户因此不被困住（G02 验收：J1939 节点保持节点、ImmediateNv 保持立即 NV——原样展示，不发生任何映射）
- **暂时搁置**：横幅收起，锁保持，数据不动

### D5 数据结构与序列化版本

```ts
// StoredLibrary v4（v3 读取时无 schemaVersion 字段 → 视为 v3，就地升级，保留全部原字段）
interface StoredLibraryV4 {
  schemaVersion: 4;                       // 数据库 schema 版本（≠ AUTOSAR release ≠ 定义来源 hash，三者分开表达）
  sets: StoredConfig[];                   // 兼容条目（语义不变）
  quarantinedSets: QuarantinedSet[];      // 新增：隔离条目（raw 原样保底）
  importedModules?: BswmdModule[];
  modulePreferences?: Record<string, ModulePreference>;
  activeUuid?: string;
  dataSafety?: { locked: boolean; reason: string | null; snapshotKey: string | null };
}
interface QuarantinedSet {
  raw: StoredConfig;          // 原样保底，永不改写
  reason: string;
  moduleRef: string;
  version: string;
  quarantinedAt: string;      // ISO
}
```

- v3 → v4 升级是**纯加字段**，不重写既有记录内容；升级动作本身也要先走 D3 快照
- `assertWritable()` 是唯一写入口 guard：saveConfig / import-apply / 删除 / 清空全部经过它

## 3. 明确不做（S0 边界）

- ❌ 任何自动迁移、任何映射驱动的改写（legacy-map 是测试资产，**禁止产品化**；测试段的借用用法仅允许存在于 tests/，且 S2 测试适配须修正其断言语义说明）
- ❌ 改版本号伪装匹配、清空存储、静默转换、4.4.0→4.2.2 反向迁移
- ❌ 动 namespace（r4.2.2→r4.0 归 S3）、动输出闸门（归 S3）
- ❌ 云端备份/同步
- ❌ 在用户真实数据上故意复现覆盖路径

## 4. 验收断言（进 TASK-012 契约）

| # | 断言 |
|---|---|
| A1 | 混合库（兼容条目 + 4.2.2 条目）加载：兼容条目正常恢复，4.2.2 条目入隔离区，**无整库异常** |
| A2 | 锁定态 save/import/删除：全部抛 `DATA_LOCKED`，`LIBRARY_KEY` 快照**逐字节不变** |
| A3 | 异常检出时快照已存在（在锁建立前），内容 === 原库原始值；recovery 快照**不被**环形轮转淘汰；模拟快照写入失败 → 本轮写路径全部拒绝 |
| A4 | 原样导出：文件内容 === 原库 JSON（含隔离条目原字段/uuid/version） |
| A5 | 只读恢复：用内置 legacy 定义打开隔离条目——树/参数原样可见（J1939 节点仍是节点字符串、ImmediateNv 仍是立即 NV），编辑/保存/导出禁用，**零映射零改写** |
| A6 | v3 → v4 升级纯加字段；升级前先出快照 |
| A7 | 全兼容库：行为与现在一致（零回归），不产生锁与快照 |
| A8 | 刷新后隔离信息、锁定状态仍在（G01 要求） |
| A9 | 既有 250 项测试基线不退化（pass ≥179），S1 新增测试全绿；**不得沿用 legacy-map 的错误映射削弱断言** |

## 5. 与后续阶段的关系

- **S6（迁移预览）**：隔离条目的最终归宿是 S6 的显式迁移——逐字段语义依据、改名/层级/类型变化全部列出、未映射保留、用户逐条确认。S0 只保证「数据活着、看得见、取得回」，不承诺迁移。
- **S3**：输出有效性闸门、namespace——与 S0 无耦合，不得顺手混改。
- legacy 定义资产：`bswmd/legacy/dem_bswmd_4.2.2.json`（从 Git 历史 `819eb12^` 恢复）仅用于只读恢复展示，**不注册**为可编辑定义、不参与输出。
