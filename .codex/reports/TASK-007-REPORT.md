# TASK-007 交付报告

> **round 0 分批交付**，依据 ACTIVE §6。本轮覆盖 **A1–A6、B1–B2、C1–C3、D1–D3**，并验证 C4 的通用必填/范围规则。**C5（官方 NvM 完整 ARXML 导出往返）、真实浏览器验收与浏览器性能证据留待后续轮次，未声明完成。** 此报告是 Codex 实现自检，不是 WorkBuddy 评审结论。

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 事件 | TASK-007 / ac85057bbbf31d12d0c9ba52 |
| 轮次 | 0 |
| 完成时间 | 2026-11-01T03:58:25+08:00（本机实时时钟；原下发文件时间未改动） |
| 基线 | 61c5fc4c4c14b609f90f1337fcdfba65148e0d22 |
| 契约哈希 | e12f42f98881c440520f6762a7c8bef43ac1b6a364eee5af386efab866a0f690，开始时核对一致 |
| 构建 | `npm run build` 通过，含严格类型检查与独立 Worker 打包 |
| 全量回归 | 连续三次均为 11 files / 206 tests passed，原 164 个用例保留 |
| 状态交接 | 代码与本报告先提交，再将允许的 task 字段绑定该完整代码 SHA；stage/契约/review/lastReview 不改 |

开始时工作树干净；WorkBuddy done/synced 均绑定基线提交，busy 文件不存在，done 明确释放写入权。仓库没有 `.codex/decisions` 或 ADR 文件。用户界面偏好说明预览已由父任务打开并保留，故本轮不启动常驻服务、不修改偏好文件。

## 交付对照

| 编号 | 文件 | 实现及验证 |
|---|---|---|
| A1 | `src/core/bswmd/EcucArxmlImporter.ts`、`BswmdParser.ts` | `importEcucModuleArxml(source, moduleShortName)` 和 `parseFromArxml`；既有 JSON 入口逻辑不变 |
| A2 | 同上、`BswmdTypes.ts` | 模块名称、DESC、版本、multiplicity、根容器；官方样本为 4.4.0，非输入描述中推测的 R21-11 |
| A3 | 同上 | 递归 PARAM-CONF 子容器，兼容 PARAMETERS/PARAMETER-DEFS、REFERENCES/REFERENCE-DEFS；CHOICE 保留候选并显式提示限制，见下 |
| A4 | 同上 | BOOLEAN/INTEGER/FLOAT/ENUM/STRING/FUNCTION，数值范围/默认值、枚举列表、字符串条件节点中的长度/正则元数据。Inf 浮点边界映射为无界 |
| A5 | 同上、store、DefinitionConstraints | 引用目标完整路径、目标短名、multiplicity、必填；有完整路径时按定义路径匹配，避免同名异处误绑定 |
| A6 | `EcucModuleSource.ts` | XML 标签扫描只保留深度受限栈和模块片段位置；筛选名称后只把目标片段交给 XMLParser |
| B1 | `scripts/extract-ecuc-module.mjs` | 复用 TS 定位器，经现有 TypeScript 编译器加载；原样抽取模块体，重建原命名空间与 AR-PACKAGE 祖先层级 |
| B2 | `tests/fixtures/ecuc-nvm.arxml`、`ecuc-canif.arxml` | 165,493 + 372,895 = **538,388 bytes**；完整模块体，DOMParser 检查结构，无全量文件入库 |
| C1 | `ModuleManager.vue`、`EcucDefinitionSession.ts`、`EcucDefinition.worker.ts` | 模块管理中选择 ARXML → 列出全部模块供勾选 → 后台解析 → 展示限制 → 导入选中模块；拒绝覆盖已加载名称以保护 definitionRef |
| C2 | `configStore.ts` | 导入定义随本地配置库一起保存；建立/重新加载实例管理器；模块进入已加入列表，可新建配置集；原引擎按 lower 建根，lower=0 不预建 |
| C3 | 现有 ConfigTree / DynamicForm、store | 官方定义直接供树/表单使用，无模块专用表单；枚举、数值、必填均由元数据给出；编辑保存和新 store 恢复测试通过 |
| C4 | 现有 `DefinitionConstraints.ts` + 新测试 | 官方参数清空时报 required，超界时报 out of range，验证面板可定位字段；不添加模块专用规则 |
| C5 | **后续轮次** | 官方 NvM 含 CHOICE，其实例/引用/导出语义尚未完成。模块保留 `arxmlExportBlockers`，导出明确拒绝，避免输出看似合规的错误配置；普通 FUNCTION 的 DEST 修正为 ECUC-FUNCTION-NAME-DEF |
| D1 | `vite.config.ts`、`tests/ecuc-cache.test.ts` | 改成根级 `.temp/vite-cache`，删除无效 test.cacheDir；解析实际 Vite config 的测试 + 连续三次全量测试 |
| D2 | `XmlSafety.ts`、`Arxml.ts`、新增解析器 | 前置检查前去掉实际注释；CDATA 中形似注释的文本保持原样；实体展开仍禁用，真实 DTD/ENTITY/XInclude 仍拒绝 |
| D3 | `DynamicForm.vue`、`WorkspaceView.vue`、store | “暂无 <目标容器> 实例，请先新增”；列出合法父位置的新增按钮，创建与赋值为一次可撤销操作。外部目标/尚无父容器时给出原因，不伪造本地目标 |

