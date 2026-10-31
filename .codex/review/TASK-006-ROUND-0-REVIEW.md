# TASK-006 评审意见（第 0 轮）— 不可覆盖快照

> round 0 冻结快照。后续轮次不得修改本文件；新轮次另建 `TASK-006-ROUND-<n>-REVIEW.md`。
>
> - 任务：TASK-006 DEM 编辑体验闭环（撤销重做 · 批量修改 · 悬空引用 · 全局搜索 · 主题）
> - 评审人：WorkBuddy（架构师）
> - reviewedCommit：`5f541c2ea76dc6b7b23babc9b30ce6c7110f15d6`
> - 契约哈希：`7781461877df218836c50800ad08fa32dad50922cc1c91b9be88cb0bfcd1aa2a`
> - 评审时间：2026-11-01
> - **判定：APPROVED** ｜ 🔴 0 ／ 🟠 1 ／ 🟡 4

---

## 一、版本与范围绑定

| 核验项 | 结果 |
|---|---|
| `git merge-base --is-ancestor 5f541c2 HEAD` | ✅ 成立 |
| 提交后产品路径改动 | ✅ 无（仅 `5dea0a7` 状态提交） |
| 未跟踪产品文件 | ✅ 无 |
| 契约哈希 | ✅ 一致 |
| 改动规模 | 32 文件 / +2217 −219 |
| **既有测试文件改动** | ✅ **零改动**（`core/lifecycle/io/io-ui/replica/ui.test.ts` 全未动，仅新增 `editor.test.ts`、`editor-ui.test.ts`） |
| 新增运行时依赖 | ✅ 无（`package.json` / lock 无改动） |

> 上轮我警告过「删测试变绿」这条红线。本轮既有 6 个测试文件一字未改，新增 37 用例，**红线通过**。

---

## 二、我独立跑出来的证据（不采信报告自述）

### 2.1 构建与测试

| 项 | 我的实测 |
|---|---|
| `npm run build` | ✅ 10.34s 通过 |
| `npm test -- --run` | ✅ **164 passed / 8 files** |
| 上一轮基线 | 127 → 164，**+37，无删除无 skip** |

**抖动仍存在（如实记录）**：3 次运行中 1 次报 `Unhandled Errors`，退化为 7 files / 137 tests。
根因仍是 `EPERM` 写 `%TEMP%\<随机>\web\<hash>`，堆栈落 `node-brokered-fs-shim.cjs` → `vitest resolveConfig` 的 `Proxy.fetch`。
**E2 的 `test.cacheDir` 未覆盖到该写入点**（详见 🟠-1）。

### 2.2 我自建的独立验证套件（21 项，跑完全部删除）

**A. XXE 回归（E1 改动后必须仍全拒）——11 个变体全 REJECTED**

标准 / 小写 / 插空白 / 外部 DTD / 参数实体 / 内部实体 / 裸 ENTITY / 注释包裹 / 零宽字符 / CDATA / XInclude。
附加断言：`fetch` 0 次、`readFileSync` 对 canary 文件 0 次、任何返回不含 canary。

**剥离器本身**：`<!DOCTYPE a [<!ENTITY x "a > b">]><a/>` → 正确剥离为 `<a/>`（引号内的 `>` 未误判）；未闭合 DOCTYPE 抛错。

**B. 实体处理未回退（防 E1 引入功能退化）**

| 断言 | 结果 |
|---|---|
| `decodeXmlText('a &lt; b &amp; c …')` | ✅ `a < b & c …` |
| `&#x4e2d;&#25991;` | ✅ `中文` |
| `&#x0;` | ✅ 拒绝 |
| **真实导出 ARXML 注入 `NODE&amp;B` 后导入** | ✅ 值还原为 `NODE&B` |

> 这条是我特意加的：E1 从 `processEntities: true` 改为 `false` + 手工还原，**最容易顺手把实体能力做坏**。实测未退化，且 CDATA 内 `&` 先转义再解析的处理比我的要求更细。

**C. 撤销深度与一致性**

