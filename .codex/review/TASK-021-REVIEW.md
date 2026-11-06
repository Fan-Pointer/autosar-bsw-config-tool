# TASK-021 评审意见（第 0 轮 · 冻结快照）

> 评审方：WorkBuddy ｜ 时间以本文件 git 提交时间为准 ｜ 判定：**APPROVED**

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-021 / round 0（双版本全目录 + 复合键 + 统一选择器 + 工程内增减模块 + 4.2.2 Dem 首批 + 用户三点修复） |
| reviewedCommit | `c9e35798380e55064877d166cf914258ac51f70e`（实现终态 = `73ee57a` 首轮实现 + `c9e3579` 用户反馈修复；旧 `73ee57a` 非评审对象，已按请求核对） |
| 交接提交 | `edf83df66699b00c25b5bf329193f6105396fb9b`（STATE SUBMITTED，仅三字段，合法） |
| 契约 | ACTIVE = TASK-021，哈希 `df8251fbf0c518a78a5b61f191952ba8a5bc07e51569b2ed3d4230098dbeb68e`（ENUM-SCAN 重绑版，评审方实算与 STATE 绑定一致） |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 3 建议 |
| 验收 | A1–A3 / B1 / B2(计划表) / B3 / C1–C3 / D1–D2 / E1–E3 / F1–F2 全达成；验收标准 1–6 过（第 1 条按既定隔离复跑口径判定） |

---

## 一、独立复核证据

### 1. 运行

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 独立重跑（17.04s，vue-tsc 严格通过） |
| `npm run test:verify` | 默认并发 **1 失败 = editor-ui 20 步撤销 500.75ms**（距阈值差 0.75ms，TASK-019 评审既定口径场景）→ **隔离复跑 445.39ms 通过（9/9）**；终态 24/24 收集守卫 + 345/346 + 隔离通过 → 按既定口径验收标准 1 判过；Codex 自测单 worker 346/346 属实 |
| core 逐文件 | 9 文件 +91/−26（ModuleKey 新增 / BswmdLoader / BswmdParser / BswmdTypes / EcucArxmlImporter / ConfigValues / ReferenceCandidates / Arxml / ConfigJson）——与报告逐文件表**逐行一致**，无越权扩散；`ConfigInstanceManager` 未重复造键 ✓ |
| 测试删削 | 既有用例调整逐条核对（ecuc「空枚举必拒绝」→ literal 缺 SHORT-NAME 畸形枚举拒绝 + 空枚举正例入 catalog 独立覆盖；replica/io-ui/recovery 为口径跟随）——原验证强度保留，无删/skip ✓ |

### 2. 逐项核验（契约对照）

| 组 | 核查 |
|---|---|
| **A manifest 完整化** | `catalog.json` 双版本实读：**4.4.0 = 98（available 7 / limited 87 / unsupported 4）→ 可选 94；4.2.2 = 84（6/17/61）→ 可选 23**——满足验收标准 3（≥93 / ≥21）；每项含 status/parsed/reason/**batch**/diagnostics（如 Dem@4.2.2 diagnostics 保留「DemDTCSeverity：源默认值…」源诊断——处置原则①落地）✓ |
| **B1 枚举 + SYMBOLIC** | 三个越界 default 保留 `sourceDefaultValue`/`definitionIssue`、不提供 defaultValue、不自动已配置（ConfigValues）；六处空枚举 vendorSpecific/readOnly 不伪造；**4.2.2 Dem 4 处 SYMBOLIC-NAME 最小支持**（解析/DEST/目标检查、外部只读）——B1/F1 与 B2 矛盾按 ENUM-SCAN 裁定消除；官方裁片+合成双证单测 ✓ |
| **B2 计划表** | `TASK-021-B2-PLAN.md` 逐批次数量/规范入口/验收矩阵/版本核实缺口明确（含「未获取 CP4.2.2 原版全文、4.3.1 条号不得冒称已核实」的诚实声明）——未擅自实施 ✓ |
| **C 复合键** | `moduleKey(name, release)` JSON 复合键缺省 4.4.0；测试断言 Dem@4.2.2 与 Dem@4.4.0 **并存且偏好互不污染**（generation 一 true 一 false）；旧偏好仅内存转换不落盘（旧数据零迁移）；metadata-free ARXML 按 4.4 基线；错误版本拒绝 ✓ |
| **D 统一选择器** | `ProjectWizard.vue` 与 `ModuleManager.vue` 均 import 同一 `ModuleSelector.vue`（import 关系实查）；截图 03 亲核：96/98 计数、搜索、批选、简短状态无长说明、禁用原因保留可达 ✓ |
| **E 工程内增减** | 真正维护 moduleShortNames/setUuids；`detachedSetUuids` 保留本工程移除记录；重加只找本工程历史且未被其他工程占有（不借用他工程）；显式确认取消零写入；成员变更不改原配置 lastModified（逐字节恢复断言）✓ |
| **F 4.2.2 真实创建** | 官方 Dem@4.2.2 完整样本：`evaluateOutputReadiness.ready=true`、JSON→ARXML→JSON 逐字节相等、`Dem_Cfg.h`/`Dem_PBCfg.c` 产物 + **gcc -Werror -pedantic 编译通过**（gcc.txt）；两版向导/管理/卡片 release 一致 ✓ |

