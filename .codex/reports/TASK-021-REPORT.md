# TASK-021 交付报告 · round 0

实现方：Codex；完成日期：2026-11-06。契约哈希 `df8251fbf0c518a78a5b61f191952ba8a5bc07e51569b2ed3d4230098dbeb68e`。
本报告为实现自检，不是独立评审。实现基线 `a2d4ac471edc9029ad1a098349f0724486bd6d1a`。

## 交付结果

双版本目录全部可见，工程向导和模块管理共用左右选择器；工程可实际增减模块并恢复原配置。
同名跨版本定义、偏好、配置集、引用候选与 IO 均按名称和 release 隔离。
真实官方 Dem 4.2.2 已通过创建、编辑、保存、校验、JSON/ARXML 往返和通用 C 编译冒烟。

| 版本 | 全目录 | 解析完成 | 可选择 | 可选择中的有限制 | 待支持 |
|---|---:|---:|---:|---:|---:|
| CP4.2.2 | 84 | 78 | 23 | 17 | 61 |
| CP4.4.0 | 98 | 94 | 94 | 87 | 4 |

这里「可选择」是具备配置入口、JSON、校验和输出闸门验证的资格，**不代表模块所有场景、所有多值字段或供应商集成可用**。
新建空配置输出矩阵：4.2.2 三个允许输出、二十个预期拒绝；4.4.0 六个允许输出、八十八个预期拒绝。
拒绝缘于真实必填项/引用/CHOICE 未完成，分别验证 ARXML、header、source 三处一致拒绝，没有为通过目录验证自动填充工程。
完整项目样本另行填值后验证成功路径（Dem 两版本），不把空配置拒绝当成成功生成。

## 契约对照

| 项 | 实际实现与证据 |
|---|---|
| A1–A3 | 两版 catalog 全名称、release、分类、asset/哈希、parsed/status、reason、batch、diagnostics、verification；`--all`逐模块抽取，172 定义资源，176 个生成 JSON 两次逐字节一致（determinism.json） |
| B1 | 三个越界枚举default保留sourceDefaultValue/definitionIssue，defaultValue不提供；六处空枚举vendorSpecific/readOnly；Dem四处symbolic解析、DEST与目标检查，外部只读；官方裁片与合成双证 |
| B2 | 只交后续建议，见 [B2计划](TASK-021-B2-PLAN.md)，每类数量/规范入口/矩阵/目标版本核实缺口明确列出，未擅自实施 |
| B3/C3 | core逐文件见下；纯TS、不引入模块名分支 |
| C1–C2 | `moduleKey(name,release)`；旧缺省4.4.0，旧偏好读取仅内存转换，不落盘；双版本同名并存/错误版本拒绝/metadata-free ARXML 4.4基线专项测试 |
| D1–D2 | ProjectWizard和ModuleManager均import同一ModuleSelector；分类、搜索、批量选择、去重、加入移除；禁用项title/键盘focus显示原因，disabled不可加入 |
| E1–E3 | 真正更新moduleShortNames/setUuids；detachedSetUuids保留本工程移除记录；重加只找本工程历史且未被其他工程占有的配置，不借用另一工程；显式确认，取消零写入 |
| F1–F2 | 4.2.2真实创建、编辑与刷新恢复；手工完整样本ARXML精确往返及C编译；两版向导/管理/项目卡片release一致；本轮无F1降级 |

## core 逐文件

