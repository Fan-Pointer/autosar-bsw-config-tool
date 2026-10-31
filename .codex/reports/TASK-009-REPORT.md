# TASK-009 交付报告

> round 0 覆盖 A1–A4、B1–B4、C1–C5；未将 B3/B4 留到下一轮。本文为 Codex 实现与自检记录，独立评审由 WorkBuddy 执行。

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-009 / 0 |
| 完成日期 | 2026-11-01（本机 Asia/Shanghai） |
| 实现基线 | `8ec2b2c01e2e419f530ebb8f4d9ac16e334a4000` |
| 契约哈希 | `cf2a86f978694d46471354eca2d3617559fcac8e117d70fb2adc0bdfdc7fc0f0`，开工时核验一致 |
| 构建 | `npm run build` 通过，1858 modules，9.71s |
| 测试 | `npm test -- --run`：15 files / 252 tests 全部通过；新增 16 个用例，无删用例、无 skip |
| UI 证据边界 | Vue Test Utils + jsdom，操作真实 Element Plus 确认框与 document Ctrl+Z；没有宣称真实浏览器验收 |
| 预览 | 用户追加要求已由父任务完成；继续使用父任务管理的 `http://127.0.0.1:3000/workspace`，本 worker 未启动常驻服务 |

开工时工作树干净，WorkBuddy done/synced 均绑定上述基线，无 busy 租约。已完整读取规定文件；仓库不存在 `.codex/decisions`，检索也未发现 ADR 文件。未修改契约、规划、评审、阶段或调度文件。

## 交付对照与文件

| 编号 | 文件 | 实现与自检 |
|---|---|---|
| A1 | `src/core/bswmd/EcucArxmlImporter.ts` | 从内联 CHOICES 解析全部候选；保留 uuid、shortName、definitionPath、multiplicity、参数、引用及子容器。空候选明确拒绝。 |
| A2 | `src/core/bswmd/BswmdTypes.ts`、`BswmdParser.ts` | 可选 `choice.candidateRefs` 指向 `subContainers` 内的候选定义；不复制定义树。JSON 定义加载校验候选覆盖、唯一性并保留定义路径。 |
| A3 | `src/core/config/ConfigInstance.ts`、新增 `ChoiceSelection.ts`、`src/core/io/ConfigJson.ts`、`src/core/constraint/DefinitionConstraints.ts` | 新分组暂未选择；add/clone 不得形成双候选，选中候选不可单独删除，可切换或删除允许删除的分组。未选中时报校验错误且禁止 ARXML 导出。JSON/ARXML 导入拒绝双候选。 |
| A4 | 新增 `src/ui/FormEditor/ChoiceSelector.vue`、`src/stores/configStore.ts`、`src/views/WorkspaceView.vue` | 候选按钮按定义生成；切换提示原配置丢失，取消无变化；替换整棵候选子树作为一条差量历史，Ctrl+Z 恢复原实例身份、参数、引用及时间戳。异步确认后核对配置集和候选未变化。 |
| B1 | `src/core/io/Arxml.ts` | 分组 DEST 使用 ECUC-CHOICE-CONTAINER-DEF，唯一选中子项使用 ECUC-PARAM-CONF-CONTAINER-DEF，定义路径保留 CHOICE 层级。 |
| B2 | `EcucArxmlImporter.ts`、`Arxml.ts` | 新解析 NvM 的 blockers 为 `[]`；仅保留选择操作提示。其他模块有 blockers 时仍拒绝导出，有专门回归用例。 |
| B3 | `Arxml.ts`、`ConfigJson.ts`、`src/core/io/ImportPlan.ts` | 按候选 DEFINITION-REF 还原；无需私有 SDG 表示选择。向当前配置导入时，候选变化进入冲突预览，overwrite 替换、skip 保留、rename 遵守分组上限，不合并成双候选。 |
| B4 | 新增 `tests/choice.test.ts`、`tests/choice-ui.test.ts` | 两个官方 NvM 候选均完成 export/import 深相等；通用 CHOICE 样例另测非空参数/引用及去掉 ADMIN-DATA 后仍正确恢复选择。持久化重载保留选择与配置标记。 |
| C1 | 新增 `src/core/config/RequiredDefaults.ts`、新增 `src/ui/FormEditor/RequiredDefaultsAction.vue`、store、workspace | 对当前配置集全部已存在实例计算确认计划；仅确认尚未配置、有真实 defaultValue、可编辑的必填参数；不覆盖已填写值，不激活可选参数。 |
| C2 | `configStore.ts`、`choice-ui.test.ts` | 一次 edit 包含全部确认；单次 Ctrl+Z 逐字节恢复原 JSON，redo 再次恢复；无待确认项时不产生空历史。 |
| C3 | `RequiredDefaults.ts`、`RequiredDefaultsAction.vue` | 缺 DEFAULT-VALUE 或只读必填项不处理，提示剩余手填参数数及引用需另选；false / 0 / 空字符串仅当它们确实是定义默认值时可确认。 |
| C4 | 全量既有回归 + 本机冒烟 | Dem/CanIf 解析、配置、校验、导出语义、C 生成、JSON/ARXML、历史/批量/搜索/主题测试通过。CanIf 无 DTC CSV 字段时仍明确拒绝，未扩展原 CSV 范围。 |
| C5 | 全部修改、静态检查 | core 模块名与 UI 依赖检索均无匹配；TypeScript AST AnyKeyword=0；package.json / package-lock.json 未改，无新运行时依赖。 |

