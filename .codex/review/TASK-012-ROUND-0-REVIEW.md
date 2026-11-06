# TASK-012 评审意见（第 0 轮）— 不可覆盖快照

> 评审方：WorkBuddy ｜ 2026-11-06 09:40 ｜ 判定：**APPROVED**
> 本文件为 round 0 冻结快照，后续轮次不得修改；新轮次另建 `TASK-012-ROUND-<n>-REVIEW.md`。

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-012 / round 0（S1 旧数据安全恢复） |
| reviewedCommit | `ee8434493b25ee67cc570eb02e50dc9d1b0976f3`（merge-base 祖先核实；其后仅状态提交 `9d55ef7` 与文档提交 `b7a6e08`，产品路径零改动） |
| 契约 | ACTIVE v2，哈希 `bb9020f243f43a9022f8df83a114268e5eb3791973d35ceb1918a3b8998d6b65` |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 4 建议 |
| 验收 | 契约 A1–A5 / B1–B5 / C1–C2 全达成；B3 本轮已完成（契约允许留 round 1，实际交付超额） |

---

## 一、独立复核证据（不采信报告自述，全部本机重跑/实读）

### 1. 版本与红线

| 检查 | 结果 |
|---|---|
| `git diff --numstat babbfd6 ee84344 -- src/core/` | **空 = core 零改动**（S1 禁区遵守） |
| 提交范围 | 16 文件 +2854/−49；store、UI、views 挂载、legacy 资产、tests/recovery |
| **legacy 资产来源** | `git show 819eb12^:bswmd/dem_bswmd.json` 与 `bswmd/legacy/dem_bswmd_4.2.2.json` 的 `git hash-object` **完全一致（`0585422`）**——准确历史定义属实 |
| 既有测试零修改 | 失败集合 fullName 差分：**新增失败 0、意外修复 0**（70↔70 同集合） |

### 2. 独立运行

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 17.27s 通过 |
| 独立测试（`.temp/wb-review-tests.json`） | **265 项：195 pass / 70 fail / 0 pending**（gcc 可用性使 skip 摊平，与 Codex 194/70/1 一致）—— **fail 恰为 70，契约 C2（R4：pass≥179 且 fail≤70）达成** |
| recovery 测试 | **15/15 通过**，覆盖隔离/快照时序与复用/全写路径拒绝/双失败仍锁/原样导出/零映射只读/草稿持久/全兼容零触碰/坏定义与坏整库/v2 来源/陈旧标签/快照不轮转/恢复中并发锁/初始化后复核 |

### 3. 代码级核验（store 关键路径）

| 机制 | 实现 | 判定 |
|---|---|---|
| 快照先于锁 | `storage.setItem(snapshotKey)` 在 `dataSafety={locked:true}` **之前**（L1096→L1102） | ✅ |
| 快照失败拒写 | 失败 → `snapshotKey=null` + 告警，**锁照常建立**（内存），写路径全拒 | ✅ |
| **原库唯一写点** | 全 store `storage.setItem(LIBRARY_KEY)` 仅 1 处（L1155），前置 `assertWritable()` + 未初始化/并发变更双重复核（超出契约的保护） | ✅ |
| 快照复用 | 重启时 `previous.snapshotKey` 内容匹配则复用，不重复建快照，保留原 `quarantinedAt` | ✅ |
| 草稿并发保护 | draft 写入前 `draftLocked` + `JSON.stringify` 乐观并发校验 | ✅ |
| 删除快照守卫 | key 前缀校验 + 原库未变校验 + 双重确认 UI | ✅ |

### 4. 实机核验（隔离 origin `localhost:3001`，Codex fixture 构造，未触碰用户真实库）

| 操作 | 实测 |
|---|---|
| 横幅 | 「数据保护：检测到 1 个不兼容条目｜原配置库已锁定保存…」+ 四动作在位；兼容配置可浏览（B1 ✓） |
| 隔离详情 | 逐条展示 `历史旧值验收 Dem 4.2.2 BSWMD module not found: Dem (4.2.2)` + 导出/删除快照（双重确认文案）（B2 ✓） |
| **只读打开零映射** | `DemJ1939DTC_J1939NodeRef = J1939_NODE_KEEP（已配置）`——**J1939 节点保持节点原样，未变 DemDTCSeverity**；对话框明示「不代表官方 4.4.0」；编辑/保存/导出按钮 `disabled=true`（B3 ✓，A5 ✓） |
| 刷新持久 | 重载后横幅与锁定仍在（B5 ✓） |
| **原库不变量终检** | 全部交互后 fixture 检查按钮返回 `originalUnchanged: true`、`locked: true`、快照键存在（A1/A2 ✓） |
| 下载证据 | `download-check.json`：真实文件 64,879 字节、SHA-256 `54f264c3…`、`quarantinedOldRecordMatches/originalLibraryUnchanged/snapshotMatchesOriginal` 全 true、扩展字段 `RETAIN_FIXTURE` 保留（A4 ✓） |

## 二、建议项（🟡，不阻塞）

1. **🟡-1** 只读对话框需手动点树节点才见参数值；建议默认展开并选中第一个容器，减少一步操作。
2. **🟡-2** `rawJson` 导出包含 `draftLibrary`（报告 A5 明确），建议在导出文件头部加一行 `readme` 字段说明三段数据语义，降低用户误读风险。
3. **🟡-3** sidecar 写失败时下次启动重新检测（设计允许），但用户在此期间若不知道"锁只是内存态"，可能困惑；告警文案已尽力，建议横幅在 sidecar 失败场景下追加一句「请勿关闭页面前导出数据」。
4. **🟡-4** `assertWritable` 的"初始化前复核"逻辑较深（persistLibrary 内两段防御），建议 S2 收口时补一张存储状态机小图进 02-TECH-DESIGN，防后人误改。

## 三、边界与如实记录

- Codex 明确：未在用户真实库复现覆盖、未通过 UI 实际点击永久删除（删除逻辑代码检查 + 单测，不冒充实测）——**诚实度合格**。
- 70 项旧失败属已约定 S2 范围，本轮**未以任何方式掩盖**（差分为空）。
- 用户真实 origin（127.0.0.1:3000）本次评审**未触碰**；用户下次以新代码打开时将看到保护横幅而非旧报错，属预期行为。

## 四、裁定

- **TASK-012 round 0 = APPROVED**（绑定 `ee8434493b25ee67cc570eb02e50dc9d1b0976f3`）。
- 🟡 4 项并入 S2 契约附带修复清单（🟡-2/3 文案类）与 S4（🟡-1 交互类）、02-TECH 文档（🟡-4）。
- 下一阶段 **S2 测试基线重建 = TASK-013**，见 `ACTIVE.md` 契约与 STATE 绑定哈希。
- 用户新需求（右键子容器直选菜单，`USER-REQUEST-20261106-CHILD-MENU.md`）按评审方裁定并入 **S4**（G11 范围），已更新 `00-SCOPE`/`01-IA`/`03-ROADMAP`；不混入 S1，不新开独立阶段。