另将既有 `src/core/constraint/DemConstraints.ts` 原逻辑移到 `src/modules/dem/DemConstraints.ts`，由 store 注册。移除 core 中的模块专用规则和示例名称，满足工程第 11 条，业务断言保持不变。

## 解析策略与实测性能

1. 文件在浏览器本地读取，50 MB 上限沿用现有 IO 边界。剔除真实注释后拒绝 DTD/ENTITY/XInclude；不联网、不读取外部引用。XMLParser 使用 `processEntities:false`。
2. `locateEcucModules` 顺序扫描 XML 标签，跳过注释/CDATA/PI、正确处理属性引号内的 `>`，维护不超过 300 层的标签栈，只记录模块的起止偏移、名称和祖先包装。**不把全文件构造成 XML 对象树**。模块树递归限深 128。
3. 选中模块后才进行该片段的 XMLValidator / XMLParser 和 BSWMD 映射。测试 spy 证明列模块时 parser 零调用、选择 NvM 时 parser 仅收到 NvM 片段。
4. UI 通过独立 Web Worker 完成扫描与解析，主线程呈现进度；关闭/换文件/卸载释放 worker。新增 UI 测试用真实解析器 + Worker 传输替身；真实浏览器 Worker 行为仍需后续实测。
5. 使用临时 Vite 模块加载器读取项目外原文件，`finally` 关闭，无监听端口/常驻子进程。实测文件 **15,447,041 bytes、98 模块**：列名 **178.01 ms**，完整文件中解析 NvM **185.95 ms**。数据为 Node 本机测量，不能替代浏览器响应性验收。
6. 官方 NvM 树首次挂载（jsdom）连续三次 **28.40 / 29.21 / 22.91 ms**；不是实际浏览器绘制时间。

本机测量原始记录：`.temp/task007-performance.json`；复现脚本 `.temp/task007-measure.mjs`，均不入 Git。持续测试只使用仓库内 fixture，不依赖项目外全量文件。

fixture 模块体保持官方原文，包含原文描述段落的 14 处行尾空格。`git diff --cached --check` 仅在这些原文行提示 trailing whitespace；排除这两个原样样本后实现/测试/报告检查无输出，不为消除此提示改写官方文本。

抽取复现：

```powershell
node scripts/extract-ecuc-module.mjs ../AUTOSAR_MOD_ECUConfigurationParameters.arxml NvM tests/fixtures/ecuc-nvm.arxml
node scripts/extract-ecuc-module.mjs ../AUTOSAR_MOD_ECUConfigurationParameters.arxml CanIf tests/fixtures/ecuc-canif.arxml
```

## 元数据映射表