| 文件 | 调整 |
|---|---|
| `src/core/bswmd/ModuleKey.ts` | 新增名称+release可逆复合键，缺省4.4.0 |
| `BswmdLoader.ts` | cache/getModule复合键，getAllModules保留同名不同版 |
| `BswmdParser.ts` | 读取源诊断/vendor标志、symbolic kind；保留定义多重性/字段限制；JSON缺省版本基线 |
| `BswmdTypes.ts` | 参数来源诊断/硬件特定字段，symbolic reference kind |
| `EcucArxmlImporter.ts` | 枚举越界保留诊断、空枚举不伪造、symbolic定义解析与目标元信息 |
| `src/core/config/ConfigValues.ts` | 错误枚举default不作为建议、不自动已配置 |
| `ReferenceCandidates.ts` | symbolic DEST；候选解析拒绝config/module版本不符 |
| `src/core/io/ConfigJson.ts` | 缺省release使用旧数据基线4.4.0 |
| `Arxml.ts` | ADMIN-DATA记录release，按定义路径+release选模块，未带release按既有4.4基线，错误版本拒绝 |

ConfigInstanceManager 已有复合键直接复用，未修改。src/core 的实现没有 Dem/CanIf/NvM 特判，UI不硬编码字段。
`configStore` 保留初始化/恢复/输出闸门逻辑；新增工程归属更新与失败补偿；成员变更不改原配置的 lastModified，逐字节恢复断言。
模块首选项仍是同版全局偏好，非每工程独立策略（原产品行为）。

## 界面实测（真实浏览器，1366×768）

在隔离来源 `localhost:3022` 测试，未改动用户 `localhost:3000` 数据：

1. 起始页点击新建，4.2.2目录84、禁用61；项目TASK021·CP422，芯片S32K3XX，选择Dem。`01-wizard-422.png`。
2. 创建后实例改名Bench422、保存；代码校验显示真实缺项并定位DemTaskTime。`02-editor-422-validation.png`。
3. DemTaskTime输入0.02，保存并刷新仍为0.02；名称Bench422与release4.2.2保持。
4. 模块管理新增CanTp，再移除Dem；确认后页签/导航移除，配置仍保留。`03-module-removed.png`。
5. 重加Dem，Bench422及0.02恢复。`04-module-restored.png`。
6. 新建4.4.0目录98、禁用4，选择Dem/CanIf；共用管理器显示生成/验证开关。`05-wizard-440.png`、`06-manager-440.png`。
7. 返回首页两张项目卡片版本各自正确；「打开配置器」进入新建/导入/打开起始页。`07-home-projects.png`。
8. 从卡片重新进入4.2.2，只有该工程页签，Bench422保持。`08-version-return.png`。结束时控制台error为空。

验收中发现并修复：创建另一工程时activeUuid先于工程索引更新，旧页签没有清除；watch同时观察工程UUID和关联集，实际重测通过。
向导压缩上下间距及列表高度，1366×768确认按钮可见。浏览器临时视口已恢复。
桌面启动器以 `Start-Configurator.ps1 -NoBrowser` 实测返回 `Ready: http://localhost:3000/`，入口无变无需重新安装快捷方式；未修改系统策略。

## 自动验证与失败记录

- `npm run build`：通过，13.51s，vue-tsc严格通过；主包1187.53kB警告仍存在，无调高阈值。每个定义独立chunk。
- 全量 `test:verify`：24/24文件守卫，343通过/1性能超时（600.99ms）；隔离editor-ui 9/9通过，20步撤销311.78ms，门槛保持500ms。
- 在最后页签修复后使用单worker完整重跑：344/344通过、24/24守卫，118.79s；结果见 `evidence/task021/tests-serial.log`；没有skip或删除测试。
- 官方Dem4.2.2完整验收样本：evaluateOutputReadiness.ready=true，JSON→ARXML→JSON逐字节相等；生成 `Dem_Cfg.h` / `Dem_PBCfg.c`。
- `gcc -std=c11 -Wall -Wextra -Werror -pedantic -fsyntax-only .../Dem_PBCfg.c` 通过，证据gcc.txt。
- 全量生成再次执行，176文件hash一致（两版catalog/changelog/定义），原始源文件未入库。
- 纯TS依赖扫描、禁止any/@ts-ignore扫描无代码违规；无权限/契约/评审字段改动。

