# TASK-002 评审意见（当前 = 第 1 轮 · APPROVED）

> 本文件指向最新一轮，内容与冻结快照 `.codex/review/TASK-002-ROUND-1-REVIEW.md` 一致。
> 第 0 轮快照保留于 `TASK-002-ROUND-0-REVIEW.md`，两轮均不可变。

## 评审元信息

| 项 | 值 |
|---|---|
| reviewer | WorkBuddy（架构师，评审身份独立） |
| taskId | TASK-002 |
| round | 1 |
| reviewedCommit | `e125f86fab069e94b347ad6b9dca2baf10582239` |
| 状态提交 | `efa166de7e064065af5bbc03b66224f9ffae35db` |
| 评审时 HEAD | `3376824a7022378288336fd114fb41c70f49d48d`（调度器提交，另见 AUTODEV-REVIEW.md） |
| 评审时间 | 2026-10-31T23:58:00+08:00 |
| 契约 | `.codex/tasks/ACTIVE.md`（TASK-002 版） |

## 结论

**判定：`APPROVED`**

| 项 | 数量 |
|---|---|
| 🔴 阻塞项 | **0**（上轮 1 项已闭环） |
| 🟠 重要项 | **0**（上轮 2 项已闭环：1 项由评审方改契约、1 项由 Codex 修实现） |
| 🟡 建议项 | 3（延续 + 新增，均不阻塞） |
| 功能验收 | 8 / 8 |
| 工程验收 | 5 / 5 |

**但必须同时明确：产品尚不可用。** UI 层未接入容器增删 API（见四·观察 1），用户在浏览器里看不到也无法新建任何 DTC。这不是「已知限制」，而是 **TASK-003 的第一阻塞项**，本轮批准仅针对「引擎」契约，不代表产品可用。

---

## 一、上轮阻塞项闭环核验

### 🔴-1（round 0）`lower = 0` 被强制实例化 → **已闭环 ✅**

| 核验点 | 证据 | 结论 |
|---|---|---|
| 初始实例数按 `lower` 精确取值 | `ConfigInstance.ts:65` `Array.from({ length: definition.multiplicity.lower }, …)`，已删除 `Math.max(1, lower)` | ✅ |
| 提供新增 API | `addContainerInstance(instance, parentContainerUuid, definitionUuid)` @ `:80` | ✅ |
| 提供删除 API | `removeContainerInstance(instance, containerUuid)` @ `:125` | ✅ |
| 上界保护 | `:102` `upper !== 'unbounded' && count >= upper` 抛错 | ✅ 超出契约要求（我只要求增删） |
| 下界保护 | `:133` `count <= lower` 抛错，防止删掉必填实例 | ✅ 契约外增益 |
| 重名规避 | `:108-112` 用已存在 shortName 集合递增后缀，注释说明「删除后仅靠计数会重名」 | ✅ 考虑到了删除后重加的场景 |
| 恢复配置可用 | `getModule()` 按 `[moduleRef, version]` 查表；构造函数接收 modules，`getModule` 缺失时抛明确错误 | ✅ 解决了我最担心的「IndexedDB 恢复后无法增删」问题 |
| 悬空引用处理 | 删除时保留其他容器对它的引用，交由校验报告（注释 `:120`） | ✅ 与 DEM-008 的 dangling 检测形成闭环，设计正确 |
| 测试覆盖 | `starts with zero optional children, then adds and removes one by definition`、`adds multiple DTCs with unique identities and names even after a deletion`、`enforces sibling bounds and parent definitions without mutating failed operations`、`supports root containers, zero upper bounds and a restored config with supplied definitions`、`creates required descendants and removes nested subtrees at the correct parent` | ✅ 5 条，正好覆盖我要求的 3 条并超出 |

**额外肯定**：「失败操作不产生副作用」（`without mutating failed operations`）这条测试是我没要求、但工程上极易踩的坑，Codex 主动覆盖了。

---

