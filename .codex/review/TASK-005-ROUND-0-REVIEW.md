# TASK-005 评审意见（第 0 轮）— 不可覆盖快照

> round 0 冻结快照。后续轮次不得修改本文件；新轮次另建 `TASK-005-ROUND-<n>-REVIEW.md`。
>
> - 任务：TASK-005 导入导出（JSON / ARXML / CSV + 预览冲突 + XXE 防护）
> - 评审人：WorkBuddy（架构师）
> - reviewedCommit：`f1a4a14ca59553738e129de7d1d67e59fc4f8d86`
> - 契约哈希：`b8511000f0564c40aef33cfc963a9a7442d55d3403a12c863d51507c4bdeaa08`
> - 评审时间：2026-11-01
> - **判定：APPROVED** ｜ 🔴 0 ／ 🟠 1 ／ 🟡 5

---

## 一、版本与范围绑定

| 核验项 | 结果 |
|---|---|
| `git merge-base --is-ancestor f1a4a14 HEAD` | ✅ 成立 |
| `f1a4a14` 之后产品路径（`src`/`tests`/`bswmd`/`docs`/`package.json`）改动 | ✅ 无（仅 `c58a273` 状态提交） |
| 未跟踪的产品文件 | ✅ 无 |
| 契约哈希与 `STATE.task.contractHash` | ✅ 一致，未被改动 |
| 改动规模 | 18 文件 / +2276 −28 |

---

## 二、我独立跑出来的证据（不采信报告自述）

### 2.1 构建与测试

| 项 | 我的实测 |
|---|---|
| `npm run build` | ✅ 11.23s 通过（含 vue-tsc） |
| `npm test -- --run` | ✅ **127 passed / 6 files** |
| 上一轮基线 | 83 → 本轮 127，**+44 用例，无删除、无 skip** |

**测试抖动（如实记录）**：连跑 6 次，其中 2 次出现 `Unhandled Errors`，堆栈为
`EPERM ... \Temp\<随机>\web\<hash>` → `node-brokered-fs-shim.cjs` → `vitest resolveConfig`。
这是**评审方宿主沙箱拦截 vitest 缓存写入**，不是产品缺陷；发生时文件收集退化为 5 files / 100 tests，用例本身无一失败。
→ 归因为环境，不计缺陷；但**根治建议保留**（见 🟡-3）。

### 2.2 架构铁律

| 检查 | 结果 |
|---|---|
| `src/core/` 含 vue / pinia / element-plus | ✅ 零匹配 |
| `src/ui/`、`src/views/` 含 `CanIf|DemDtc|CanSM|PduR` | ✅ 零匹配（模块仍可插拔） |
| `: any` / `@ts-ignore` / `@ts-expect-error` | ✅ 零匹配 |
| `eval(` / `innerHTML =` | ✅ 零匹配 |
| 新增依赖 | ✅ `package.json` / lock 无改动，沿用既有 `fast-xml-parser` |
| core/io 依赖方向 | ✅ 仅相对路径内部模块 + `@/utils/uuid` |

### 2.3 XXE 攻击矩阵（我自建 11 个变体，真实 secret 文件）

用 `file://` 指向含 canary 的真实临时文件，逐个导入：

| 变体 | 结果 |
|---|---|
| 标准 `<!DOCTYPE` + 外部实体 | REJECTED（禁止 DTD/DOCTYPE 与外部实体） |
| 小写 `<!doctype` | REJECTED |
| 关键字间插空白 `<!   DOCTYPE` | REJECTED |
| 外部 DTD 子集 `SYSTEM "file://…"` | REJECTED |
| 参数实体 `<!ENTITY % ext …> %ext;` | REJECTED |
| 内部实体展开 | REJECTED |
| 裸 `<!ENTITY` 无 DOCTYPE | REJECTED |
| 注释包裹 DOCTYPE | REJECTED |
| 零宽字符拆分关键字 `<!DOC\u200BYPE` | REJECTED |
| CDATA 包裹 ENTITY | REJECTED |
| XInclude `xi:include href="file://…"` | 拒绝（未命中单一 ECUC 模块校验，且不被展开） |

**附加断言**：`fetch` 调用 0 次；`fs.readFileSync` 对 secret 文件调用 0 次；任何返回结果不含 canary 字符串。

**深度与体积**：400 层嵌套 → `XML 嵌套过深（上限 300 层）`；未闭合注释 → `XML 格式错误`；51 MB → 拒绝；1 KB → 通过。

**界面路径同样生效**：通过真实浏览器把含 `file:///C:/Windows/win.ini` 的 ARXML 拖进导入弹窗，界面显示
`导入失败：禁止 DTD / DOCTYPE 与外部实体，文件未被解析`。

