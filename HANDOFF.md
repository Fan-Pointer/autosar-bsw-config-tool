# HANDOFF — OneSAR Configurator（AUTOSAR BSW 配置工具）重建说明书

> 本文件自包含：读者是没有任何本项目上下文、只能读本文件的 AI。所有路径相对项目根目录（Windows）。
> 基线：git 提交 `7310754`（业务代码终态 = 提交 `65308ee`，TASK-018 验收通过版），package.json version `0.1.0`。
> 本文档描述"当前已验收终态"，不描述进行中分支或未提交改动。

---

## 1. 项目定义与目标

**OneSAR Configurator**（仓库名 `autosar-bsw-config-tool`）是一个**纯前端** Web 应用：在浏览器里对 AUTOSAR 基础软件（BSW）模块（当前：Dem，可导入 CanIf/NvM 等）进行配置编辑，并生成四类产物——JSON 配置、ECUC ARXML、CSV、C 代码。数据全部存于浏览器本地（IndexedDB），无后端、无账号、无上传。

- 标准基线：AUTOSAR CP **4.4.0**（参数定义来源为官方 `AUTOSAR_MOD_ECUConfigurationParameters.arxml`）；ARXML 序列化 namespace 固定 `http://autosar.org/schema/r4.0`（兼容读入旧 r4.2.2 文件并给出警告）。
- 目标用户：汽车电子工程师，在本地完成 BSW 参数配置与代码生成。
- 明确不做：变体管理、跨模块引用值语义、云端/多人协作、供应商工具集成验证。

## 2. 最终效果 / 验收清单

构建 `npm run build` 通过、`npm run test:verify` **39/39 文件全收集且 0 failed** 后，以下逐条可勾选（用例总数随迭代增长，判定标准是 0 failed；6 skipped 中 2 条为按设计跳过的性能门禁用例，见 §8）：

**功能**
- [ ] 首页（`/`）：配置集管理列表（创建/打开/重命名/切换/删除），打开后进入 `/workspace`
- [ ] 导入官方 CP 4.4.0 ARXML 模块定义（经向导式会话：选文件→解析→选模块），Dem/CanIf/NvM 可成功导入并出现模块页签
- [ ] 配置集绑定单模块；同一模块可建多个配置集；配置集间数据完全隔离
- [ ] 配置树三栏布局：工程侧栏 + 模块配置树 + 参数表单；树支持实例/定义两级节点、搜索过滤、状态点
- [ ] 实例生命周期：添加子容器（工具栏与树）、克隆、删除，均可单步撤销/重做；删除有确认框，取消零写入
- [ ] 实例右键菜单：紧凑竖向三项（新建实例/克隆实例/删除实例）；「新建实例」二级直接列出全部子定义**仅名称**；禁用项灰显、原因经 `title`+`aria-description` 悬停可读（上限/CHOICE 已选/导入只读，原因来自 core 而非 UI 复制）；定义节点右键显示短提示「请右键实例节点」且不借用上次选中实例
- [ ] 参数表单：按 BSWMD 定义动态生成；行四态（可选/已配/未确认/错误）；「未配置 false」与「已确认 false」可区分；必填项一键确认建议值
- [ ] 字段说明：点击参数名/行在**底部停靠区**显示（路径/类型/范围/枚举），与问题面板同区切换不叠层；行内不再有说明块
- [ ] 引用选择弹窗：搜索 + 单选**暂存**，确定才写入（单条可撤销），取消/X/Esc/遮罩零写入；外部引用只读禁用
- [ ] CHOICE 容器：互斥硬校验；切换前显示影响预览（将丢失的已配值/引用明细）；预览后配置再变更时确认被拒；切换可单步撤销
- [ ] 问题面板（底部停靠）：计数、严重度/路径/原因、点击定位到字段、可收起；生成/导出失败原因自动汇入
- [ ] 引用入站/出站列表：派生自真实实例与定义，双向点击跳转
- [ ] 撤销/重做：20 步逐字节恢复（含时间戳/标志位）；跨配置集历史独立；批量修改带逐实例跳过原因
- [ ] 数据安全（S1 恢复协议）：旧版本数据不兼容时进**隔离区**（不覆盖、可查看原始数据/导出/删除）；正常加载不写库；每次解锁写回前自动永久快照；刷新后有未保存草稿恢复
- [ ] 导出：JSON / ARXML（r4.0）/ CSV（仅 DTC 模块）/ C 代码（Handlebars 模板）；**四类输出对同一配置结论一致**（同源闸门 `evaluateOutputReadiness`）；未配置参数不导出、必填报错逐项列清单、0/false 已确认值保留
- [ ] 导入：JSON / ARXML（计划预览 + 冲突表 + 三策略应用）；旧 r4.2.2 命名空间文件可读并有黄色警告；XXE/实体注入拒绝（DOCTYPE、外部实体、参数实体等）
- [ ] 全局搜索：跨配置集参数/实例索引，点击跳转定位
- [ ] 主题：亮/暗切换并持久化