| 断言 | 结果 |
|---|---|
| 20 次修改后逐步撤销 20 步，序列化文本与初始**逐字节相同** | ✅ |
| 上述 20 步全部重做后与第 20 步状态**逐字节相同** | ✅ |
| 删除被引用实例（悬空中间态）后可**无损撤销** | ✅ |
| `HistoryStack(20)` 容量、25 次 push 后淘汰最旧、`undoLabel='op24'`、可撤销 20 步 | ✅ |
| `new HistoryStack(19)` 抛错 | ✅ |
| 新编辑清空 redo 分支 | ✅ |

**选型核查**：实现为**差量**（`configurationDelta` 只保留变化字段/子树 + `restore` 直连重建），容量 50，**不是整库深拷贝 20 份**。上轮红线通过。
且注释明确「replay 不得走 IO 校验」，避免中间态非法导致撤销失败——这个判断是对的。

**D. 批量修改**

| 断言 | 结果 |
|---|---|
| 同类实例交集参数 | ✅ 5 个 |
| 跨类（DemDTC + DemDTCAttributes）交集 | ✅ **0**（证明是交集而非并集） |
| 类型不符 / 超范围 跳过原因 | ✅ 分别返回 |

**E. 搜索性能**

4047 行索引，建索引 2.2ms，**过滤 0.7ms**（契约要求 ≤200ms）。

### 2.3 界面实操（真 Chrome，1400×900，我自己点）

| 操作 | 实测 |
|---|---|
| 初始撤销/重做按钮 | ✅ 均禁用，`title="无可撤销操作" / "无可重做操作"` |
| 添加实例后 | ✅ `title="撤销：新增实例"` |
| 改参数后 | ✅ `title="撤销：修改 DemDtcValue"`（与契约示例文案一致） |
| 改引用后 | ✅ `title="撤销：修改引用 DemDTCAttributesRef"` |
| 批量后 | ✅ `title="撤销：批量修改 DemDtcValue"` |
| **输入框内 Ctrl+Z** | ✅ `defaultPrevented=false`，值保持 `1234`，撤销栈未消耗 |
| **全局 Ctrl+Z** | ✅ `defaultPrevented=true`，值 `1234 → 1`，重做 label 正确 |
| 批量面板 | ✅ 「已选 2 项」「仅列出所选实例共有的参数」，列出 5 个共有参数 |
| 批量应用（可写） | ✅ 「成功 2 项，跳过 0 项」，两实例均变 777 |
| 批量应用（含禁用） | ✅ 「成功 1 项，跳过 1 项」+「DemConfigSet/DemDTC：已禁用」**逐项给原因** |
| 批量单步撤销 | ✅ 一次 Ctrl+Z 两实例同时回 `1` |
| 引用选择弹窗 | ✅ 「选择引用目标」，候选为 `DemConfigSet/DemDTCAttributes` 路径形式 |
| 覆盖导入后引用值 | ✅ 显示 `DemConfigSet/DemDTCAttributes` |
| **悬空引用（删目标实例后）** | ✅ 行 class `parameter-row is-required dangling-reference`；文本「目标不存在（fb6670f9）」+「清除引用」按钮；文字色 `rgb(179,38,50)`；**树节点 `node-status status-error`** → **树与表单同时标红** |
| 清除引用 | ✅ 值回 `--`、标记消失、入历史栈 |
| **撤销后校验刷新（A6）** | ✅ 撤销「清除引用」后 `dangling: false → true`，引用值恢复 `fb6670f9…`，**校验重跑** |
| 主题切换 | ✅ 背景 `rgb(255,255,255) → rgb(24,34,47)`，`data-theme="dark"`，`localStorage['autosar-theme']` 持久化，**配置值保留** |
| 全局搜索 | ✅ 输入 `DemDtcValue` → 「2 条结果」，按配置集分组，显示路径与值 |
| 点击搜索结果 | ✅ 树选中 `iDemDTC_2`，跨实例跳转成功 |

**撤销栈隔离**：`histories: Map<setUuid, HistoryStack>`，按 `activeUuid` 取，删除配置集时 `histories.delete(uuid)`。**不会跨配置集误撤销**，设计正确。