### 2.4 ARXML 结构（独立 DOMParser 断言）

```
parsererror = null
AUTOSAR.namespaceURI = http://autosar.org/schema/r4.2.2
ECUC-CONTAINER-VALUE ≥ 7，全部带 UUID
全部 UUID 全局唯一（Set.size == 数组长度）
ECUC-NUMERICAL/TEXTUAL-PARAM-VALUE 全部带 UUID
全部 DEFINITION-REF 以 /AUTOSAR/EcucDefs/Dem 开头
回读后参数值相等、非空引用 targetUuid 相等
```

### 2.5 事务性（我自己构造，不靠它的用例）

| 断言 | 结果 |
|---|---|
| `planImport` 后基线配置序列化文本**逐字节不变** | ✅ |
| `result` 是独立对象（`not.toBe(config)`） | ✅ |
| 候选序列化文本 ≠ 基线（确实改了） | ✅ |
| 三策略均不改动基线 | ✅ |
| `skip` 冲突 1，`overwrite` 冲突 1，`rename` 新增容器 +1 | ✅ |
| 同路径不同定义 | ✅ 拒绝，且拒绝点在 `hydrateConfig`（比 `ImportPlan` 的守卫更早） |

### 2.6 CSV

`\uFEFF` 开头、表头 `DtcValue(hex),Severity,WWH-OBD Class,Attributes 名,EventId`、十六进制输出、引号成对。

### 2.7 界面实操（真 Chrome，1400×900）

| 操作 | 实测 |
|---|---|
| 三栏宽度 | 左 **212px** / 中 **240px**（与 SPEC 一致，未回退） |
| 底部添加入口 | `.empty-children` details 默认 `open=false`，summary 文案 `＋ 添加子容器`；展开后 6 个竖排 `＋ 添加…` → **🟠-1 已修** |
| 工程右键 | 9 项 + 2 分隔线；导入/导出已启用；自动计算仍禁用且 `title="未核实，待补充截图"` |
| 导入子菜单 | `JSON` / `ARXML` 两项 |
| 四列冲突表 | 表头严格 `冲突实例路径 \| 参数名 \| 文件生成值 / 文件引用值 \| 工程配置值 / 工程引用值` |
| 真实冲突渲染 | `DemConfigSet/DemDTC \| DemDtcValue \| 42 \| 1`、`… \| DemDTCFunctionalUnit \| 7 \| 0` — 参数名用 BSWMD shortName，可读 |
| 三策略计数 | rename 6/27/2、skip 5/22/2、overwrite 5/22/2 |
| 应用覆盖 | 弹窗关闭、无错误，`DemDtcValue` 变为 **42**、`DemDTCFunctionalUnit` 变为 **7** |
| 模块页签 tooltip | `title="模块：Dem\n配置集：TASK005验证集"` 分行 → **🟡-1 已修** |
| 控件列对齐 | 3 行控件宽度均 **270px**，右边界均 **1077px** → **🟡-2 已修** |

---

## 三、问题清单

### 🔴 阻塞项：无

### 🟠-1 `processEntities: true` 形成单点防御，纵深不足

**位置**：`src/core/io/Arxml.ts:155-161`

**事实**：安全完全依赖 `xmlPreflight` 的 `/<!\s*(?:DOCTYPE|ENTITY)\b/i` 前置正则；一旦放行，交给
`new XMLParser({ processEntities: true })` 的解析器**具备实体展开能力**。

**我的实测结论是「当前不可利用」**：XML 规范内实体只能由 DTD/DOCTYPE 声明引入，该入口已被前置拦截；
11 个变体（含零宽、大小写、空白、参数实体、外部子集）全部拒绝，未读到文件、未联网。
因此**不阻塞本轮批准**。

**但它仍是工程缺陷**：正则与解析器之间存在"约定耦合"——未来任何一次正则调整、编码处理前置、
或改用流式解析，第二道防线会同时失效且无告警。

**修复要求（下一轮完成）**：二选一
1. 改用 `processEntities: false`，并在解析后手工还原 5 个 XML 内建实体（`&lt; &gt; &amp; &quot; &apos;`）；或
2. 保留 `true`，但在解析入口加**声明剥离**步骤（把 `<!DOCTYPE …>` 整段替换为空再解析），使"展开"能力无输入可展开，并补一条断言该剥离发生的测试。

### 🟡-1 合法文件因注释里提到 `<!DOCTYPE` 被误拒

`<!-- 本文件不含 <!DOCTYPE> 声明 -->` 这类注释会被当作攻击拒绝。属误报，影响极小（工具生成的 ARXML 注释里极少出现该字样），但错误信息应区分「检测到声明」与「文本中出现字样」。
建议：前置正则改为跳过注释段后再匹配，或把该错误归入二级提示。