**非功能**
- [ ] 性能：20 步撤销/重做 ≤500ms；5000 实例搜索索引 ≤200ms（测试硬断言）
- [ ] 浏览器：Chrome/Edge 现代版；视口 1366/1400 宽度核心操作可用
- [ ] 构建：`npm run build` 产出 `dist/`（es2020 target + sourcemap；主包约 1.19MB 的体积警告为已知既有项，不阻断）

## 3. 技术栈与依赖

安装方式：项目根目录执行 `npm install`（Node ≥18，依赖版本锁定于 `package-lock.json`）。

| 类别 | 选型与版本 |
|---|---|
| 框架 | Vue `^3.5.12`（Composition API + `<script setup>`）、TypeScript `^5.7.2` |
| 状态/路由 | Pinia `^2.2.6`（单 store `configStore`）、vue-router `^4.4.5` |
| UI | Element Plus `^2.8.7`（main.ts 全量注册）+ `@element-plus/icons-vue`；Sass `^1.81.0` |
| 解析/生成 | fast-xml-parser `^4.5.0`（ARXML/XML）、Handlebars `^4.7.10`（C 模板）、uuid `^11.0.3` |
| 存储 | localforage `^1.10.0`（IndexedDB 驱动） |
| 图（已装未用） | `@vue-flow/*`（后续引用图预留，当前无业务引用） |
| 构建/测试 | Vite `^5.4.11`、vitest `^2.1.6` + jsdom + `@vue/test-utils`、vue-tsc `^2.1.10`、ESLint 9 / Prettier |

**脚本**（package.json）：`dev`（Vite 开发，端口 3000）、`build`（vue-tsc + vite build）、`test`、`test:verify`（**必须用这个跑全量**：vitest + `scripts/test-collection-guard.ts` 磁盘文件数守卫，防收集静默缺失）、`preview`、`lint`、`format`。

## 4. 目录结构与文件职责

### 工程打开与恢复的标准口径（2026-11-12，P0）

- 用户从首页或起始页指定的工程是本次打开的目标。工作区挂载、刷新现场和重复初始化均不得将其切换到其他工程。
- 初始化共用同一个在途 Promise；主库与工程索引全部读取完成后才算初始化完成。打开工程须先完成初始化及原工程保存，失败时保留原工程。
- 页签、选中容器及字段现场按工程保存；旧版全局现场仅在活动模块确属当前工程时使用。恢复期间不反向覆盖现场，其他工程的模块不得出现在当前页签或引用候选中。
- 模块配置必须且只能属于一个工程。归属诊断以 `project.setUuids` 成员关系为准，禁止用硬编码为空的 `unassignedSets`。共享、孤儿或缺失记录不得通过更改工程标题掩盖；先保留原数据并给出诊断，再按有备份、可核验的方式修复。
- P0 回归必须挂载真实首页、路由和工作区，覆盖三工程、存储残留旧 `activeUuid` 及旧全局现场，检查工程名称、实际模块树与活动模块归属。只用工作区占位组件或只断言工程名称不足以验收。
- 2026-11-12 用户界面修正：首页、起始页和工作区不常驻展示“工程归属需要修复”横幅。后台归属统计、共享编辑保护及原始恢复包内容保留；确实阻止打开时使用简短错误提示。移除提示不等于删除或迁移历史记录。
- 模块目录中的“列出”与“可添加”必须区分。当前 4.4.0 目录 98 项、可选 94 项；4.2.2 目录 84 项、可选 23 项。Dcm 的内置资产尚未接入，4.2.2 另有符号引用资格限制；不得仅取消 disabled 或改状态冒充完成模块支持。