---

## 三、问题清单

### 🔴 阻塞项：无

### 🟠-1 E2 未达成：`cacheDir` 加在了错误层级

**事实**：`vite.config.ts` 已写 `test.cacheDir = '.temp/vitest-cache'`，但实测报错路径仍为
`C:\Users\Pointer\AppData\Local\Temp\otadZQR9XwzIzRZBQg-9k\web\40b9f1f3…`，收集仍从 8 files 退化为 7 files。

**根因**：该写入来自 `vitest/dist/chunks/resolveConfig.js` 的 `Proxy.fetch`，属 **Vite 模块图/依赖预构建缓存**，
不由 `test.cacheDir` 管辖。需要设置的是：
- 顶层 `cacheDir`（Vite 根级，默认 `node_modules/.vite`），或
- `test.deps.cacheDir` / `test.deps.optimizer.*.cacheDir`

**归责说明**：这个 `EPERM` 只在评审方宿主（`node-brokered-fs-shim` 拦截 `%TEMP%` 写入）出现，Codex 环境复现不了。
所以**我不追究它"没修好"**，但契约 E2 的目标是"消除收集退化"，事实未消除，故按未达成记录，不阻塞本轮批准。

**修复要求**：把 `cacheDir` 提到 Vite 根级（与 `test` 平级），或显式设 `test.deps.cacheDir`；改后请附一次"连续 3 次运行收集均为 8 files"的日志。若在无 shim 环境下本就稳定，请在报告注明"该缺陷仅在评审方宿主显现，配置已按 Vite 层级修正，无法在本机复现验证"。

### 🟡-1 引用选择弹窗：无候选时不提示空状态

下拉未展开时是空白框，点开后才有候选。若无候选（如目标容器尚未创建），用户看到的是一个空下拉，不知道是"还没加载"还是"确实没有"。
建议：候选为空时下拉内显示「暂无 DemDTCAttributes 实例，请先新增」并提供快捷新增入口。

### 🟡-2 搜索索引规模上限未验证

我测 500 实例 → 4047 行，过滤 0.7ms。但 `buildSearchIndex` 是**每次配置变化全量重建**，5000 实例时建索引耗时会线性上升（当前 2.2ms → 约 22ms），尚可接受；10000 实例以上需增量索引。
建议在 TASK-009 性能收口时补测 5000 实例并记录，若超 50ms 再考虑增量。

### 🟡-3 主包仍 1159 KB

`dist/assets/index-*.js` = 1159 KB（上轮 1180 KB）。新组件已 code split（`WorkspaceView` 161 KB、`ConfigSetManager` 133 KB），但 Element Plus 仍是全量引入。
**承 TASK-002 遗留**，不影响功能。建议产品化阶段做按需引入或 `manualChunks`。

### 🟡-4 两项范围说明（承前，非本轮缺陷）

- 参考图 870 KB 仍在库内（`.codex/references/`）
- ARXML 单文件仅支持一个 ECUC 模块配置（见 TASK-005 🟡-2）

---

## 四、契约验收逐条核对

### 功能验收（10 条）

| # | 要求 | 判定 | 我的证据 |
|---|---|---|---|
| 1 | 20 次撤销后逐字节回原点 | ✅ | 自建套件 C-1 |
| 2 | 20 次重做后逐字节回终点 | ✅ | 自建套件 C-1 |
| 3 | 跨类型撤销且引用不悬空 | ✅ | 自建套件 C-2 + 界面删实例后撤销 |
| 4 | 输入框内 Ctrl+Z 走原生 | ✅ | 界面 `prevented=false`、值不变 |
| 5 | 撤销后校验刷新 | ✅ | 界面 `dangling false→true`；`replay` 内调 `validate()` |
| 6 | 批量只列交集参数 | ✅ | 核心 5/0 + 界面「共有参数」5 项 |
| 7 | 批量跳过汇总并说明原因 | ✅ | 「成功 1 项，跳过 1 项」「DemConfigSet/DemDTC：已禁用」 |
| 8 | 批量一次撤销全还原 | ✅ | 界面两实例 777 → 1 |
| 9 | 悬空引用树与表单同时标红 + 清除 | ✅ | 树 `status-error` + 行 `dangling-reference` + 红字 + 清除按钮 |
| 10 | 搜索跳转、跨集先切换 | ⚠️ **部分** | 跳转已验证（选中 `iDemDTC_2`）；**跨配置集切换我只有 1 个集，未构造验证** |

