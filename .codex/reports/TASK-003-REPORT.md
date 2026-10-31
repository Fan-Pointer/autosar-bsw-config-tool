# TASK-003 实现与自检报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 ID | TASK-003 |
| 事件 | `5eb92ab8eb63c29a0cdda817`（implement） |
| 轮次 | 0 |
| 自检完成时间 | 2026-11-01T01:09:06+08:00 |
| 构建结果 | `npm run build` 通过，含 `vue-tsc --noEmit` |
| 测试结果 | `npm test -- --run`：3 文件、75 测试全部通过（原 52 + 新增 23） |
| 当前交接状态 | **受阻，未提交 Git、未推送、未设置 SUBMITTED；STATE 仍为 READY** |
| 当前代码版本绑定 | 尚无 submissionCommit；恢复交接后先提交本轮代码和报告，再单独提交绑定状态 |

本报告为 Codex 实现自检记录，不是 WorkBuddy 评审或批准。浏览器实测未完成，不能据本报告声称已完成浏览器验收。

## 交付文件

| 文件 | 状态 | 备注 |
|---|---|---|
| `src/core/config/ConfigClone.ts` | 新建 | 全配置/子树深拷贝，两遍 UUID 和引用重映射 |
| `src/core/config/ConfigInstance.ts` | 修改 | 同源增删可用性查询、父节点定位、受上限约束的克隆 |
| `src/core/config/ConfigTypes.ts` | 修改 | 配置集名称；兼容旧存储无名称记录 |
| `src/core/bswmd/BswmdTypes.ts`、`BswmdParser.ts` | 修改 | 可选的定义级空态操作文案 `initialAddLabel` |
| `bswmd/dem_bswmd.json` | 修改 | DTC 定义提供「添加第一条 DTC」文案 |
| `src/core/constraint/DemConstraints.ts` | 修改 | DEM-001 为重复值的所有参与实例生成字段级违规 |
| `src/stores/configStore.ts` | 修改 | 多配置集管理、实例生命周期、存储恢复、切换保护和实时校验 |
| `src/ui/ConfigSets/ConfigSetManager.vue` | 新建 | 配置集新建、切换、克隆、确认删除和元数据 |
| `src/ui/ConfigTree/ContainerActions.vue` | 新建 | 定义选择、增删克隆、确认框、错误定位及右键菜单复用 |
| `src/ui/ConfigTree/ConfigTree.vue` | 修改 | 由引擎结果驱动的节点状态与右键事件 |
| `src/views/HomeView.vue` | 修改 | 真实配置集列表和打开入口 |
| `src/views/WorkspaceView.vue` | 修改 | 生命周期接线、空态引导、菜单、离开前保存和未保存刷新提醒 |
| `tests/lifecycle.test.ts` | 新建 | 15 项克隆、存储、生命周期与错误诊断测试 |
| `tests/ui.test.ts` | 修改 | 新增 8 项真实 Vue/Element Plus 组件交互测试 |
| `tests/core.test.ts` | 修改 | 加强重复 DTC 诊断断言，验证两条冲突都被报告 |

## 验收标准自检

以下功能勾选表示自动测试覆盖通过；独立浏览器实际操作统一仍待验证。