```
autosar-bsw-config-tool/
├─ index.html                     # Vite 入口 HTML
├─ vite.config.ts                 # 端口 3000；别名 @→src；cacheDir=.temp/vite-cache；vitest jsdom+globals
├─ package.json / package-lock.json
├─ src/
│  ├─ main.ts                     # createApp + Pinia + router + Element Plus 全量注册 + 主题初始化
│  ├─ App.vue                     # 根组件（router-view + 全局错误条）
│  ├─ router/index.ts             # 路由：/ Home、/workspace Workspace、/wizard 占位、/import-export
│  ├─ core/                       # ★ 纯 TS 领域层：零 UI 依赖、零模块名硬编码（Dem 仅存在于 modules/dem）
│  │  ├─ bswmd/                   # BswmdTypes（定义类型）/BswmdParser（解析 BSWMD JSON）/BswmdLoader（按名加载）/EcucArxmlImporter+EcucModuleSource（官方 ARXML→定义抽取会话）
│  │  ├─ config/                  # ConfigTypes/ConfigInstance（配置模型）/ConfigTraversal/ConfigValues/ConfigClone/ChoiceSelection（CHOICE 互斥）/BatchEdit/RequiredDefaults（必填建议值）/ReferenceCandidates（引用候选，destinationRefs 全遍历）/ConfigDelta
│  │  ├─ constraint/              # ConstraintEngine（规则引擎）+ DefinitionConstraints（BSWMD 驱动校验规则：类型/范围/必填/引用目标/CHOICE）
│  │  ├─ history/                 # HistoryStack（撤销栈）+ ConfigDelta（差量，非整库深拷贝）
│  │  ├─ io/                      # ConfigJson（序列化/恢复骨架）/Arxml（r4.0 导出+导入+XXE 防护+顺序保真）/Csv/Csv 导出/ImportPlan/XmlSafety/IoTypes
│  │  ├─ output/OutputGate.ts     # 输出闸门纯函数 evaluateOutputReadiness：四输出同源判定
│  │  ├─ generator/               # TemplateEngine（Handlebars）+ CGenerator（C 代码）
│  │  ├─ search/ConfigSearch.ts   # 全局搜索索引
│  │  └─ variant/                 # 变体占位（空实现，当前不做变体）
│  ├─ modules/dem/                # ★ 唯一允许出现模块名的地方：DemConstraints（Dem 特有规则）+ models/（早期模型，逐步被 BSWMD 驱动取代）
│  ├─ stores/configStore.ts       # ★ 唯一 Pinia store（约 1500 行）：配置集/实例/编辑/撤销/导入导出编排/校验编排；存储写点唯一化
│  ├─ ui/                         # 组件层
│  │  ├─ ConfigTree/              # ConfigTree（树）/ContainerNavigator（侧栏）/ContainerActions（工具栏）/ContainerContextMenu（右键三项菜单）+containerMenuPosition（实测定位/翻转）
│  │  ├─ FormEditor/              # DynamicForm（动态表单）/FieldState（行四态）/FieldDescriptionPanel（底部字段说明）/ChoiceSelector/choiceImpact（切换预览）/ReferenceRelations（入站出站）/RequiredDefaultsAction
│  │  ├─ Validator/ValidationPanel.vue   # 问题面板（底部停靠）
│  │  ├─ ImportExport/ImportDialog.vue   # 导入预览/冲突/警告
│  │  ├─ ConfigSets/              # ConfigSetManager（首页列表）+ RecoveryPanel（隔离区/快照恢复）
│  │  ├─ Modules/ModuleManager.vue + EcucDefinitionSession.ts  # 模块定义导入向导
│  │  ├─ BatchEdit|Search|History|Theme/ # 批量面板/全局搜索/撤销 hooks/主题
│  ├─ views/                      # HomeView（首页）/WorkspaceView（工作区主视图，组装三栏+底部停靠+浮层）/WizardView（占位"开发中"）/ImportExportView
│  ├─ workers/EcucDefinition.worker.ts   # 官方大文件解析 Web Worker
│  └─ models/ types/ utils/       # 早期模型残留/基础类型/uuid
├─ bswmd/                         # ★ 预生成模块定义资产（由 §5 步骤 7 的脚本产出，入 git）
│  ├─ dem_bswmd.json              # 官方 CP 4.4.0 Dem 定义（67 容器/162 参数/64 引用；$source 含溯源 hash）
│  └─ legacy/dem_bswmd_4.2.2.json # 旧版只读恢复资产（仅供 S1 隔离区识别，不是可编辑定义）
├─ scripts/
│  ├─ gen-bswmd-from-arxml.mjs    # 官方 ARXML→bswmd JSON 抽取器（确定性输出+contentSha256+changelog）
│  ├─ test-collection-guard.ts    # test:verify 收集守卫（磁盘测试文件数 vs runner 集合）
│  ├─ extract-ecuc-module.mjs / map-legacy-dem-ids.mjs  # 辅助抽取/旧 ID 映射
│  ├─ desktop/                    # Start-Configurator.ps1（起 dev 并开浏览器）/Install-DesktopShortcut.ps1/README
│  └─ autodev/                    # AI 协作调度脚本（engine/dispatch/wait 等；重建产品本体不需要，可整目录跳过）
├─ tests/                         # 22 个 *.test.ts + fixtures/（官方片段+合成定义 synthDem）+ helpers/
├─ docs/product-design/           # 设计文档（00-SCOPE/01-IA/02-TECH 含 ADR/03-ROADMAP 等）——理解设计用，重建不强制
├─ .codex/                        # AI 协作协议（STATE.json/任务契约/评审报告）——过程设施，产品重建不需要
├─ project-engineering-file.md    # 工程决策档案（ADR 摘要）——参考
└─ .temp/                         # 本地过程文件（gitignore；见清理清单）
```