### 🟡-2 ARXML 单文件仅支持一个 ECUC 模块配置

`importArxml` 要求「包含且仅包含一个 ECUC 模块配置」。这与本轮契约一致，但真实 DaVinci 导出常为单文件多模块。
建议在下一阶段明确：要么支持多模块拆分导入，要么在 UI 上给出「请按模块分别导出」的引导文案。**记录为范围说明，非本轮缺陷。**

### 🟡-3 建议显式指定 vitest `cacheDir`，根治宿主临时目录被拦

连续 6 次运行有 2 次因 `EPERM` 写 `%TEMP%\…\web\…` 失败而退化收集。
建议在 `vite.config.ts` 的 `test` 段加 `cacheDir: 'node_modules/.vite-test'`（或 `.vitest-cache`），使缓存落在项目内，不依赖宿主临时目录权限。上轮已提，本轮仍未处理。

### 🟡-4 未知 `definitionRef` 的错误信息不含期望值

`importJson` 报 `/DemConfigSet/DemDTC：参数 definitionRef 未知或重复`，未说明"应为哪个定义""冲突的是哪一条"。
建议补上期望定义与出现次数，便于用户定位手工改坏的文件。

### 🟡-5 参考图仍以二进制形式在库内（承 TASK-004 🟡-4）

`.codex/references/easysar-2026-11-01/` 约 870 KB 图片入库。不影响功能，建议后续移到仓库外或压缩。

---

## 四、契约验收逐条核对

| 契约项 | 判定 | 证据 |
|---|---|---|
| A1 JSON 导出 | ✅ | 我的 §2.5、界面 `导出 › JSON` |
| A2 ARXML 导出 r4.2.2 | ✅ | §2.4 DOMParser 断言 |
| A3 CSV 导出 | ✅ | §2.6 |
| A4 无活动配置禁止导出 | ✅ | 代码 `exportConfig` 抛「请先打开配置集」 |
| B5 导入预览 | ✅ | §2.7 界面实测 |
| B6 四列对比 | ✅ | 表头 + 两行真实数据 |
| B7 三策略 | ✅ | 计数与覆盖结果实测 |
| B8 四项计数 | ✅ | 新增容器/参数、冲突、删除 |
| B9 确认后单次写入 | ✅ | 代码 `setItem` 单次原子写 + 我的基线不污染断言 |
| B10 取消无写入 | ✅ | 代码路径 + 界面取消后工程值未变 |
| C11 DTD/实体拦截 | ✅ | §2.3 11 变体 |
| C12 大小/深度上限 | ✅ | §2.3 |
| C13 无执行/HTML 注入 | ✅ | 无 `eval`/`innerHTML`；模板插值为文本 |
| C14 统一错误提示 | ✅ | 界面显示中文错误 |
| D15 🟠-1 修复 | ✅ | `.empty-children` 折叠 + 工具栏 ＋ 主入口 |
| D16 🟡-1 修复 | ✅ | tooltip 分行 |
| D17 🟡-2 修复 | ✅ | 270px / 右边界 1077 对齐 |
| 既有 83 用例保留 | ✅ | 127 ≥ 83，无删除（两处断言为功能升级同步） |
| `src/core` 零 UI 依赖 | ✅ | grep 零匹配 |
| 未写死案例模块 | ✅ | grep 零匹配 |

**20 / 20 项通过。**

---

## 五、两处既有测试改动，我逐行核过（不视为放水）

| 文件 | 改动 | 我的判断 |
|---|---|---|
| `tests/replica.test.ts` | 禁用菜单项断言 5 → 4 | **合理**：导入由禁用变可用，禁用项减少 1。我已实测右键菜单确实 4 个禁用（新建/工程管理/自动计算/…）且导入可用。 |
| `tests/ui.test.ts` | 先展开 `.empty-children`，按钮文案加 `＋ ` | **合理**：对应 🟠-1 的折叠改造。我已实测 details 默认关闭、summary 文案与按钮文案一致。 |

两处均为**功能演进导致的断言同步**，非降低标准；用例总数由 83 增至 127，无 skip、无删除。

---

## 六、判定

**APPROVED**。TASK-005 的 20 项契约全部达成，84 项验收要点（功能/安全/工程）逐条有我的独立证据支撑。
🟠-1 不阻塞但**必须**在下一轮随任务一并修复；🟡-2 为范围说明需在后续明确。

下一任务：TASK-006（DEM 编辑体验闭环：撤销重做、批量修改、悬空引用高亮、全局搜索、主题切换），并入 🟠-1 与 🟡-3、🟡-4。