| ARXML 元素 | BSWMD 字段 / 缺失或限制处理 |
|---|---|
| SHORT-NAME、DESC/L-2 | shortName、description；描述内嵌标签合并为纯文本 |
| UUID 属性 | uuid；源缺失时由统一 uuid 工具按绝对定义路径生成稳定 v5；重复拒绝 |
| 容器祖先路径 | definitionPath，供完整引用路径匹配 |
| DOC-REVISIONS/DOC-REVISION/REVISION-LABEL | version；无单一版本时 unknown |
| LOWER/UPPER-MULTIPLICITY | multiplicity；缺失按现有模型 1..1，非法上下界拒绝 |
| UPPER-MULTIPLICITY-INFINITE=true/1 或 upper=* | upper=unbounded |
| 参数/引用 lower=0 | isOptional=true；其余 false |
| BOOLEAN-PARAM-DEF | BOOLEAN；true/false/1/0 转为布尔默认值 |
| INTEGER-PARAM-DEF、FLOAT-PARAM-DEF | INTEGER/FLOAT，min/max/defaultValue，支持十六进制与科学计数法；非法/越界默认值拒绝 |
| FLOAT 的 -Inf/Inf | 对应 min/max 不设有限界，避免持久化 Infinity 被 JSON 转成 null；其他非有限默认值拒绝 |
| ENUMERATION-PARAM-DEF/LITERALS | ENUM、enumValues；非列表内默认值拒绝 |
| STRING-PARAM-DEF、FUNCTION-NAME-DEF | STRING/FUNCTION；支持单个 `*-VARIANTS/*-CONDITIONAL` 内默认值、MIN-LENGTH/MAX-LENGTH/REGULAR-EXPRESSION；未静默转型 |
| VALUE-CONFIG-CLASSES | 现有单值 configClass；优先 PRE_COMPILE，否则 LINK_TIME，再 POST_BUILD；无定义默认 PRE_COMPILE |
| DESTINATION-REF | destinationRef 完整路径 + destinationContainerType 末段；跨模块目标有明确警告 |
| CHOICE-CONTAINER-DEF/CHOICES | 暂按分组保留层级与所有候选；加入 importWarnings 和 arxmlExportBlockers；不声称互斥/导出已实现 |
| 上界大于 1 的参数/引用 | multiplicity 保留并显示警告；现有值模型仍是单值 |
| 非本轮六类参数、非普通引用类型、多条件变体 | 给出带字段名/类型的错误，拒绝该模块，避免静默丢字段 |

## NvM 实测与验收标准自检

| # | 契约验收 | 本轮证据 / 状态 |
|---|---|---|
| 1 | NvM 正确解析 | 3 根、递归共 6 容器（含 CHOICE 分组）、51 参数、9 引用；数量与源标签计数逐项相同 |
| 2 | CanIf 亦可解析 | 20 容器、82 参数、16 引用，数量与源文件一致 |
| 3 | 界面导入闭环 | 组件测试从文件控件导入、双模块列表勾选、创建 NvM 配置、树/枚举/必填渲染通过；**未做真实浏览器实操** |
| 4 | 编辑与持久化 | NvMBlockJobPriority 改为 42，保存后重新创建 Pinia store、initialize，值与完整配置一致；**未实测真实页面刷新** |
| 5 | 元数据校验定位 | 清空/256 超出 0..255，两条通用规则及验证面板点击定位通过 |
| 6 | NvM ARXML 合规 | **未完成，留下一轮；当前显式禁用有 CHOICE 限制的定义导出** |
| 7 | NvM ARXML 往返 | **未完成，留下一轮**；JSON 本地保存与配置导入恢复已测 |
| 8 | Dem 不退化 | 原 164 个用例连续三次全绿，涵盖配置、验证、C/gcc、IO、撤销、批量、搜索、主题 |
| 9 | build | 通过 |
| 10 | 测试 ≥164 | 206/206（新增 42），11 文件 |
| 11 | core 模块名称零硬编码 | `rg -n 'NvM|CanIf|Dem' src/core` 无输出；DEM 规则移到模块目录 |
| 12 | core 无 UI 框架 | vue/pinia/element-plus 导入扫描无输出 |
| 13 | 不增运行时依赖 | package.json/package-lock.json 均未改 |
| 14 | D1/D2/D3 对应测试 | 见下节测试名称 |
| 15 | 文件体积 | 两个新增 fixture 共 538,388 bytes；全量原文件只读、未入库 |
| 16 | ≤3s / 不白屏 | Node 单模块 185.95ms；采用 Worker；**浏览器不白屏未实测** |
| 17 | 树首次渲染 ≤500ms | jsdom 22.91–29.21ms；**真实浏览器性能留下一轮** |