## 5. 实现步骤（从空目录起）

> 依赖版本全部照 §3；每步先建文件再填内容；步骤 3–7 为领域层，务必在 UI 之前完成并有测试跟随。

1. **脚手架**：输入=Node≥18 环境。动作=`npm create vite@latest . -- --template vue-ts` 后按 §3 改 `package.json` 依赖并 `npm install`；配置 `vite.config.ts`（端口 3000、`@` 别名、vitest jsdom/globals、cacheDir `.temp/vite-cache`）；建 `src/main.ts`（Pinia+router+Element Plus 全量注册+主题）、`src/router/index.ts`（四条路由）、`App.vue`。产出=可 `npm run dev` 打开空首页。
2. **类型与配置模型**：写 `src/core/config/ConfigTypes.ts`（ConfigInstance/ConfigContainer/参数 Map/引用 Map/isConfigured 语义）与 `ConfigInstance.ts`（创建/遍历 `ConfigTraversal.ts`/取值 `ConfigValues.ts`，false 与 0 是合法已配值）。产出=配置内存模型 + 单测。
3. **BSWMD 定义层**：定义 `BswmdTypes.ts`（容器/参数/引用/CHOICE/multiplicity/destinationRefs）；写 `BswmdParser.ts`；并从官方 CP 4.4.0 ARXML 生成 `bswmd/dem_bswmd.json`（步骤 7 的脚本，先于 UI）。产出=可加载的 Dem 定义。
4. **实例生命周期与约束**：`ConfigClone.ts`/`ChoiceSelection.ts`/`RequiredDefaults.ts`/`ReferenceCandidates.ts`（destinationRefs 数组全遍历，兼容旧单值字段）；`ConstraintEngine.ts` + `DefinitionConstraints.ts`（校验规则从定义驱动，禁写死模块名）；Dem 特例放 `src/modules/dem/DemConstraints.ts`。产出=添加/克隆/删除/校验可跑。
5. **撤销与存储**：`HistoryStack.ts`+`ConfigDelta.ts`（差量撤销，20 步逐字节）；`configStore.ts` 建 store 并实现**存储协议**——存储键：`autosar-config-sets-v3`（主库 LIBRARY_KEY，唯一写点）、`autosar-recovery-state`（隔离 sidecar）、`autosar-config-sets-v4-draft`（刷新草稿）、`autosar-recovery-snapshot-<ts>`（写回前自动快照）；加载不写库、不兼容数据进隔离区、解锁写回前强制快照。产出=创建/切换/保存/刷新恢复/隔离保护全链路。
6. **导入导出**：`XmlSafety.ts`（DOCTYPE/实体剥离）→ `Arxml.ts`（导出 r4.0 + 导入 r4.0/r4.2.2 兼容警告；参数/引用按 BSWMD 定义顺序序列化与还原，禁止字母排序；ELEMENT 顺序保真）→ `Csv.ts`（仅 DTC 模块，否则明确拒绝）→ `ImportPlan.ts`（预览/冲突/三策略）→ `ConfigJson.ts`（JSON 往返 + isConfigured 语义）；`EcucArxmlImporter.ts` + Worker 处理官方大文件（14.6MB 解析 <3s）。产出=四类 I/O 全通。
7. **定义抽取脚本**：`scripts/gen-bswmd-from-arxml.mjs`——读官方 ARXML，按模块输出确定性 JSON（固定键序、无时间戳、`$source` 含原文件 SHA256 与 `contentSha256`、`changelog.json` 记录字段级 diff）；用法 `node scripts/gen-bswmd-from-arxml.mjs <Module> [source.arxml] [output.json]`。产出=`bswmd/*.json` 资产。
8. **输出闸门与 C 生成**：`OutputGate.ts` 纯函数 `evaluateOutputReadiness(config, module)`——四输出（校验面板/ARXML/CSV/C）同一动作内调用同一函数**重新求值**，禁止跨动作缓存结果；未配置不导出、必填拒绝列清单、外部引用只读；`TemplateEngine.ts`+`CGenerator.ts`（Handlebars 生成 .h/.c）。产出=四输出一致性 + C 产物。
9. **UI 工作区**：`WorkspaceView.vue` 组装三栏（工程侧栏 212px + 配置树 240px + 表单区）+ 底部停靠（问题面板/字段说明 v-show 切换）+ 浮层；`ConfigTree`/`DynamicForm`（四态行）/`ContainerContextMenu`（三项竖向菜单：实测定位、边界翻转、键盘导航、aria-disabled+title+aria-description；新建二级仅列子定义名）/`ImportDialog`（预览冲突暂存）/`ChoiceSelector`（预览+撤销）/`ValidationPanel`/`RecoveryPanel`/`GlobalSearch`。所有取消路径零写入。产出=验收清单功能面。
10. **测试与守卫**：39 个测试文件——core 纯逻辑、io/XXE 攻击矩阵、往返保真、跨模块引用（规则表/端到端/空态）、UI 组件挂载、恢复协议、菜单定位、性能门禁；fixture 双轨（`tests/fixtures/` 官方片段 + `tests/helpers/synthDem.ts` 合成定义）；`test-collection-guard.ts` 防收集缺失。产出=`npm run test:verify` 39/39 文件、430 passed（0 failed）。
11. **桌面入口（可选）**：`scripts/desktop/Start-Configurator.ps1`（后台起 `npm run dev`，健康检查 `http://localhost:3000/workspace` 后打开浏览器；`-NoBrowser` 仅起服务）与 `Install-DesktopShortcut.ps1`。产出=双击即用。

