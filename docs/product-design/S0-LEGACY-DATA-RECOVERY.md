# S0 设计：旧数据保护与恢复（P0，插队于所有实现阶段之前）

> 状态：**设计草案**（评审方产出）。最终契约待完整差异表到达后统一下发，但本项设计已可定稿评审。
> 证据来源：Codex 实测 `docs/product-research/00-STATUS.md`（用户原存储环境启动报错 `BSWMD module not found: Dem (4.2.2)`，DOM 证据 `evidence/local-legacy-load-error.dom.txt`，未动原数据）。
> 代码定位（评审方独立只读复核，与 Codex 一致）：`src/stores/configStore.ts` `loadConfig()` ≈L793、写路径 L779 / L951。
> 版本基线：**CP 4.4.0**（发布版本）+ `xmlns=http://autosar.org/schema/r4.0`（命名空间）——用户 2026-11-03 确认。

---

## 1. 问题：当前每一次打开旧库都是一次数据丢失风险

### 1.1 故障链（已证实，非推测）

```
用户旧库: autosar-config-sets-v3 中配置集 version=4.2.2
   │
   ▼ loadConfig() L795: restoredModules.find(shortName===moduleRef && version===saved.version)
   │   内置 Dem 已是 4.4.0 → 找不到 → throw 'BSWMD module not found: Dem (4.2.2)'
   │   ★ map 全体抛出 → 整库恢复失败（不是只丢那一条）
   ▼ configSets.value 保持为空（或旧内存），原库记录仍在 IndexedDB
   ▼ 用户任何一次「创建配置集 / 导入应用 / 删除」
   ▼ saveConfig / import-apply（L779 / L951）:
       snapshot.sets = configSets.value.map(...)   ← 从内存序列化，不含未恢复的旧集
       storage.setItem(LIBRARY_KEY, snapshot)      ← 空库/残库覆盖原库
   ▼ 旧数据永久丢失
```

### 1.2 判定

| 项 | 结论 |
|---|---|
| 根因 | 恢复路径**单点强匹配**（moduleRef+version 精确相等）+ **一条失败全体失败** |
| 危险等级 | **P0**：不需要用户犯错，打开页面后任意一次保存即触发 |
| 错误修法（禁止） | 改版本号伪装匹配 / 清空存储 / 静默转换 —— Codex 已明确，评审方确认 |
| 正确方向 | 失败隔离 + 写保护 + 自动备份 + 显式迁移，见下 |

---

## 2. 设计：六道防线（实现交 Codex，本文件只定设计与验收）

### D1 逐条隔离恢复（fail-isolated restore）

- `loadConfig()` 改为**逐配置集** try/catch：
  - 匹配成功 → 正常恢复进 `configSets`
  - 匹配失败 → 该条目**原样**进入新状态 `quarantinedSets: Array<{ raw: StoredConfig; reason: string; moduleRef; version }>`，不影响其余条目
- `modulePreferences` / `importedModules` 同样逐项隔离：单个 importedModule 解析失败只剔除它并记录，不拖垮整库
- 名称冲突检查（现有 L798）降为隔离条件之一，不再抛整库异常
- **语义不变式**：恢复结束后「原库记录 ⇔ 内存+隔离区」**一一对应，无丢弃**

### D2 恢复失败写保护（dataSafety 锁）

- store 新增 `dataSafety: { locked: boolean; reason: string | null }`：
  - 触发条件：本轮恢复中**存在** quarantined 条目
  - 锁定效果：`saveConfig` / `import-apply` / 删除配置集 / 清空等**一切对 `LIBRARY_KEY` 的写入直接拒绝**，返回明确错误
  - 解锁条件（满足其一）：
    a. 隔离条目全部被显式迁移成功或被用户显式放弃（见 D5）
    b. 用户导出备份后显式确认「丢弃不兼容条目」
- 新建配置集在锁定态**允许**，但写入走独立 key（`autosar-config-sets-v4-draft`），绝不触 `v3` 原库 —— 与 Codex 的「独立 origin 测试隔离」思路一致，升级为产品机制

### D3 自动备份（写前快照）

- **任何**对 `LIBRARY_KEY` 的写入执行前（含解锁后的正常保存），先做一次条件备份：
  - 读取当前 `LIBRARY_KEY` 原始值 → 写入 `autosar-backup-<ISO时间戳>`
  - 环形保留**最近 3 份**（写入第 4 份时删最旧）
  - 仅当内容与最近一份备份**不同**才新建（避免每次保存都堆备份）
- 备份 key 列表存索引 `autosar-backup-index`；备份只增不改、永不自动恢复

### D4 自助取回（用户可见的恢复入口）

锁定态下顶部横幅（浅黄警示，不阻塞浏览）：

> ⚠️ 检测到 N 个不兼容配置集（如 Dem 4.2.2，当前内置 4.4.0），已锁定保存以保护数据。
> [导出原始数据] [查看详情] [开始迁移] [暂时搁置]

- **导出原始数据**：把 `LIBRARY_KEY` 原始 JSON + 全部备份索引打包下载（单文件 JSON）
- **查看详情**：逐条列 `moduleRef / version / 配置集名 / 不兼容原因`
- **暂时搁置**：横幅收起，锁定保持，数据不动