中途失败没有隐藏：构建测试mock遇ElementPlus交叉返回类型，改为精确返回类型断言；性能超时如上；新增恢复断言暴露成员更新污染时间戳已修复；早期测试的无版本合成配置选择错误/tooltip旧口径/选择器CSS均修复，最终保留原验证强度。

## 既有用例变更说明

| 文件 | 原断言为何调整 / 保留覆盖 |
|---|---|
| projects | 4.2.2从禁用变可创建；不支持版改4.5.0；选择器增加左右加入步骤；新增6例：双版本、移除重加隔离、补偿、旧数据零写、84/98DOM、确认取消 |
| generation-script | 不支持版改4.5.0；新增官方4.2.2确定性支持用例 |
| replica | 模块选项从旧单表改共用左右结构；按实际名称选Dem，不再以第一个复选框猜模块 |
| recovery/ecuc-ui | 偏好断言走名称+release查询，原值与行为不变 |
| io-ui | tooltip增加CP版本，仍检查模块名/配置集名称 |
| choice/arxml-fidelity | 无ADMIN-DATA测试显式用4.4.0基线（在完成原操作后改fixture元数据），仍检查完整配置/CHOICE/引用；合成TEST-SYNTHETIC-1不是AUTOSAR版本 |
| ecuc | 原「空枚举必拒绝」不符合本期契约，替换为literal缺SHORT-NAME的畸形枚举拒绝；空枚举正例在catalog独立覆盖 |

新增catalog 10例（含it.each展开）：全目录双版、3坏default、双版空枚举、官方4符号ref、合成规则/局部引用、复合缓存/IO、官方完整样本。
总计327基线+17新增=344项，24文件。

## 未完成与限制

- 4.2.2仍61待支持：55解析后待SYMBOLIC资格，另Dbg/Dcm/MemMap/Rte/TcpIp/Xcp六个解析失败；4.4.0四个Dcm/MemMap/Rte/Xcp失败。每项有batch，计划另案下发。
- SYMBOLIC最小支持不等于完整symbolicNameValue语义；官方Dem四处外部引用仍只读；B2计划明确补齐，不宣称全标准或供应商资格。
- 多值字段目前单值编辑，跨模块引用不能直接编辑；硬件空枚举不可写，不为S32K预造值。必填受限字段导致输出失败是明确限制。
- 工程整体manifest/工程包、MCAL、参数级跨版本映射及变体均未实施；旧数据仅读取不做静默迁移。
- 工程索引与配置库为两次写入，普通失败补偿；进程在两写间退出仍可能留下可检测孤儿，沿原设计保留，不声称事务原子性。
- 未取得4.2.2规范原版逐条对照，历史类型依据版本与待核实事项在B2计划中声明。
- 用户已恢复WorkBuddy操作；本报告提交时独立评审尚未发生，随后真实发送。当前是前台会话自动接续，未宣称已验证无人值守常驻。

## 用户反馈修复：工程打开、起始页与选择器（2026-11-06）

本节为用户在 TASK-021 首次提交后、WorkBuddy 尚未实际接收该版本评审前提出的三项明确修复。原提交 `73ee57a6221c9fb5ae136606a8cecef529149002` 及上文结果保留。按用户指令补充修复并重新绑定 submissionCommit；本次不是独立评审返工，round 保持 0，不修改契约、stage 或任何评审结论。

### 实际故障与修复