## 6. 配置与凭证

| 项 | 字段/位置 | 获取方式 |
|---|---|---|
| 外部 API/密钥 | **无**（纯前端，零凭证） | — |
| dev 端口 | `vite.config.ts` `server.port=3000` | 如冲突改此项并同步 desktop 脚本 |
| 官方定义源 | CP 4.4.0：`AUTOSAR_MOD_ECUConfigurationParameters.arxml`（autosar.org 官方下载，约 15.4MB，用于步骤 7 生成资产） | autosar.org 标准包；生成后资产入 git，重建者若沿用仓库内 `bswmd/dem_bswmd.json` 可不重新下载 |
| 存储键 | `autosar-config-sets-v3` / `autosar-recovery-state` / `autosar-config-sets-v4-draft` / `autosar-recovery-snapshot-<ts>` | 代码内常量（configStore 71–74 行附近）；改名=破坏旧用户数据，禁止 |
| 测试缓存 | `cacheDir: .temp/vite-cache` | .gitignore 已含 `.temp` |

## 7. 约束与前置条件

1. **纯前端铁律**：无后端、无网络上传、无账号体系；一切数据在浏览器 IndexedDB。
2. **core 纪律**：`src/core` 零 UI 依赖、零模块名硬编码（模块特例仅 `src/modules/<mod>/`）；规则由 store 注入。
3. **存储纪律**：LIBRARY_KEY 是主库唯一写点；加载不写库；不兼容数据隔离不覆盖；写回前强制快照。
4. **标准口径**：CP 4.4.0 定义；导出 namespace r4.0；不做变体；跨模块引用**仅限当前工程内可选、可校验、可导出**——候选来自工程作用域（`模块 › 路径` 标签、`/Config/<模块>/<路径>` 路径），无工程上下文时候选为空、不静默丢弃；校验产出 5 类 ruleId：`OUTPUT-EXTERNAL-REQUIRED`（必填未选，ERROR）、`-MISMATCH`（目标定义路径不匹配，ERROR）、`-DANGLING`（目标不在当前工程内，ERROR）、`-NO-SCOPE`（已选目标但无工程上下文，ERROR）、`-VERSION-DRIFT`（目标模块版本与工程不一致，**WARNING 不阻塞导出**）。
5. **测试纪律**：不删测试/不削断言；`test:verify` 必须过收集守卫；性能门禁（`npm run test:perf`）的预算不得放宽，且**发版前必跑**（见 §8 第 3 条）。
6. **路径**：项目目录含中文（`教培业务/配置器`）实测可用；Node ≥18。
7. **已知既有项**：主包约 1.19MB（Element Plus 全量引入）体积警告保留不阻断，优化属后续阶段；Web Worker 用于大文件解析。

