# TASK-008 交付报告

> **round 0 分批交付，依据 ACTIVE §5。本轮完成 A1–A5、C1–C5；B1–B4（NvM CHOICE）未实施，保留现有明确拒绝导出的保护，交后续轮次。** 本报告是 Codex 的实现自检，不是 WorkBuddy 评审结论。没有进行真实浏览器验收。

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 事件 | TASK-008 / 1c1c192f52e32e036e2d732d |
| 轮次 | 0 |
| 完成时间 | 2026-11-01T04:20:17+08:00（本机实时时钟；上游文件时间未改） |
| 基线 | `825265c46c73ae4551405ed35a6d042799a681fd` |
| 契约哈希 | `6bff40df368117d78fac1477fbd916c1cc70fc9c15131f912effe4d43328ed77`，开始时核对一致 |
| 构建 | `npm run build` 通过，严格类型检查与生产构建均成功 |
| 全量测试 | **13 files / 236 tests passed**；原 206 个用例全部保留，新增 30 个 |
| 交接 | 代码/测试/本报告先提交；单独提交 STATE 的允许 task 字段，绑定完整代码 SHA，再正常推送 |

开始时工作树干净，STATE 为 TASK-008 / READY / round 0。WorkBuddy done 和 synced 均绑定基线提交，busy 文件不存在。仓库没有 `.codex/decisions` 目录或 ADR 文件。未修改契约、阶段、评审、协议或调度文件，未启动子代理。

用户界面要求已由父任务完成，偏好文件明确本轮不再启动常驻服务。既有预览地址为 `http://127.0.0.1:3000/workspace`，由父任务管理；本轮没有重新启动或关闭它。

## 交付对照

| 编号 | 文件 | 实现与证据 |
|---|---|---|
| A1 | `src/core/io/Arxml.ts`、`ConfigTypes.ts`、`ConfigInstance.ts`、`configStore.ts` | 参数/引用均只有 `isConfigured === true` 且有值/目标才生成 ECUC 值节点。引用新增显式布尔状态，创建 false、选定 true、清空 false；快捷新增目标也设 true。外部引用不被伪造 |
| A2 | `Arxml.ts` | 导出前逐定义检查所有已实例化容器的必填参数；缺少字段、false 状态、有默认建议但未确认、已配置却 value=undefined 均抛错，汇总完整实例/字段路径；不改源配置、不填默认值绕过 |
| A3 | `Arxml.ts` | 可选 undefined 参数及空引用不生成值节点。通过 ADMIN-DATA 仅保留显式清空/禁用状态，避免往返丢失既有的 `isConfigured=true,value=undefined` 编辑状态 |
| A4 | `Arxml.ts`、`ConfigJson.ts`、`ConfigValues.ts`、`ConfigTypes.ts` | 容器输出/读取 DESC；缺 DESC 时回填 BSWMD。参数值增加 description，由定义初始化/水合；外部参数 DESC 优先，覆盖描述保存在容器编辑器 SDG 中。空描述、转义字符与前后空白有测试 |
| A5 | `Arxml.ts` | 模块 ADMIN-DATA/SDGS 保存 createdAt、lastModified（毫秒整数字符串），导入保留；无此元数据的外部文件只在首次导入取当前时间。0 和不同时间戳重复三次往返仍原样，非法时间戳拒绝而非替换 |
| B1 | 未实施 | 本轮不增加 CHOICE 元数据；仍是上一轮分组/候选保留模型 |
| B2 | 未实施 | 本轮不宣称互斥选择或切换提示已完成 |
| B3 | 未实施 | 保留 NvM 的 arxmlExportBlockers，未将其降级成警告后导出 |
| B4 | 未实施 | 不宣称 NvM 完整 ARXML 往返通过 |
| C1 | 原用例 + `arxml-editor.test.ts`、`arxml-fidelity.test.ts` | Dem 配置/校验/C/gcc/JSON/ARXML/CSV/撤销/批量/搜索/主题用例全绿；增加同值建议确认、标志撤销重做和旧存储迁移验证 |
| C2 | 原 `ecuc*.test.ts` + 新保真测试 | CanIf 官方样本解析、定义导入、编辑、ARXML 导出/回读均通过；25 个必填参数显式确认后只写 25 个 VALUE，20 个未配置可选项省略；描述/标志/时间戳/结构保持 |
| C3 | 本报告“既有用例变更”及附录 | `ecuc.test.ts` 零修改；`io.test.ts` 调整导出测试前置及节点数，增加逐字段标志断言。全部旧断言保留，唯一旧预期 31→15，原因逐项说明 |
| C4 | 静态扫描 | `src/core` 零 Dem/NvM/CanIf 字面量；零 vue/pinia/element-plus 依赖；无新增 any/ts-ignore |
| C5 | Git diff | package.json/package-lock.json 均未修改，无新增运行时依赖 |