### 3. 用户三点修复核验（`c9e3579` + `task021-userfix/`）

1. **工程打不开（504 根因）**：`server.mjs` 实查 `cacheDir: .temp/vite-desktop-${port}` 按端口独立缓存 + `optimizeDeps.include: ['handlebars']`——修的是根因（抽取脚本共享缓存使运行中依赖地址失效），非表面重试；`browser-errors.json` 仅留修复前 2 条失败、修复后无新增；截图 01 亲核：**DEMO 工程成功打开**（CP 4.4.0 · S32K1XX、四模块树完整渲染无错误）。诚实声明「用户七模块 DEMO 未逐项验证不冒充」✓
2. **三入口独立页面**：`useProjectNavigation` 统一导航/初始化失败处理与重试；新建内嵌两步表单、打开/导入各自内容、单一选中高亮（截图 02/05/07 配套）✓
3. **删长说明**：选择器仅名称/数量/简短状态，无障碍原因保留（截图 03 亲核）；未把不支持模块伪装可用 ✓

### 4. 输出矩阵与确定性

- 空配置双向矩阵：4.2.2 3 允许/20 预期拒绝、4.4.0 6/88——拒绝源于真实必填/引用/CHOICE，ARXML/header/source 三处一致，**未为过验证自动填充** ✓
- 172 定义资源两次生成逐字节一致（determinism.json）；`--all` 批量抽取 ✓

## 二、建议项（🟡，不阻塞）

1. **🟡-1** editor-ui 撤销满载余量持续不足（本轮 500.75ms，差 0.75ms）——沿 TASK-019 裁定口径处理，S7 阶段应正式提级（提升余量或该用例降并发），避免每轮评审都触发隔离复跑。
2. **🟡-2** B2 计划的「CP 4.2.2 原版规范全文未核对」是 B2-SYMBOLIC 实施的**前置缺口**——已写入 TASK-022 契约：实施前先下载官方 4.2.2 TPS_ECUConfiguration 完成条号差异确认，不得沿用 4.3.1 条号冒称。
3. **🟡-3** 模块偏好仍是同版全局策略（非每工程独立）——报告如实声明为原产品行为；多工程差异化偏好留待后续按需立项。

## 三、裁定

- **TASK-021 round 0 = APPROVED**（绑定 `c9e35798380e55064877d166cf914258ac51f70e`）。
- 「解析通过 ≠ 功能支持」纪律全程成立：可选择资格均经 JSON/校验/闸门验证，空配置拒绝矩阵如实；B2 计划未擅自实施。
- **下一契约 TASK-022（B2-SYMBOLIC 首批）已下发 READY**：4.2.2 规范原文核对前置 + SYMBOLIC 语义补齐 + 60 模块逐项资格化；顺序按 B2-PLAN（SYMBOLIC → LINKER/MULTILINE → ADD-INFO → URI；TcpIp 源异常单独小任务）。
- 本机评审完成；按用户指令本轮未触碰云端部署（线上仍为 TASK-019 基线版本）。