## 二、上轮重要项闭环核验

### 🟠-1（round 0）契约「7 个子容器」文案 → **评审方已认领，Codex 无需动作 ✅**

口径维持：**7 个容器定义 = 1 个根（DemConfigSet）+ 6 个直接子容器**。round-1 未改动 `bswmd/dem_bswmd.json` 的容器集合，符合裁定。

### 🟠-2（round 0）校验信息质量 → **已闭环 ✅**

| 要求 | 证据（`DefinitionConstraints.ts`） | 结论 |
|---|---|---|
| 仅 `undefined`/`null` 视为未配置 | `:29` `if (value === undefined \|\| value === null)` | ✅ 已移除 `value === ''` |
| 缺失提示可操作 | `:34-35` `X is required` + `Set required parameter X (TYPE)` | ✅ 带类型 |
| 类型非法独立提示 | `:56-62` `X has an invalid type; expected INTEGER (safe integer number)` 等，按类型给期望值 | ✅ |
| 越界提示列出允许范围 | `:71-77` `allowed range: [min, max]`，缺省用 `-Infinity/Infinity` | ✅ |
| 枚举非法列出全部候选 | `:83-91` 全部枚举字面量 `JSON.stringify` 后逗号连接 | ✅ |
| 引用目标类型错误提示 | `:110-111` `must target <Type>` + 选择提示 | ✅ |
| 测试 | `lists exact numeric bounds and distinguishes domain errors from missing values and types`、`accepts empty required STRING and an explicitly allowed empty ENUM literal` | ✅ 正反两面都测了 |

---

## 三、独立核查命令与结果

由 reviewer 本机独立执行，不采信报告自述。

| # | 命令 | 期望 | 实测 |
|---|---|---|---|
| 1 | `git show --stat e125f86` | 改动仅限修复范围 | ✅ 5 文件：`ConfigInstance.ts`、`DefinitionConstraints.ts`、2 个测试文件、报告。未碰路由/依赖/其他模块 |
| 2 | `npm run build` | 通过 | ✅ `vue-tsc --noEmit` + Vite 构建成功，12.91s |
| 3 | `npm test -- --run` | 全绿 | ✅ **2 文件 52 测试全通过**，7.46s，GCC 用例实跑未跳过 |
| 4 | `grep -n "Math.max(1" ConfigInstance.ts` | 无匹配 | ✅ 已消除 |
| 5 | `grep -n "addContainerInstance\|removeContainerInstance"` | 存在 | ✅ 各 1 处，含 JSDoc |
| 6 | `grep "from 'vue'\|pinia\|element-plus" src/core` | 无匹配 | ✅ 架构铁律仍成立 |
| 7 | `grep ": any\|@ts-ignore" src tests` | 无匹配 | ✅ |
| 8 | `grep "Dem[A-Z]" src/ui` | 无匹配 | ✅ 模块可插拔仍成立 |
| 9 | `grep -rn "addContainerInstance\|removeContainerInstance" src --include=*.vue` | 期望存在 | ❌ **零匹配** → 见四·观察 1 |

---

## 四、本轮新观察

### 观察 1（🔴 级，但归属 TASK-003，不阻塞本轮契约）UI 未接入容器增删

`src/stores/configStore.ts` 与 `src/views/WorkspaceView.vue` 均无任何容器增删调用（grep 零匹配）。叠加 🔴-1 的正确修复（`lower=0` 不再预建实例），后果是：**打开 DEM 配置后 6 类子容器全为空，且界面无法新增任何一条**。

- 我 round-0 已明确「本轮只做 API，UI 按钮留给 TASK-003 亦可」，故**不追溯 Codex 违约**。
- 但这是产品能否使用的分水岭：TASK-003 必须把它列为第一阻塞项，且验收要求「在浏览器里连续新增 3 条 DTC」。
- 同理，`FR-Core-001` 的配置集创建/克隆/删除也未接 UI（store 无 `createConfigSet`/`cloneConfigSet`）。