其他相关改动：`ConfigClone.ts` 在跨子树目标被清空时同步清空引用配置标志；`configStore.ts` 不再忽略“把未配置建议显式设为相同值”的操作，因此该确认可以进入历史并持久化。JSON 与旧本地数据没有引用标志时，仅依据非空 targetUuid 迁移；显式 false 原样保留。

## 导出语义前后对比

修前证据来自真实 TASK-007 评审及基线用例；修后为本轮实际测试。

| 场景 | 修前 | 修后 | 往返结果 |
|---|---|---|---|
| Dem 原评审复现：7 容器、31 参数、仅 DemDtcValue 已配置 | 导出 31 个 VALUE；全变 true | **拒绝导出**，其余 14 个必填参数仍未确认，例如 `DemConfigSet/DemDTC/DemDTCSeverity` | 未输出文件，不伪造配置 |
| Dem 原 IO fixture：显式确认全部 15 个必填参数，16 个可选仍未配 | 原断言 31 VALUE | **15 VALUE + 16 省略** | 每个参数和引用的 isConfigured 逐项相同；原值/实例路径/引用目标断言仍通过 |
| Dem 仅默认根容器：4 个可选参数，仅配置其中 1 个 | 旧算法会写 4 个 | **1 VALUE + 3 省略**；DEFINITION-REF 精确指向该项 | 标志、描述、结构和时间戳相同 |
| CanIf 新建：45 参数，全部未配置 | 45 VALUE；全部 true | **拒绝导出**，逐一列出 25 个必填参数 | 不产生误导性文件 |
| CanIf 显式确认 25 个必填，20 个可选未配置 | 旧算法仍写 45 个 | **25 VALUE + 20 省略** | 标志、容器、描述、值和两个时间戳相同；UUID 唯一 |
| 通用全可选模块，全未配置 | 旧算法写默认建议值 | **0 个参数值、0 个引用值、0 个 VALUE** | 所有标志仍 false |

因此，验收第 2 条的“一项配置只写一个 VALUE”在无其他未配置必填项的 Dem 根容器场景验证；原 31 参数复现因 A2 必须拒绝，不能一边严格拦截必填未配，一边让该不完整配置成功导出。未改定义把必填降成可选，未修改契约。

## 关键实现与兼容边界

1. `isConfigured` 是显式值的出口条件。参数 `0`、`false`、空字符串仍是合法已配置值，不用 truthiness 筛选。未配置字段水合为定义提供的编辑建议，始终带 false；这些建议不会被写成 ECUC 值。
2. `ConfigValues.ts` 提取原管理器已有的默认建议逻辑，供新建和 ARXML 缺失字段恢复共用；没有修改模块默认规则，也不会确认必填字段。未配置状态下手工改过的缓存值不属于 ECUC 配置语义，往返恢复的是定义建议；未确认引用的缓存目标同样不写出。
3. 编辑器 SDG 标识为 `AUTOSAR-BSW-CONFIG-TOOL-V1`。模块保存 createdAt/lastModified/name；容器只保存被清空字段的 definitionRef+isConfigured 及参数描述覆盖。**不在 SDG 保存未配置参数的默认值，不复制整个配置快照，不靠旁路快照掩盖 ECUC 解析结果。** 正常已配置值只由真实 VALUE/VALUE-REF 解析。
4. 保留显式禁用状态是为了兼容已有 UI 的“关掉可选项”行为（原测试要求 true+undefined）；仅靠缺失 XML 节点无法区分它与从未操作的 false 状态。其他工具删除编辑器 SDG 后，ECUC 值含义不变，但无法保留本工具独有的禁用历史、描述覆盖和时间戳。没有私有元数据的外部文件仍可导入。
5. A2 仅新增契约要求的必填**参数**出口检查。既有通用规则继续负责范围、引用必填和引用目标校验；本轮没有额外把跨模块必填引用作为新的导出阻断项。实际已配置却目标不在文件内的引用仍明确拒绝。CanIf 的 3 个跨模块必填引用仍未选定、false、被省略，未宣称这些跨模块目标已解决。
6. XML 的容器 DESC 使用 L-2；参数描述在定义/编辑器元数据中保留，不给本工具产出的普通参数 VALUE 节点新增非标准 DESC 子项。引用标志在 JSON、本地恢复、快捷新增、克隆和撤销重做链路均覆盖。
7. SDG 值和属性转义，拒绝重复编辑器字段、非法状态、无效时间戳，以及“禁用元数据 + 同时含实际 VALUE”的矛盾输入。原 DTD/ENTITY/XInclude 拒绝及实体单次解码逻辑未改。