## 8. 验证方法

1. `npm install` → `npm run build`：零错误通过（允许既有大 chunk 警告）。
2. `npm run test:verify`：输出 `39/39` 文件全收集（collection guard）+ `430 passed / 6 skipped / 0 failed`（该基线随用例增长，以实际输出为准，判定标准是 **0 failed**）。
3. `npm run test:perf`：**发版必跑**（opt-in，不在 `test:verify` 内，避免 jsdom 抖动污染主套件）。输出 `Tests 2 passed`，控制台两行 `perf:` 应打印三次原始值与中位数，中位数分别在预算 300ms（500 实例搜索）/ 800ms（20 步撤销）内。预算按「捕捉数量级退化」标定；每个用例连续测量 3 次取中位数后断言（消除沙箱/机器级停顿尖峰，实测尖峰可达正常值的 3~4 倍）。当前中位数实测约 **82~186ms**（搜索）/ **376~644ms**（撤销），随机器负载浮动，故预算对应约 **1.6~3.7× / 1.2~2.1×** 的退化余量——**不要读成统一的「2 倍」**。**不得为让某次运行变绿而放宽**；若确需调整，须先证明是实现退化还是标定过紧。
3. `npm run dev` → 浏览器 `http://localhost:3000`：首页可创建配置集；按 §2 清单从「导入模块定义」开始逐条勾选；重点回归：取消删除零写入、引用弹窗四方式退出零写入、CHOICE 切换预览与单步撤销、隔离区横幅四动作、刷新恢复草稿、四输出一致（校验/ARXML/CSV/C 同一配置同结论）。
4. 逐字节抽查：导出 ARXML 首行 namespace 为 `http://autosar.org/schema/r4.0`；构造「必填引用未配置」的 CanIf 导出应被拒并给出该项原因。

## 9. 复盘结论

从零重做当前功能，复杂度**中高但已大幅收敛**：一次性认知成本集中在五处——AUTOSAR ECUC 参数模型与 BSWMD 定义结构、官方 14MB ARXML 的解析与多版本口径（r4.0 namespace ≠ 发布版本）、浏览器本地数据的"不覆盖旧数据"恢复协议（隔离/sidecar/快照三件套）、四输出同源闸门的纯函数语义、以及大量"取消零写入/暂存确认"类交互纪律；这些在本说明书中已全部固化为可执行步骤，重做时**不再需要试错**。可复制的工程量本身约 8–10 个步骤的忠实实现（core 领域层 + 22 个测试文件是主体），配合测试基线逐层验收即可。本说明书消除的成本：标准口径调研、存储协议设计、闸门语义推敲、UI 交互纪律清单——这四项是历史上最耗时的部分。