### 观察 2（🟡）`ConfigurationManager` 依赖调用方预置 definitions

恢复配置时必须 `new ConfigInstanceManager(modules)`，否则 `getModule` 抛错。当前 store 已按此使用，但这是隐式契约，建议在 `PRODUCT-PLAN` / README 的「开发者注意」中写明，避免后续模块接入时踩坑。

### 观察 3（🟡）`CGenerator` 宏名可读性（延续 round-0 🟡-3）

`P{idx}_`/`R{idx}_`/`C{idx}_` 前缀去重产生 `DEM_C0_DEMDTC_P0_DEMDTCVALUE` 这类长名。建议 TASK-004 或 TASK-005 调整为后缀序号，贴近供应商代码习惯。

### 观察 4（🟡）`DemConstraints` 以 `shortName !== 'Dem'` 守门（延续 round-0 🟡-1）

未变。建议规则携带 `moduleName` 元数据由引擎过滤，避免模块改名即静默失效。

---

## 五、契约偏差核查表

### 功能验收（8 条）

| 条目 | 结果 | 证据 |
|---|---|---|
| 解析 `dem_bswmd.json` 得 7 个容器定义 | ✅ | 口径 1 根 + 6 子；本轮未变 |
| 缺 `uuid` 容器抛错含名称/索引 | ✅ | 测试沿用并通过 |
| `createFromBswmd` 按 multiplicity 建实例带默认值 | ✅ | 本轮修正后为「按 lower 建」，测试 `starts with zero optional children…` |
| 规则异常时其余规则仍执行 | ✅ | 测试沿用 |
| 两个 DTC 同值报 DEM-001 | ✅ | 跨 ConfigSet 覆盖 |
| Aging 开启无 CycleRef 报 DEM-008 | ✅ | 测试沿用 |
| 生成 `.h` 可编译、宏名合法 | ✅ | GCC `-Werror -pedantic` 实跑 |
| DynamicForm 按类型渲染 | ✅ | 7 项 UI 测试通过 |

### 工程验收（5 条）

| 条目 | 结果 |
|---|---|
| `npm run build` 通过 | ✅ |
| core 无 Vue/Pinia/Element | ✅ |
| 无 `any` | ✅ |
| 导出函数有 JSDoc | ✅（新增 `addContainerInstance` / `removeContainerInstance` 均带 `@param`/`@returns`） |
| 无类型忽略指令 | ✅ |

### 交付物

| 条目 | 结果 |
|---|---|
| 报告追加「第 1 轮修复」 | ✅ `TASK-002-REPORT.md` 增 59 行 |
| `STATE.json` `SUBMITTED` + `round=1` + `submissionCommit` | ✅ 已核对为 `e125f86…` |

---

## 六、范围合规

| 约束 | 实际 |
|---|---|
| 只修 🔴-1 与 🟠-2 | ✅ 无越界，未顺手改 UI/路由/依赖 |
| 不新增 DEM 以外模块 | ✅ |
| 未改 review/stage/契约 | ✅ |
| 未降标准（删测试/放宽 DEM-002 下限/加 `@ts-ignore`） | ✅ 三项均无，测试数 35→52 |

---

## 七、批准决定与下一步

1. **TASK-002 判定 `APPROVED`**，`round` 保持 `1`，`reviewedCommit = e125f86…`，写入 `STATE.history` 保留追溯。
2. 立即下发 **TASK-003**（`READY`），首要目标：把已正确的引擎接到界面上，让产品可用。范围见 `.codex/tasks/ACTIVE.md`。
3. 上一轮 🟡 三项转入 TASK-004/005 待办，不在 TASK-003 强制。
4. 原 `ACTIVE.md`（TASK-002 契约）归档为 `.codex/tasks/TASK-002-CONTRACT.md`，不修改内容。

---

**评审方签署**：WorkBuddy（架构师）｜ 2026-10-31T23:58:00+08:00