- [x] 打开 DEM 工作区：根 `DemConfigSet` 存在（lower=1），6 类子容器为空，显示「添加第一条 DTC」引导 → 命名创建后组件测试检查根、空子集与引导，点击后出现表单。
- [x] 连续新增 3 条 DTC，名称为 `DemDTC`、`DemDTC_2`、`DemDTC_3`，三者 UUID 不同 → lifecycle 测试逐项比较名称与 UUID 集合。
- [x] 删除第 2 条后再新增，名称不与现存冲突 → 检查所有存活名称去重；被删选中项回退父节点。
- [x] 对 `upper=1` 的定义，第 2 次新增按钮禁用并说明原因 → 模块根选择器组件测试实际读取禁用属性及 `upper multiplicity 1 reached`。
- [x] 对 `lower=1` 的定义，删除按钮禁用并说明原因 → 核心和右键菜单组件测试检查 `lower multiplicity 1 required`。
- [x] 克隆配置集后修改副本 DTC 的 Attributes 引用，原配置集不受影响 → 核心及 store 测试比较目标 UUID，并切回源集检查原值。
- [x] 删除配置集有二次确认，删除当前项后自动切换 → 真实 Element Plus 确认框分别点击「取消」「确认删除」，检查集合及当前 UUID。
- [x] 构造「两条 DTC 同值」，树对应节点变红，点击违规项定位字段 → 组件测试检查两个节点的 `status-error`、选中 key、`document.activeElement` 与 `scrollIntoView`。
- [x] 刷新后配置集、容器实例、参数值恢复 → 以新 Pinia/store 从序列化存储恢复两个配置集，检查当前 UUID、Map、参数、引用，并验证恢复后仍能新增。真实浏览器刷新尚待验证。
- [x] `npm run build` 通过（含 `vue-tsc --noEmit`）。
- [x] `npm test -- --run` 全绿，75 ≥ 60。
- [x] `src/core/**` 无 vue/pinia/element-plus。
- [x] `src/ui/**`、`src/views/**` 无 `Dem[A-Z]` 字段名硬编码。
- [x] `src/`、`tests/` 无 `any`、无 `@ts-ignore`；没有关闭 strict 或删除测试。
- [x] 新增导出函数和管理器方法有 JSDoc；有输入的函数包含 `@param`，函数包含 `@returns`。
- [x] 报告含可复现步骤。
- [ ] 独立浏览器功能复核及视觉检查 → 本地浏览器访问在 Work 设置中禁用。
- [ ] Git 代码提交、状态提交、推送和完整 submissionCommit 绑定 → 受阻保留现场，未冒充完成。

## 可复现步骤清单

预览沿用父调度层管理的 `http://127.0.0.1:3000/workspace`；本轮没有启动常驻服务，也没有替换父层预览页。以下是供恢复后执行的操作清单，**不是已执行的浏览器记录**。

1. 首页点「新建配置集」→ 选 Dem、输入「基础配置」、点「创建并打开」→ 进入工作区，出现根容器、四个根参数与「添加第一条 DTC」。
2. 点「添加第一条 DTC」→ 树出现 `DemDTC` 并自动选中，表单出现定义中的参数及引用。
3. 点根 `DemConfigSet` → 点「新增子项」→ 点 `DemDTC`；重复一次 → 三项依次命名 `DemDTC`、`DemDTC_2`、`DemDTC_3`。
4. 选第 2 条 → 点「删除实例」→ 先取消，项仍存在；再删除并确认 → 回到根。再次新增 DTC → 名称不与剩余项重复。
5. 选树顶模块 Dem → 点「新增子项」→ 根定义按钮禁用，说明 `upper multiplicity 1 reached`。选根容器 → 删除禁用，显示 `lower multiplicity 1 required`。
6. 选根 → 新增 Attributes；选某条 DTC，在引用下拉框中选择它 → 保存。点「克隆配置集」→ 新集自动打开；副本 DTC 引用指向副本 Attributes。更改副本引用后切回原集 → 原引用不变。
7. 选某条 DTC → 点「克隆实例」→ 名称递增，参数复制；指向该子树外部的引用清空，校验提示重新选择。原实例不受影响。
8. 两条 DTC 设置相同数值 → 两个树节点和祖先变红；点右侧 `DEM-001` 违规 → 对应容器/字段被选中，表单滚动并聚焦数值输入框。改为不同数值 → 重复值错误消失。
9. 右键一个树容器 → 出现「新增子项／删除实例／克隆实例／定位错误」。必填根无法删除；有字段错误的实例可以定位错误。
10. 修改字段 → 点配置集选择器切到另一集，再切回 → 修改保留。返回首页 → 本机配置表显示真实名称、修改时间、容器数和错误数，点「打开」返回工作区。
11. 修改字段后点「保存」，再刷新 → 配置集、实例、参数、引用恢复；未保存时刷新应提示存在未保存更改。
12. 删除当前配置集并确认 → 切换到剩余第一项；删除最后一项 → 空态保留「新建配置集」按钮，刷新不会复活旧的单配置存储。

## 关键实现说明