## 10. 版本记录

| 版本 | 日期 | 基线 | 终态差异摘要 |
|---|---|---|---|
| v1.0 | 2026-11-06 | git `7310754`（代码终态 `65308ee`，TASK-018 验收版） | 首次生成：完整描述当前已验收功能面（配置/编辑/校验/四输出/恢复/交互简版），不含进行中的工程向导、首页改版、内置模块、悬停直选（后续里程碑更新时追加） |

---

## §10 Codex 交接（2026-11-12，主理人审定）

### 当前状态（HEAD `647fcd7`）

- 基线：`npm run test:verify` → **40/40 文件、438 passed / 6 skipped / 0 failed**；`npx vue-tsc --noEmit` → 0；`npm run test:perf` → 2/2（预算 300/800ms，三次取中位数）
- 已交付主线：界面术语「配置集→模块配置」；跨模块引用工程内可选/可校验/可导出（5 类 ruleId）；新建/克隆模块配置自动并入当前工程（C1）；首页多工程打开串号修复；导出→导入往返闭环（含嵌套容器）
- 产品模型（不可违背）：模块配置必须且只能属于一个工程；不存在孤儿配置集；跨模块候选只限当前工程

### 待办（按优先级）

1. **孤儿/共享数据清理**：历史数据中可能存在「多工程共享同一模块配置」或孤儿配置集，判定标准 = `uuid ∈ 某工程 setUuids`（`unassignedSets` 是硬编码 `[]`，不能用于判定）。给恢复面板加检测与一键清理。
2. **旧语义用例重写**：4 个 skip 用例（tests/projects.test.ts:91/257 等）按「配置必须归属工程」的新模型重写。
3. **DBC/LDF「解析→确认→生成」**（SRS §5 下一阶段）。
4. **性能优化储备**：撤销链路 20 步实测 376~644ms（预算 800），若逼近阈值优先优化 `WorkspaceView` 渲染而非上调预算。

### 审核纪律（王上裁定：Codex 提交，主理人审核）

- 每条改动必须通过 `npm run test:verify`（0 failed）+ `npx vue-tsc --noEmit`（0 错误）
- 三条安全断言不得削弱：`tests/arxml-interoperability.test.ts` 的 `resolveReferenceCandidates(...)===[]`（不得伪造本地引用）、`tests/arxml-fidelity.test.ts` 的 `not.toContain('跨模块')`、`tests/catalog.test.ts`（git 零改动基线）
- **禁止 `it.fails` 当"通过"**：锁缺陷用例修好后必须摘标记、删"现状断言"
- 行为变更需先改 `HANDOFF.md` §4 标准口径，再改代码
- 不接受「只报 Tests 行」——必须报 `Test Files N passed (N)`（防整文件收集失败被掩盖）
- UI 文案不出现「配置集」「本期不支持跨模块」等旧词

---

## §11 现存问题清单（2026-11-12 10:10 复核，主理人整理）

### P0-1 首页多工程打开串号 —— **代码修复、真实路由回归通过；用户浏览器待复验**

2026-11-12 Codex 复核：真根因已在无共享数据的三工程场景稳定复现。`WorkspaceView.onMounted → restoreScene` 使用全库 UUID 校验旧全局 `onesar-workspace-scene-v1`，在首页 `openProject(DEMO2)` 之后再次 `switchConfigSet(DEMO1)`。旧测试用占位工作区，未执行这段挂载逻辑。

- 修复：现场按工程存储，恢复只接纳当前工程成员；恢复完成前禁止写回现场。初始化等待主库和索引都完成，打开失败保持原工程及选择。
- 回归：真实 HomeView → router → WorkspaceView，存储残留 DEMO1 activeUuid + v1 现场；依次打开 DEMO2、ZZ、DEMO1、DEMO2，检查工程名、模块树、活动模块及同工程 NvM 页签恢复。
- 历史共享数据不能继续用“标题显示 DEMO2”视为通过：现改为阻止打开共享记录、禁止提供含共享记录的工程引用作用域，原库零改写并显示拆分提示。原 b9f500f 回归据此加强断言；三个指定安全测试文件保持零改动。
- 浏览器工具因无法可靠识别 Windows 浏览器 URL 而停止，未操作实际用户数据，**未声称完成用户三个真实工程的浏览器验收**。见 `.codex/reports/P0-PROJECT-OPEN-REPORT.md` 及验证输出。