实现时核对了 AUTOSAR 官方的 [ECU Configuration 参数值结构](https://www.autosar.org/fileadmin/standards/R23-11/CP/AUTOSAR_CP_TPS_ECUConfiguration.pdf)、[RTE 配置 ADMIN-DATA 示例](https://www.autosar.org/fileadmin/standards/R21-11/CP/AUTOSAR_SWS_RTE.pdf) 和 [AdminData/SDG 使用说明](https://www.autosar.org/fileadmin/standards/R24-11/AP/AUTOSAR_AP_TR_VSSRepresentation.pdf)。本工具的 GID/字段命名是本轮实现选择，不是 AUTOSAR 标准字段；没有执行完整 AUTOSAR XSD 验证。

## CHOICE 语义方案（本轮未实施）

按契约允许的两轮范围，本轮先完成导出语义地基。现有 `NvMTargetBlockReference` 分组及两个候选继续原样保留，`arxmlExportBlockers` 仍生效。

后续仍须落实 B1 的分组/候选元数据，B2 的互斥选择及丢配置确认，B3 的仅选中候选 ARXML 表达和 B4 的结构/候选/值/标志往返证明。本报告没有把这一待实施方案当作已交付，未改写契约或自行启动下一轮。

## 不退化证据与验收自检

| 验收项 | 结果 |
|---|---|
| 1 CanIf 未配置不导出 | 45 项均未配时抛出包含全部 25 个必填字段路径的错误；没有默认值文件 |
| 2 Dem 部分配置 | 仅根容器、1 项配置 → 1 VALUE 且定义路径正确；原 31 项复现按 A2 拦截，见对比表 |
| 3 isConfigured 往返 | 通用、Dem、CanIf 参数与引用逐项比对；可选 true+undefined 和空引用状态另有测试 |
| 4 全未配置往返 | 通用全可选模块 0 VALUE，回读后全 false |
| 5 描述 | 定义回填、容器 DESC、空描述、特殊字符、外部参数 DESC 再导出覆盖均通过 |
| 6 时间戳 | createdAt=0、lastModified 独立，时钟推进后三次往返不变 |
| 7–10 NvM CHOICE | **未完成，按 §5 分批保留**；已有拒绝导出用例继续通过 |
| 11 build | 通过 |
| 12 测试 | 236/236，≥205；原 206 未删除/跳过，新增 30 |
| 13 核心层 | 零模块名，零 UI 依赖 |
| 14 依赖 | 无修改 |

Dem：既有 45 条 core（含 gcc -Werror 编译 C）、15 条生命周期、27 条 IO、17 条 IO 界面、28 条 editor、9 条 editor 界面、8 条复刻、15 条 UI 均通过。覆盖既有 JSON 全量恢复、CSV、导入三策略、二十次撤销重做逐字节恢复、批量修改、搜索和主题。

CanIf/NvM 定义导入：原 `ecuc.test.ts` 32 条与 `ecuc-ui.test.ts` 9 条均未修改且全通过。CanIf 新增实际 fixture 的导出回读；NvM 继续验证旧能力及明确导出限制。界面相关证据是 jsdom/组件交互，**不等同于真实浏览器操作或绘制测量**。

## 既有用例变更（C3）

完整逐行 diff 见本报告附录。每组改动的理由如下，未列出的旧测试文件没有变化：

| 文件/改动行组 | 理由与覆盖保持 |
|---|---|
| `io.test.ts` 新增 arxmlFixture 的每行 | 先复用原 7 容器 fixture；遍历定义中必填字段，经公共 setter 显式确认当前值；没有改定义 isOptional、没有全量设 true，保留 16 个可选未配置字段；只供 ARXML 成功路径使用 |
| `io.test.ts` 五处 fixture→arxmlFixture | 分别是结构/路径、文本转义、前缀与无 UUID、错误输入、rename 冲突测试。A2 要求先具备可导出的必填配置才能测试后续行为，原测试主体与断言均保留 |
| `io.test.ts` `toHaveLength(31)`→15 | 旧 31 的断言正是缺陷；15 个显式必填应输出，新增 16 个未配置计数，并保留全部值比较、路径、UUID、引用目标断言 |
| `io.test.ts` 新增两组 isConfigured 映射比较 | 对每个容器每个参数/引用逐 UUID 比较，不以“值相等”替代状态语义；增强旧断言覆盖 |
| `editor.test.ts` import + 两处 completeDemArxml | 两个 XML 安全/CDATA 用例只补合法导出前置，安全/解码原断言一个未减 |
| `io-ui.test.ts` import + 两处 completeDemArxml | 本地 ARXML 文件预览、三格式下载用例补显式必填前置；仍断言值 88、三个真实下载调用及 MIME/菜单/tooltip |
| `lifecycle.test.ts` 两处手工引用对象增加 isConfigured=true | 测试构造回环/自引用时明确是已配置引用，适配类型新增字段；原克隆/UUID/隔离断言全部保留，Prettier 仅将对象换成多行 |
| `ecuc.test.ts` | **零改动**，32 个既有用例与断言全部保留 |

新增 `tests/helpers/completeDemArxml.ts` 仅用于测试前置：建立真实 Attributes 目标，再通过管理器显式设置必填参数和 DTC 引用，不修改生产定义或忽略校验。新增保真测试额外保留原 31 字段/仅 1 项配置的失败复现，证明未把错误场景从覆盖中移除。

## 自检日志

原始日志：`.temp/task008-tests-final.log`、`.temp/task008-build-final.log`（不入库）。关键原文：

```text
$ npm test -- --run
CanIf: 45 suggestions blocked; 25 confirmed required parameters exported; flags/timestamps/descriptions equal
Test Files  13 passed (13)
     Tests  236 passed (236)
  Duration  9.86s

$ npm run build
> vue-tsc --noEmit && vite build
vite v5.4.21 building for production...
✓ 1850 modules transformed.
✓ built in 9.46s

$ rg -n 'NvM|CanIf|Dem' src/core
（无匹配）
$ rg -n '(from|import).*\b(vue|pinia|element-plus)\b' src/core
（无匹配）
$ rg -n '(:|as)\s+any\b|@ts-ignore' src/core src/stores/configStore.ts
（无匹配）
$ git diff -- package.json package-lock.json
（无差异）
$ git diff --check
（无 whitespace 错误；Git 提示已有 CRLF 自动转换策略）
```

普通沙箱首次测试在 esbuild 启动处出现 spawn EPERM；随后按受控 require_escalated 流程获得执行许可，测试/构建正常运行，没有使用绕过选项。最初全量测试的 4 个失败来自旧成功路径缺少显式必填前置，按上述逐项修改后通过。新增测试中曾额外阻断必填引用，发现与 CanIf 既有跨模块限制冲突后移除该超出 A2 的检查；最终只实现契约要求的必填参数检查。既有主包 >500KB 和直接挂载组件的 Vue Router 提示仍存在，未隐藏。

## 未完成与限制

1. B1–B4 及 NvM 完整 ARXML 往返未完成；CHOICE 导出保护保持，需后续轮次。
2. 时间戳、显式禁用的历史标志、参数覆盖描述依赖本工具 SDG；第三方剥离它后无法恢复原始编辑器元数据，但不会把未配置项变成 ECUC 值。
3. 跨模块引用选择、完整 schema 验证不是本轮已实现能力。CanIf 回归不声称三条尚未配置的跨模块引用已满足下游生成要求。
4. 未做真实浏览器验收；未改 UI 布局，已有展示页由父任务保留。

## 待确认

无阻塞本轮 A/C 范围的架构决策。B 组按契约 §5 留后续轮次，由 WorkBuddy 决定下发/返工；本轮不自行推进阶段或发送评审请求。

## 附录：既有测试逐行 diff

以下为本轮相对基线的实际 Git diff，配合上表解释每一组新增/替换行。`ecuc.test.ts` 无差异。

```diff
diff --git a/tests/editor.test.ts b/tests/editor.test.ts
index 6167646..51bddc2 100644
--- a/tests/editor.test.ts
+++ b/tests/editor.test.ts
@@ -14,0 +15 @@ import { initializeTheme, setTheme } from '../src/ui/Theme/theme';
+import { completeDemArxml } from './helpers/completeDemArxml';
@@ -327,0 +329 @@ describe('import hardening and diagnostics', () => {
+    completeDemArxml(store.config!, store.module!);
@@ -349,0 +352 @@ describe('import hardening and diagnostics', () => {
+    completeDemArxml(store.config!, store.module!);
diff --git a/tests/io-ui.test.ts b/tests/io-ui.test.ts
index 8779174..3397fab 100644
--- a/tests/io-ui.test.ts
+++ b/tests/io-ui.test.ts
@@ -9,0 +10 @@ import WorkspaceView from '../src/views/WorkspaceView.vue';
+import { completeDemArxml } from './helpers/completeDemArxml';
@@ -244,0 +246 @@ describe('import preview UI and project menus', () => {
+    completeDemArxml(store.config!, store.module!);
@@ -284,0 +287 @@ describe('import preview UI and project menus', () => {
+    completeDemArxml(store.config!, store.module!);
diff --git a/tests/io.test.ts b/tests/io.test.ts
index 26da01c..d651ce5 100644
--- a/tests/io.test.ts
+++ b/tests/io.test.ts
@@ -37,0 +38,12 @@ function fixture() {
+function arxmlFixture() {
+  const result = fixture();
+  // A value file now requires explicit choices for mandatory fields, including existing defaults.
+  for (const { container, definition } of collectContainers(result.config, result.module))
+    for (const parameter of definition.parameters.filter((p) => !p.isOptional))
+      result.manager.setParameterValue(
+        container,
+        parameter.uuid,
+        container.parameters.get(parameter.uuid)!.value
+      );
+  return result;
+}
@@ -118 +130 @@ describe('ARXML structure and security', () => {
-    const { config, module } = fixture();
+    const { config, module } = arxmlFixture();
@@ -134 +146,6 @@ describe('ARXML structure and security', () => {
-    expect(parameterNodes).toHaveLength(31);
+    expect(parameterNodes).toHaveLength(15);
+    expect(
+      collectContainers(config, module)
+        .flatMap((entry) => [...entry.container.parameters.values()])
+        .filter((p) => !p.isConfigured)
+    ).toHaveLength(16);
@@ -147,0 +165,18 @@ describe('ARXML structure and security', () => {
+      expect(
+        Object.fromEntries(
+          [...actual[i].container.parameters].map(([id, p]) => [id, p.isConfigured])
+        )
+      ).toEqual(
+        Object.fromEntries(
+          [...original[i].container.parameters].map(([id, p]) => [id, p.isConfigured])
+        )
+      );
+      expect(
+        Object.fromEntries(
+          [...actual[i].container.references].map(([id, r]) => [id, r.isConfigured])
+        )
+      ).toEqual(
+        Object.fromEntries(
+          [...original[i].container.references].map(([id, r]) => [id, r.isConfigured])
+        )
+      );
@@ -165 +200 @@ describe('ARXML structure and security', () => {
-    const { config, module, dtc, manager } = fixture();
+    const { config, module, dtc, manager } = arxmlFixture();
@@ -176 +211 @@ describe('ARXML structure and security', () => {
-    const { config, module } = fixture();
+    const { config, module } = arxmlFixture();
@@ -213 +248 @@ describe('ARXML structure and security', () => {
-    const { config, module } = fixture();
+    const { config, module } = arxmlFixture();
@@ -241 +276 @@ describe('conflict preview and immutable merge', () => {
-    const { config, module, manager, root } = fixture();
+    const { config, module, manager, root } = arxmlFixture();
diff --git a/tests/lifecycle.test.ts b/tests/lifecycle.test.ts
index e360827..6c78f56 100644
--- a/tests/lifecycle.test.ts
+++ b/tests/lifecycle.test.ts
@@ -41 +41,5 @@ describe('core cloning and lifecycle availability', () => {
-    attributes.references.set('test-back', { definitionRef: 'test-back', targetUuid: dtc.uuid });
+    attributes.references.set('test-back', {
+      definitionRef: 'test-back',
+      targetUuid: dtc.uuid,
+      isConfigured: true,
+    });
@@ -80 +84,5 @@ describe('core cloning and lifecycle availability', () => {
-    nested.references.set('self', { definitionRef: 'self', targetUuid: nested.uuid });
+    nested.references.set('self', {
+      definitionRef: 'self',
+      targetUuid: nested.uuid,
+      isConfigured: true,
+    });
```