没有新增界面截图，不借用旧截图充当本轮证据。用户已保留的预览 URL 为 `http://127.0.0.1:3000/workspace`，由父任务管理，本轮未新起服务。

## 遗留修复与测试

- **D1**：根级 Vite cacheDir 指向 `.temp/vite-cache`，本地实际存在 deps/vitest 目录。新测试 `D1: resolves Vite root cache inside the workspace and removes the ignored test.cacheDir`。三次相同收集数且无 EPERM；不宣称 Vitest 的所有非缓存临时文件都不再使用系统 TEMP。
- **D2**：新增 `D2: accepts a legal comment mentioning DOCTYPE in both definitions and configuration imports`，及 `D2: preserves comment-shaped literal CDATA while removing actual comments`。原 XXE/实体安全用例全部保留并通过。
- **D3**：新增 `names the missing target, creates and assigns it, and undoes the entire operation` 与 `explains why cross-module targets cannot be created instead of making invalid local instances`；验证快捷新增真实写入引用、一键撤销恢复逐字节配置、无非法外部目标按钮。

## 既有用例变更

八个既有测试文件中，仅 `tests/core.test.ts:11` 修改一行导入路径；用例、断言、数量、跳过状态均未变。其余七个测试文件没有修改。

```diff
-import { DemConstraints } from '../src/core/constraint/DemConstraints';
+import { DemConstraints } from '../src/modules/dem/DemConstraints';
```

理由：工程第 11 条要求核心层零模块名硬编码。规则函数内容原样移出 core，测试继续注册同一组规则并跑原断言；这是路径调整，不是删改用例以变绿。

## 自检日志

原始本机日志为 `.temp/task007-build.log`、`.temp/task007-tests-1.log` 至 `-3.log`（不入库）。关键输出：

```text
$ npm run build
> vue-tsc --noEmit && vite build
vite v5.4.21 building for production...
✓ 1849 modules transformed.
✓ built

$ npm test -- --run  (连续第 1 次)
Test Files  11 passed (11)
Tests       206 passed (206)
Duration    9.82s

$ npm test -- --run  (连续第 2 次)
Test Files  11 passed (11)
Tests       206 passed (206)
Duration    9.75s

$ npm test -- --run  (连续第 3 次)
Test Files  11 passed (11)
Tests       206 passed (206)
Duration    9.66s

$ rg -n 'NvM|CanIf|Dem' src/core
（无输出）
```

第一次普通沙箱构建在启动 esbuild 时返回 spawn EPERM；之后使用正常 `require_escalated` 审批获准运行构建/测试，均成功。没有使用权限绕过参数。构建仍有既有主包 >500KB 提示；新增组件测试有直接挂载 WorkspaceView 引起的 Vue Router route-leave 提示，测试通过，没有隐藏警告。

## 未完成与限制

1. C5 和完整 NvM 全链路尚未完成：CHOICE 互斥、其真实配置层级、ARXML schema 表达需在后续轮次落实。为避免错误输出，对包含该语义的模块显式拒绝 ARXML 导出，JSON 编辑保存可用。
2. 官方 NvM 的 9 个引用均指向其他模块；目前配置集仍按单模块管理，显示目标与限制，不能选择跨模块实例。不假造目标完成测试。
3. 多值字段仍只编辑一个值；定义 multiplicity 原样保存并给警告。字符串长度与正则已映射，现有通用校验器仍主要验证类型/数值/枚举/引用，不宣称完整字符串正则或变体约束求值。
4. 能列出全量 98 个模块，不代表支持它们全部语义；未支持的参数/引用类型、多条件变体会明确拒绝，已验证的是 NvM 和 CanIf 两个完整样本。
5. 真实浏览器导入、刷新、Worker 不白屏、布局和绘制耗时尚未实测。组件测试与 Node 性能数据不作替代声明。

## 待确认

| 问题 | 本轮处理 | 后续责任方 |
|---|---|---|
| CHOICE 与跨模块引用的实例/导出契约 | 保存源元数据，显式限制，不调整现有单模块值模型；使用已授权的 round 0 分批交付 | WorkBuddy 在后续契约或修复要求中定位 C5 所需范围，Codex 按其契约实现 |

本轮不发评审、不启动下一事件；完成提交与同步后由父调度器触发指定 WorkBuddy 的独立评审。