### D5 显式迁移（4.2.2 → 4.4.0，唯一合法的跨版本路径）

- 入口：锁定横幅「开始迁移」（逐条执行，也可全选）
- 映射依据：**现有 `tests/helpers/legacy-map.json`（47/47 全映射，含 9 条人工裁定）产品化** → 迁移为 `src/core/migration/demLegacyMap.ts`（数据同源：由 `scripts/map-legacy-dem-ids.mjs` 生成，测试 helper 与产品共用一份，避免双源漂移 —— 生成脚本输出两处或 helper 改为 re-export 产品文件，实现时定，评审方倾向后者）
- 迁移动作（对每个被选中的隔离条目）：
  1. 用映射把旧 `definitionRef`（语义 id，如 `ecuc-dem-dtc-value`）改写为新定义 uuid
  2. 生成**新**配置集：`version=4.4.0`、新 uuid 保留、`name` 加后缀 `（迁移自 4.2.2）`
  3. 无法映射的 definitionRef（理论上 0 条，47/47 已覆盖）→ **该条迁移失败留在隔离区**并逐项列出，绝不丢弃静默
  4. 迁移成功的旧条目转为**只读归档**（`archived: true`，树中灰显可见），不删除
- 用户可拒绝迁移：拒绝后条目保持隔离只读，锁保持，数据不动
- **不做**反向迁移（4.4.0 → 4.2.2）；**不做** 4.2.2 内部小版本间兼容断言（单点强匹配即报隔离）

### D6 验收断言（进 S0 契约，全部可自动化）

| # | 断言 |
|---|---|
| A1 | 构造含 4.2.2 条目的假库 → 启动：兼容条目正常恢复、4.2.2 条目入隔离区、**不抛整库异常** |
| A2 | 锁定态下调用 save/import/删除：返回拒绝，`LIBRARY_KEY` 快照**逐字节不变** |
| A3 | 锁定态首次写尝试触发前备份：`autosar-backup-*` 存在且内容 === 原始值；环形上限 3 份生效 |
| A4 | 迁移一条 4.2.2 Dem 配置集：迁移后新集按 legacy-map 逐 definitionRef 值一致；旧条目 archived 只读仍在库 |
| A5 | 迁移全拒绝：原库不动，隔离区不变 |
| A6 | 全兼容库（无 4.2.2）：行为与现在完全一致（零回归） |
| A7 | `autosar-config-v2` 旧单集 → v3 库的既有迁移先例路径不回归 |

---

## 3. 版本基线裁定落点（修正评审方先前建议）

| 项 | 裁定（用户 2026-11-03 确认） | 依据 |
|---|---|---|
| 发布/验收基线 | **CP 4.4.0** | 用户确认；源文件头 `AUTOSAR_00046.xsd` + CP 4.4.0 |
| ARXML 命名空间 | **`http://autosar.org/schema/r4.0`**（不是 r4.2.2） | CP R19-11 `TPS_ASR_00011/00017` 兼容版本序列化规则（Codex 检索条款；整份 PDF 待补核——列 R1 遗留） |
| 评审方先前 Q4 建议 | **撤回**「统一 r4.2.2」；当时只对了 fixtures 一致性，没区分命名空间与发布版本 | Codex 00-STATUS §标准版本，评审方复核采信 |
| CHOICE 值侧结论 | 不变，且依据升级：改引 **CP 4.4.0** `TPS_ECUC_03020` + Example 2.33（Codex 已取得该版 PDF），不再引 R24-11 | 避免以较新规范冒充基线版本 |
| 供应商集成验收 | 本期**先验收标准文件 + 通用可编译代码**；DaVinci 实测列为「待环境」显式声明，不冒充已验证 | 用户确认 |
| 配置变体 | 本期**单一配置方案**，变体后延 | 用户确认 |

> 实现落点提示（交 Codex 时写进契约）：`src/core/io/Arxml.ts:12 AUTOSAR_NAMESPACE` 由 `r4.2.2` 改 `r4.0` 属 S4 互操作阶段；**S0 只做数据保护，不动 namespace**——两件事解耦，避免一次改两层。fixtures 中手写的 `r4.2.2` 字符串随 S4 测试适配统一，不得在 S0 顺手改。

## 4. 阶段位置与顺序建议

```
R1 研究（Codex，进行中，差异表未齐）
   │
   ├─ S0 旧数据保护与恢复   ← 本设计；P0，建议第一个 READY
   ├─ S1 测试收口（70 失败，口径 250/0 fail）   ← S0 后立即
   ├─ S2 体验校准 / S3 信息架构 / S4 互操作加固   ← 差异表定稿后排序
```

**评审方建议**：S0 提前于完整差异表单独下发 READY。理由：数据丢失风险**现在每打开一次页面就存在一次**，等差异表没有收益。是否提前由王上一句话定（默认：等差异表齐后 S0+S1 合并下发也接受）。

## 5. 明确不做（S0 边界）

- ❌ 不做静默版本升级、不做「改版本号伪装匹配」
- ❌ 不做自动清空/重置存储的任何路径
- ❌ 不做 4.4.0 → 4.2.2 反向迁移
- ❌ 不动 namespace、不碰业务功能（S0 只保护数据）
- ❌ 云端备份/同步不做（纯前端离线，备份在本机 IndexedDB + 用户自导出文件）