另有唯一既有测试修改 `tests/ecuc-ui.test.ts`，逐行说明见下。

## CHOICE 值文件表达

采用 `TPS_ECUC_03020` 的表达：值侧保留 CHOICE 分组容器，在其 SUB-CONTAINERS 中以候选的 DEFINITION-REF 表示所选项。可核对 AUTOSAR 官方 [R4.1.3 §2.4.3.1 / Example 2.34](https://www.autosar.org/fileadmin/standards/R4.1.3/CP/AUTOSAR_TPS_ECUConfiguration.pdf) 和 [R20-11 §2.4.3.1 / Example 2.33](https://www.autosar.org/fileadmin/standards/R20-11/CP/AUTOSAR_TPS_ECUConfiguration.pdf)。本项目输出仍使用契约要求的 r4.2.2 命名空间；本次未获取到 R4.2.2 完整 XSD，不宣称做过完整 XSD 验证。

以下为本机真实导出 `.temp/task009-nvm.arxml` 的 CHOICE 元素，经 DOM 序列化、加换行后的片段；只有 NvMEaRef，没有 NvMFeeRef 实例：

```xml
<ECUC-CONTAINER-VALUE xmlns="http://autosar.org/schema/r4.2.2" UUID="5fb3de2d-b4e7-494b-a3b3-a4a942a60678">
<SHORT-NAME>NvMTargetBlockReference</SHORT-NAME>
<DESC><L-2 L="FOR-ALL">This parameter is just a container for the parameters for EA and FEE</L-2></DESC>
<DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">/AUTOSAR/EcucDefs/NvM/NvMBlockDescriptor/NvMTargetBlockReference</DEFINITION-REF>
<PARAMETER-VALUES/>
<REFERENCE-VALUES/>
<SUB-CONTAINERS>
<ECUC-CONTAINER-VALUE UUID="f62495a3-5a85-41c3-a6e8-14b72532a665">
<SHORT-NAME>NvMEaRef</SHORT-NAME>
<DESC><L-2 L="FOR-ALL">EEPROM Abstraction</L-2></DESC>
<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/EcucDefs/NvM/NvMBlockDescriptor/NvMTargetBlockReference/NvMEaRef</DEFINITION-REF>
<PARAMETER-VALUES/>
<REFERENCE-VALUES/>
<SUB-CONTAINERS/>
</ECUC-CONTAINER-VALUE>
</SUB-CONTAINERS>
</ECUC-CONTAINER-VALUE>
```

## NvM 前后对比与一键确认

| 项 | 修改前 | 本轮实测 |
|---|---|---|
| 定义 | 6 容器 / 51 参数 / 9 引用 | 同样数量；明确识别 1 个 CHOICE / 2 个候选 |
| blockers | 1 条，整体拒绝 | 0 条；仍需选择候选和明确配置必填参数 |
| 新建配置集必填参数 | 37 个建议值未确认 | 一键确认 11 个，剩余 26 个不动；不自动填占位值 |
| NvMEaRef 选择导出 | 被阻断 | 11636 字符 / 4 个容器实例 |
| NvMFeeRef 选择导出 | 被阻断 | 11642 字符 / 4 个容器实例 |
| 往返 | 未支持选择语义 | 两个候选均整份配置 deepEqual，包括 selected child、结构、值、引用状态、isConfigured、description、时间戳 |

导出测试对剩余 26 项使用**测试中显式手动输入**；这些输入没有混入产品的一键确认逻辑。测试分别证明新建组未选择会拦截导出、有 blockers 仍拒绝，以及确认计划不会消费字段中的 fallback 建议值。

37 是参数定义中的必填数，提示的剩余数只统计当前已实例化容器的必填参数；引用目标单独提示。已有显式配置值保留，可选项不变，只读参数不由此按钮覆盖。一次确认前后 JSON 快照用于断言撤销恢复全部字段和时间戳。

## 验收标准自检

1. 候选解析：NvMTargetBlockReference，2 个候选，名称/路径/多重性/引用完整。
2. 互斥：A 后 add B、clone A 均拒绝且原 JSON 不变；导入双候选也拒绝。
3. 切换提示：真实 Element Plus 组件提示“切换候选将丢失「NvMEaRef」的配置”；点击取消无变化，确认替换。
4. 可撤销：document Ctrl+Z 一次恢复 A；redo 恢复 B；保存/重载保留选择。
5. 导出成功：两个候选分别验证 DOMParser 无 parsererror、r4.2.2 命名空间、全局 UUID 唯一、全部定义路径以 `/AUTOSAR/EcucDefs/NvM` 开头。
6. 往返：两个官方候选 deepEqual；通用样例非空引用、自引用、42 参数及无 SDG 文件均验证。
7. 必填 UX：37 个中仅 11 个带默认值变为已配置，提示剩余 26 个。
8. 单条历史：一次 Ctrl+Z 全部还原，且新配置没有更早历史时 canUndo=false。
9. 无默认值：未设 isConfigured；已配置、可选、只读均保留。真实 false/0/空串默认值正确处理。
10. 构建通过。
11. 全量 252 tests 全绿，超过契约 205；既有测试仅一处语义更新，见逐行说明。
12. Dem/CanIf 原导出保真与 XXE 回归全绿，无修改既有安全用例。
13. core 无模块字面量、无 UI 依赖、无 any 类型、无新增依赖。

## 不退化证据

- `core.test.ts` 45、`io.test.ts` 27、`arxml-fidelity.test.ts` 27、`arxml-editor.test.ts` 3 全绿。Dem 的未配置参数不导出、必填拦截及 isConfigured 往返保持；CanIf 45 个初始建议值受拦截，显式确认 25 个必填后仅导出相应值。
- `editor.test.ts` 28、`editor-ui.test.ts` 9 全绿，包含批量/跳过原因、20 步撤销、跨配置集搜索、主题、悬空引用。`replica.test.ts` 8、`ui.test.ts` 15、`io-ui.test.ts` 17 全绿。
- 另跑本机 `.temp/task009-regression.ts`，实际结果：

```text
Dem: JSON/ARXML deepEqual; Dem_Cfg.h+Dem_PBCfg.c gcc -Werror PASS; search=5; CSV=BOM/header PASS
CanIf: JSON/ARXML deepEqual; CanIf_Cfg.h+CanIf_PBCfg.c gcc -Werror PASS; search=54; CSV=unsupported DTC projection unchanged
```

CSV 继续是已有 DTC 投影，未把 CanIf 不支持 CSV 的既有边界包装成通用 CSV 成功。

## 既有用例变更（逐行）

仅 `tests/ecuc-ui.test.ts` 原第 165 行的断言被替换，其他既有测试不变：

```diff
-    expect(restored.module?.arxmlExportBlockers?.length).toBeGreaterThan(0);
+    expect(restored.module?.arxmlExportBlockers).toEqual([]);
+    const choice = restored.entries.find((entry) => entry.definition.choice)!;
+    expect(choice.definition.choice?.candidateRefs).toEqual(
+      choice.definition.subContainers.map((candidate) => candidate.uuid)
+    );
+    expect(choice.definition.choice?.candidateRefs).toHaveLength(2);
+    expect(choice.container.subContainers).toHaveLength(0);
```

逐行理由：第一行改为验证 B2 要求的 blockers 清空；第二行要求重载后仍能定位 CHOICE；第三至第五行核对候选身份与子定义完整对应；第六行锁定官方两候选数量；第七行防止持久化重载替用户自动选择。原编辑值 42、配置 JSON 完全一致、重载后 manager 能操作新模块的断言全部保留。另新增“其他模块 blockers 仍阻止导出”的用例，未移除原机制覆盖。

## 自检日志

最终完整日志保存在 `.temp/task009-tests.log`、`.temp/task009-build.log`（不入库）。关键原文：

```text
> vue-tsc --noEmit && vite build
✓ 1858 modules transformed.
✓ built in 9.71s

Test Files  15 passed (15)
     Tests  252 passed (252)
  Start at  04:36:47
  Duration  11.23s

NvM candidate=NvMEaRef; defaults=11; manual=26; xml=11636; containers=4; roundTrip=equal
NvM candidate=NvMFeeRef; defaults=11; manual=26; xml=11642; containers=4; roundTrip=equal
NvM defaults UI: required=37, confirmed=11, remaining=26, one Ctrl+Z restores exact JSON
TypeScript any keywords: 0
protectedDiffExit=0
```

`rg` 扫描 core 的 Dem/NvM/CanIf 和 vue/pinia/element-plus 导入无结果；`git diff --check` 通过；依赖文件无变化。构建保留既有 >500kB chunk 警告；旧 ecuc-ui 测试仍有 router-view 使用提示，不影响通过。

首次沙箱构建在 esbuild spawn 返回 EPERM，经正常 require_escalated 审批后运行成功，未绕过权限。期间自检纠正了新用例误假定 NvM 存在模块内引用，以及新用例对 Element Plus 返回类型的错误 mock；最终改为操作实际对话框，类型检查与全部测试均已通过。

## 未完成与限制

- 未做真实浏览器/截图视觉验收或真实浏览器首次渲染计时；本轮 UI 证据仅为组件/jsdom。
- 官方 NvM 中引用指向 Ea/Fee/Dem 等其他模块，现有产品只支持配置集内引用。因此官方往返样例保留其未设置的目标与标记；非空引用保真使用通用 CHOICE 样例验证。未扩展跨模块引用，也不把 XML 可导出等同于全部业务校验通过。
- 已有本机缓存的旧版模块定义不会自动重新解析；本轮验证对象为本版 ARXML 解析产生的定义、由其新建的配置及其持久化重载。不猜测旧 blockers 文本来改写定义。
- 新建 CHOICE 分组暂未选候选，这是有意的未完成编辑态；校验提示并阻止 ARXML 导出。JSON 仍能保存该草稿。
- 源码中仍保留已有 arxmlExportBlockers 机制；对其他未知语义不放行。

## 待确认

本轮无需要用户拍板的范围或架构变更。请 WorkBuddy 按当前 submissionCommit 独立运行自检并判断验收；Codex 不代写评审结论。