1. **克隆引用规则**：先遍历整个复制范围分配新 UUID，再重映射引用，因此前向引用、互相引用、自引用都能处理。整个配置集内部引用全部重映射；子树外目标和既有悬空目标清空，交由同一约束引擎提示补选。参数/引用 Map 和成员对象均独立，definitionRef 保留。
2. **上下限单一实现**：store 不判断 multiplicity。按钮读取管理器的 `getAddOptions` / `getRemovalReason`；核心实际增删也调用相同的检查。克隆最终走 `addContainerInstance`，不绕过 upper。
3. **存储与切换**：v3 以一个本地库记录全部配置集及当前 UUID，递归序列化 Map。首次读取可迁移 v2 单配置；已有空 v3 库不会回退读取旧配置。切换前保存失败则保持原集及脏状态。删除集写入失败则恢复原集与选择。写入串行化，旧快照完成时不能清除较新编辑的脏标记。
4. **状态颜色**：每次编辑和生命周期变更调用 ConstraintEngine；树只映射 ERROR/WARNING/无诊断及向父节点聚合，不复制业务规则。为使冲突两边都可定位，DEM-001 从仅报告后出现项改为报告同值组的每一项；旧测试相应从 1 条加强为 2 条。
5. **模块可插拔与空态**：第一条 DTC 的引导文案属于 BSWMD 定义的可选元数据，其他模块没有该元数据时显示通用「添加 <定义名>」。新增模块不需要改工作区逻辑。
6. **范围**：未做 JSON/ARXML/CSV 导入导出、undo、主题、搜索、拖拽、引用图、定时自动保存等后续任务。手动保存、切换保存、结构操作保存与离开工作区保存用于本轮数据保留。

## 自检命令输出

```text
$ npm run build
> vue-tsc --noEmit && vite build
vite v5.4.21 building for production...
✓ 1787 modules transformed.
✓ built in 19.63s
（退出码 0；已有主包 >500kB 的体积提示仍存在，未作为本轮范围调整。）

$ npm test -- --run
✓ tests/core.test.ts (45 tests)
✓ tests/lifecycle.test.ts (15 tests)
✓ tests/ui.test.ts (15 tests)
Test Files 3 passed (3)
Tests 75 passed (75)
Duration 9.08s
（GCC 编译检查正常执行，无跳过。）

$ rg -n 'vue|pinia|element-plus' src/core
无匹配
$ rg -n 'Dem[A-Z]' src/ui src/views
无匹配
$ rg -n '\bany\b|@ts-ignore' src tests
无匹配
$ git diff --check -- bswmd src tests
无空白错误（仅 Git 行尾转换提示）
```

最初默认沙箱执行 Vitest 在 esbuild spawn 阶段报 EPERM；之后通过正常 `require_escalated` 受控审批运行测试与构建成功，没有绕过审批或修改安全设置。真实浏览器调用另受到下述限制。

## 待确认／恢复条件

| # | 事项及证据 | 本轮处理 | 处理人／恢复条件 |
|---|---|---|---|
| 1 | `mcp__cua_repl.js` 调用 `cua.getState()` 返回 `browsers: []`，错误 `Browsers: Error: Local browser use is disabled in Work settings` | 停止浏览器操作；未切换原生窗口或其他技术绕过；未声称浏览器验证通过 | 用户/父任务正常开放本地浏览器访问，或由有权访问的独立验收方补齐真实浏览器复核 |
| 2 | 01:09 的 `git status --short .codex` 显示他方未提交的 `.codex/review/AUTODEV-REVIEW.md`；本轮起始工作树是干净的 | 不改/不暂存评审文件，不与他方同时提交或改 STATE；保留本轮实现与报告 | WorkBuddy/父任务完成其评审提交同步并释放交接；恢复时重新核对 STATE、契约哈希、busy/done 与 Git |
| 3 | `.codex/decisions/` 不存在 | 检索仓库，阅读 `docs/ARCHITECTURE-v2.md` 第 6 节 ADR；本轮不调整架构 | 无新增架构决策请求 |

恢复后的剩余工作：补齐可用的浏览器实测；复核上述共享交接条件；仅暂存本轮明确文件，提交代码/测试/报告，取得完整 SHA；原子更新允许的 task 字段为 SUBMITTED（round 保持 0），另提交状态并 push。不得启动下一事件或代写评审。