1. **现有与新建工程无法打开**：在真实 `localhost:3000` 点击既有 DEMO，路由停留在起始页，控制台记录 WorkspaceView 动态模块加载失败。只读递归检查其 99 个模块依赖，发现共享 Vite 缓存中的 `handlebars.js?v=81ff0635` 返回 HTTP 504。桌面运行实例与 ARXML 抽取脚本原先共享 `.temp/vite-cache`，脚本优化依赖会令运行中的依赖地址失效。桌面服务改为按端口独立缓存并预优化 handlebars；两个抽取入口按进程使用独立缓存且关闭无关浏览器依赖发现。没有删除配置库或用户缓存。
2. 首页和起始页共用 `useProjectNavigation`，统一等待初始化、处理激活失败及路由资源失败、显示可理解的错误，并在失败后恢复重试能力。创建过程保留向导组件，避免保存时 isLoading 改变卸载向导、丢失成功跳转事件。
3. **起始页显示**：新建直接显示两步表单；打开只显示本机工程及独立配置集；导入显示 JSON/ARXML 入口。左侧以单一选中状态标记当前页面，不再混用欢迎页内容。顶部与侧栏稳定保留，内容区独立滚动；内嵌选择器高度随窗口调整，1280×720 下创建按钮完整可见。
4. **选择模块文字**：删除悬停时撑开列表的大段限制说明、已选项长 tooltip、向导底部验证统计段落。保留名称、数量及简短状态；不可选择模块保留原生提示和无障碍原因，未把尚不支持的模块伪装为可用。新建与模块管理仍共用组件，未改定义/选择资格或输出闸门。

调整文件：`scripts/desktop/server.mjs`、两个 ARXML 抽取入口、`useProjectNavigation.ts`、`ConfiguratorStartView.vue`、`HomeView.vue`、`ProjectWizard.vue`、`ModuleSelector.vue`、`tests/projects.test.ts`、README。

### 本机实际验证

在用户使用的同一来源 `localhost:3000` 验证；只新增测试工程，不清空、迁移或覆盖既有工程内容：

- 已有 DEMO（当前受控浏览器内为 Dem/Nm/PduR/SoAd 四模块）从起始页、首页卡片均能打开，截图 `01-existing-project-open.png`。用户截图所用浏览器的七模块 DEMO 未直接操作，不冒充其数据已逐项验证。
- 创建 `界面验证_20261106`（CP 4.4.0 / S32K1XX，Dem + CanTp），成功自动进入工作区；刷新后名称、版本及两模块均恢复，再从打开列表进入也成功。截图 `04-created-project-reloaded.png`、`08-workspace-final.png`。
- 旧独立配置集 `研究验证_20261103` 从打开列表进入成功。
- 新建、打开、导入分别截取 `02-new-project.png`、`05-open-project.png`、`07-import-page.png`；`06-compact-selector.png` 为最终压缩布局及无长说明选择器。布局预览取消，未额外保存工程。
- 抽取 CLI 的完整回归执行期间，桌面服务继续运行；测试后再次检查 WorkspaceView 的 99 个依赖，全部成功。浏览器最后一次刷新成功；`browser-errors.json` 仅保留修复前 10:03:38 UTC 的两条失败，修复后没有新增 error。
- 桌面服务仅重启了通过命令行身份确认的本仓库原进程；使用原 `Start-Configurator.ps1 -NoBrowser` 恢复，地址仍为 localhost:3000。快捷方式入口未变，无需重装；没有修改系统执行策略。

证据目录：`.codex/reports/evidence/task021-userfix/`。浏览器已留在可运行的新工程配置页。

### 自动验证

- 专项：projects + generation-script 共 **20/20** 通过；包含新建保存后跳转、三个入口各自内容/单选中状态、模拟路由资源失败显示提示/保留配置 JSON/允许重试。
- 全量 `npm run test:verify -- --maxWorkers=1 --minWorkers=1`：**346/346** 通过、24/24 文件收集守卫通过，109.73s。原 344 项保留，新增 2 项；没有跳过测试或放宽性能门槛。
- 最终 `npm run build`：严格类型检查及构建通过，18.61s；既有主包体积警告保留。
- 本轮所有源文件 Prettier 检查通过，`git diff --check` 通过。最终布局高度调整仅 CSS，构建和浏览器实测已覆盖。
- 本机网络诊断首次在受限 shell 中 fetch failed；经授权本机连接后重跑 99/99 成功。此失败不是应用回归，未隐藏或据此修改数据。

本节结果为 Codex 实现与自检，不构成 WorkBuddy 通过结论；评审必须核对更新后的 submissionCommit。

