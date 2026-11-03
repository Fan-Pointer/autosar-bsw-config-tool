# 技术设计：数据模型、接口与改动范围（v1.0 定稿）

> 维护方：WorkBuddy 评审方 ｜ 2026-11-03。架构铁律不变：core 纯 TS 零 UI 依赖、零模块名硬编码；模块语义在 `src/modules/<mod>/`；UI 由 BSWMD 元数据驱动。
> 版本表达三分离：`StoredLibrary.schemaVersion`（数据结构版本）≠ `BswmdModule.version`（AUTOSAR release，4.4.0）≠ `$source.sha256`（定义来源）。

---

## 1. 数据模型演进

### 1.1 存储层（S1，详见 S0 设计 v3 §D2/D5）

- **v3 原库 key 在锁定期间完全冻结（零写入、零结构升级）**；新增状态走独立 sidecar
- 新增键：`autosar-recovery-state`（sidecar：locked/reason/snapshotKey/quarantinedSets/draftKey）、`autosar-recovery-snapshot-<ts>`（永久快照）、`autosar-config-sets-v4-draft`（锁定态新集，**持久化并重启恢复**）、`autosar-backup-<ts>`（解锁后环形 3 份）、`autosar-backup-index`
- `assertWritable()` 成为唯一写入口 guard（saveConfig / import-apply / 删除 / 清空 / 结构升级）
- `schemaVersion` 附加属非破坏性：仅全兼容路径的常规保存写入（v3/v4 双向读取兼容，缺字段视为 v3）；锁定路径不写原库因此不涉及；解锁后首次写回原库前强制快照（S6 实现）
- 导出包结构（raw 与索引/状态分离）：`{ kind, exportedAt, sourceKey, rawJson, recoveryState, snapshotKeys, backupIndex }`；断言口径为 `JSON.parse(rawJson)` 与原库值**深度相等**

### 1.2 配置实例层（既有结构保留，S3 扩充）

现有 `ConfigInstance`（uuid/moduleRef/version/containers/引用 targetUuid）**结构保留**；S3 只增不改：

```ts
// 输出有效性闸门（单一事实源）。消费方：校验面板、ARXML 导出、CSV 导出、C 生成。
// 明确不拦截：JSON 导出、整库备份/原始数据导出 —— 数据取回永远可走通（ADR-06 范围修订，
// 采纳 TASK012_CONTRACT_CLARIFY 第 6 点：备份不应被"未完成配置"挡住，只附信息提示不阻止）。
interface OutputCheckResult {
  ready: boolean;
  issues: Array<{ severity: 'ERROR' | 'WARNING'; path: string; reason: string;
                  anchor: { containerUuid: string; definitionRef?: string } }>;
}
declare function isOutputReady(config: ConfigInstance, module: BswmdModule): OutputCheckResult;
// 语义：isConfigured=false 的必填 → ERROR；CHOICE 未选 → ERROR；
//       可选未配 → 不出现在输出（不是错误也不是建议值）；false/0 已配置不误报
```

### 1.3 引用模型（S3）

- `ReferenceValue` 增 `targetDefinitionPath?: string`（仅记录，语义仍单 target）
- 目标解析统一走 `resolveReferenceCandidates(reference, config, module)`：**覆盖全部 `destinationRefs[]` 候选**（现行只取首项是缺陷）；`isExternal=true` 候选永不进入可选列表，展示为只读行
- 序列化按 `reference.kind` 生成 `DEST`（`ECUC-REFERENCE-DEF`→`ECUC-REFERENCE-DEF`、choice-reference→`ECUC-CHOICE-REFERENCE-DEF`…），不得全写一种

### 1.4 定义资产（S1/S5）

- `bswmd/legacy/dem_bswmd_4.2.2.json`：从 Git 历史（`819eb12^`）恢复，只读资产；仅用于隔离条目只读打开；**不注册**为可编辑定义
- 模块分组元数据（协议栈分组，对标 B04）推迟到 S5 与 G21 一并设计；core 不感知分组

## 2. 模块接口（新增/改动）