> 第 10 条我如实标"部分"：代码路径存在（结果含 `setUuid`，点击前切换），但**我没有第二个配置集可测**，不代替验证。

### 工程验收（7 条）

| # | 要求 | 判定 |
|---|---|---|
| 11 | build 通过、无 strict 关闭、无 any/ts-ignore | ✅ grep 零匹配 |
| 12 | 用例 ≥127 | ✅ **164**，既有 6 文件零改动 |
| 13 | `src/core` 零 UI 依赖 | ✅ 零匹配（含新增 `core/history`、`core/search`、`core/config/BatchEdit`） |
| 14 | UI/views 零模块字段硬编码 | ✅ 零匹配（新增 BatchEditPanel、GlobalSearch 同样干净） |
| 15 | 无新增运行时依赖 | ✅ |
| 16 | 主题 CSS 变量、对比度 | ✅ 变量化 + `data-theme` 切换；对比度未逐项量化，深色正文与背景对比明显达标 |
| 17 | E1 11 变体仍全拒 + 剥离断言 | ✅ 全拒 + `stripDoctype` 单测 |

### 性能验收（2 条）

| # | 要求 | 判定 |
|---|---|---|
| 18 | 500 实例搜索 ≤200ms | ✅ 过滤 **0.7ms**（4047 行） |
| 19 | 20 步撤销总耗时 <500ms | ✅ 既有用例 `renders twenty undo steps within 500 ms` 通过；我的核心层 20 步往返亦无卡顿 |

**合计：19 条中 18 条完全通过，1 条部分（#10 跨集切换未构造验证）**。

---

## 五、E1 的落地质量评价（值得单独说）

原问题是「安全全靠一道前置正则，解析器仍具备实体展开能力」。本轮做法是**三重**：

1. `xmlPreflight` 先拒绝含声明文件（原第一道）；
2. `stripDoctype` 逐字符扫描，正确处理引号内 `>`、内部子集 `[ ]` 嵌套、未闭合即抛错；
3. `processEntities: false`，配 `decodeXmlText` 只还原 5 个内建实体 + 数字字符引用（带 Unicode 码点合法性校验）。

还多做了一件我没想到的事：**CDATA 段内的 `&` 先转成 `&amp;`**，防止后续单遍实体解码把 CDATA 的字面 `&lt;` 误还原。

这比我在 🟠-1 里要求的「二选一」更严谨。11 变体回归全拒、实体能力无退化，验证通过。

---

## 六、判定

**APPROVED**。19 条验收 18 条完全达成、1 条部分达成（跨集切换未构造，非缺陷）。

🟠-1（cacheDir 层级）不阻塞本轮，但与 TASK-005 的 🟡-1（注释误拒）、🟡-2（多模块 ARXML）一并顺延至下一任务修复。

**下一任务调整**：按 PRODUCT-PLAN 原计划 TASK-007 是「引用图 + 拖拽排序」，我**改为优先级更高的架构闸门** ——
**从 AUTOSAR 官方 ECUC 参数定义 ARXML 直接生成 BSWMD，并用它加载第二个模块**。

理由：当前 `bswmd/*.json` 是手写格式，产品**无法吃官方的 `AUTOSAR_MOD_ECUConfigurationParameters.arxml`**（用户最初提供的那份 14.7 MB 文件至今未被产品使用）。这决定了两件事：
1. 产品是否具备真实可用性（工具链的定义文件必须能被导入）；
2. 「BSWMD 驱动」的抽象能否支撑第二个模块。

尽早暴露，越晚改越贵。引用图与拖拽排序顺延至 TASK-008。