以下为修复前问题记录，保留追溯：

- **现象**：主页有 3 个工程（DEMO1 / DEMO2 / ZZ_调研测试_DEL），点任意一个进入的都是 DEMO1。
- **已做**：`b9f500f` 修了 `switchConfigSet` 的归属反查覆盖（多工程共享同一模块配置时 `projects.find` 取首个匹配、覆盖 openProject 设定的当前工程），带回归用例（两工程共享场景 6/6 过）。
- **线上 07bd068 用户实测仍复现** → 上述修复只处理了一个次要因素，**真根因未找到**。
- **已排除**：switchConfigSet 归属覆盖（有回归用例锁）；C1 自动挂工程逻辑（attach 幂等、无孤儿，有 5 条用例）。
- **排查方向（按嫌疑排序）**：
  1. `initialize()` 时序：`useProjectNavigation.navigate` 先 `store.initialize()` 再 `store.openProject(uuid)`。initialize 会从 localforage 恢复上次会话的 `activeUuid`（大概率残留在 DEMO1 的配置集）。查 initialize 是否存在**异步 restore 在 openProject 之后才完成**（如 WorkspaceView onMounted 再次 initialize / 竞态），把 activeUuid 拉回 DEMO1。
  2. `store.openProject` 的选集逻辑 `sets.find(s => s.uuid === activeUuid.value)?.uuid ?? sets[0].uuid`：若 DEMO2.setUuids 与 DEMO1 有交集且残留的 activeUuid 恰在交集中，会切到 DEMO1 的**模块配置**——当前工程虽显示 DEMO2，但模块树内容是 DEMO1 的，用户感知即「进了 DEMO1」。注意共享数据可能让这个分支必然命中。
  3. 数据层：三个工程的 setUuids 存在交集（历史共享），可能需要一次性数据迁移/拆分。
  4. 路由恢复：路由 push('/workspace') 后是否有 restore-from-storage 逻辑再覆盖。
- **验收标准**：点 DEMO2 → 模块树为 DEMO2 自己的模块清单；点 ZZ 同理。需写 e2e 用例模拟「storage 残留旧 activeUuid + 三工程」场景；并给出一次性数据修复脚本或 UI 提示（拆分共享配置集）。

### P0-2 历史数据共享/孤儿清理

- 判定标准 = `uuid ∈ 某工程 setUuids`（`unassignedSets` 硬编码 `[]`，不可用于判定）。恢复面板加检测与一键拆分/清理。与 P0-1 的数据层根因可能同源，**建议先做 P0-2 的数据诊断再修 P0-1**。

2026-11-12 进度：已交付共享/未归属/缺失诊断明细、共享编辑保护及包含原工程索引的完整恢复包导出，满足 P0-1 的数据修复 UI 提示要求。此轮**不执行自动拆分或删除**；未能读取用户实际浏览器数据，因此不能断言三个真实工程存在共享。P0-2 的一键迁移仍待实现，须先备份、给每个工程生成独立模块/容器 UUID、重映射工程内单值及多值引用，并验证失败回滚和幂等。

同日用户反馈后：移除首页及工作区常驻诊断横幅，避免占用编辑空间和深浅主题混色；保留后台诊断与导出数据，不把“隐藏横幅”当作历史记录已修复。模块置灰调查见 `.codex/reports/UI-OWNERSHIP-BANNER-REPORT.md`。

### P1 旧语义用例重写

- 4 个 skip 用例（tests/projects.test.ts:91/257 等）按「配置必须归属工程」新模型重写。

### P2 DBC/LDF「解析→确认→生成」（SRS §5 下一阶段）。

### P3 性能储备

- 20 步撤销实测 376~644ms（预算 800ms），逼近时优化 WorkspaceView 渲染，不上调预算。