| 接口 | 归属 | 签名要点 | 阶段 |
|---|---|---|---|
| `assertWritable()` | configStore | `throws DATA_LOCKED{reason}`；全部写路径前置 | S1 |
| `createRecoverySnapshot()` | configStore | 内部；锁前调用；失败→本轮写全拒 | S1 |
| `exportRawLibrary()` | configStore | 返回 `Blob`：原库 JSON 逐字节等价 + 备份索引 | S1 |
| `getQuarantine()` / `discardQuarantined(uuid)` | configStore | discard 前置：已导出确认 | S1 |
| `openQuarantinedReadOnly(uuid)` | configStore+UI | 用 `bswmd/legacy/*` 打开只读视图 | S1 |
| `isOutputReady()` | `src/core/output/OutputGate.ts`（新） | 见 §1.2；**core 纯 TS** | S3 |
| `resolveReferenceCandidates()` | `src/core/config/`（重构自现首项逻辑） | 见 §1.3 | S3 |
| `exportArxml(config, module, {schema:'4.4.0'})` | `src/core/io/Arxml.ts` | namespace 常量改 `r4.0`；读取兼容 r4.2.2 输入并警告 | S3 |
| `generateHeader/Source()` | `CGenerator.ts` | 先过 `isOutputReady`；可选未配不输出；不回退 defaultValue | S3 |
| `saveState()` / 自动保存 | configStore | 30s 定时 + 状态机 + 失败重试；不绕锁 | S5 |

## 3. 改动文件范围（按阶段，供契约引用与评审对照）

| 阶段 | 允许触碰 | 禁止触碰 |
|---|---|---|
| S1 | `src/stores/configStore.ts`、`src/ui/**`（横幅/详情/只读视图）、`bswmd/legacy/*`（新增资产）、`tests/**`（新增 S1 用例） | `src/core/**`（S1 不动 core）、`src/core/io/Arxml.ts`、既有断言语义 |
| S2 | `tests/**`、`tests/helpers/**` | `src/**`（除修复暴露的真实缺陷，逐条列明） |
| S3 | `src/core/io/Arxml.ts`、`src/core/config/**`、`src/modules/dem/DemConstraints.ts`、`src/core/generator/**`、新增 `src/core/output/`、相关 UI | 存储结构（S1 定型后冻结到 S7 前） |
| S4–S5 | `src/ui/**`、`src/views/**`、`src/stores/**`（表现层） | core 语义（只允许接口调用） |
| S6 | 新增 `src/core/migration/**`、迁移 UI | core 既有模块 |
| S7 | 构建/文档/样例 | 功能语义 |

## 4. 关键技术决策（ADR 摘要，全量入工程档案）

| # | 决策 | 理由 | 代价 |
|---|---|---|---|
| ADR-05 | 隔离而非迁移（S1） | legacy-map 两处反例证明自动映射会语义损坏；保护优先于升级 | 用户暂时不能用旧数据编辑，需 S6 |
| ADR-06 | 单一输出闸门 `isOutputReady`，**消费方仅限业务输出（ARXML/CSV/C）+ 校验面板；JSON 导出与整库备份永远可取回不拦截** | L08 证明校验/导出语义分裂；同源才能一致。备份被挡会剥夺用户取回数据的最后通道（澄清第 6 点） | 校验面板需重构为消费同一结果；JSON 可附未完成项提示但不阻止 |
| ADR-07 | namespace 常量改 r4.0，输入兼容 r4.2.2 并警告 | CP4.4.0 序列化规则 TPS_ASR_00011；既有导出文件是错误口径 | 旧导出文件再导入会有警告（可接受） |
| ADR-08 | **锁定态 sidecar 承载新增状态，v3 原库冻结零写入**；普通加载不写库；全兼容常规保存附加 schemaVersion 非破坏；解锁写回前强制快照（S6） | "原库逐字节不变"与"隔离状态持久化"天然矛盾，sidecar 是唯一同时满足两者的结构（澄清第 1/2 点） | 状态分散两处（sidecar+draft），需启动合并恢复逻辑 |
| ADR-09 | 生成模板继续内嵌 TS 字符串（不外置模板文件） | 模板随程序版本受测试保护；用户自定义模板留待后续评估 | 用户不能热替换模板（本期接受） |

## 5. 测试与验收自动化策略

- **合成定义测通用算法**（核心层行为：实例管理/历史栈/约束引擎/闸门），**官方定义测集成**（Dem 67 容器、导入导出往返）——两套 fixture 分离，杜绝再因定义切换整批红
- S1 起 fixture 定版：`tests/fixtures/` 官方片段 + `tests/helpers/synthDem.ts` 合成定义；legacy-map 仅允许作为「旧 id → 测试定位」索引，**每个借用点须注释其非等价性**（S2 逐条修正）
- 浏览器验收步骤模板（写进各阶段契约）：固定视口 1400×900 与 1366×768 两档、操作序列、DOM 断言点、截图证据归 `evidence/`
- 性能（S7）：固定机器/浏览器/构建模式，样本 1000 DTC / 5000 实例，记录 p50/p95
