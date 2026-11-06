# TASK-016 评审意见（第 0 轮 · 冻结快照）

> 评审方：WorkBuddy ｜ 时间以本文件 git 提交时间为准 ｜ 判定：**APPROVED**

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-016 / round 0（W6 实例右键紧凑菜单 + 新建子容器全部直选） |
| reviewedCommit | `341b05fdc2373ef2591fc455d2db9a550e9ab2d9`（实现）；交接提交 `8fe9f860775c7632b1ac9cb62a7bebb59ab4396a`（STATE SUBMITTED，仅 status/submissionCommit/submittedAt 三字段，合法） |
| 契约 | ACTIVE = TASK-016，哈希 `80a0946e22521ecc40545fdf479bccc6d1eeab6955ffbf37a3215cb422dfff07`（评审方实算一致） |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 3 建议 |
| 验收 | A1–A2 / B1–B4 / C1–C3 / D1–D3 / E1–E2 全达成；验收标准 1–6 全过 |

---

## 一、独立复核证据（本机重跑/实读）

### 1. 运行

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 独立重跑通过（12.87s） |
| **独立 `npm run test:verify`** | **19/19 文件收集守卫通过 + 289/289 passed, 0 fail, 0 skip**（277 基线 + 12 新增：ui 7 + container-menu 5） |
| `src/core` diff | **0 行**（`git diff 86df94b 341b05f -- src/core` 为空）✓ 红线达成 |
| 越权检查 | src diff 对 `r4.0/r4.2.2/AUTOSAR_NAMESPACE/destinationRefs/changelog` 零命中；fixtures/bswmd/scripts 无 diff → **无 TASK-015 越权** ✓ |
| 测试删削 | tests diff 仅 4 行删除 = 报告声明的两处定位调整（data-container-id 找实例 / 删除按钮含内联原因），均有替换行，断言未削 ✓ |

### 2. 逐组核验（契约对照）

| 组 | 核查 |
|---|---|
| **A1/A2 紧凑竖向** | 新增独立 `ContainerContextMenu.vue`（346 行），`position: fixed` + 竖排 button + `max-height calc(100vh-16px)` overflow auto；WorkspaceView 不再以 `context` 模式复用 ContainerActions（旧横排仅存于工具栏）。截图 01 实证：竖向菜单、克隆/删除禁用项 **inline 原因**（upper multiplicity 1 reached / lower multiplicity 1 required）直接消费 core 文案——W6-1/2/4/6 ✓ |
| **B1–B3 全子定义直选** | `store.containerActionsFor(uuid)` 复用 `manager.getAddOptions/getRemovalReason`（**零规则复制**）；二级列表 `v-for childOptions` 完整列出，`add(definitionUuid, parentUuid)` 显式 UUID 直建；空态「此容器没有子定义」有用例断言 ✓ |
| **B4/D1 弹窗与子列表** | 工具栏「选择允许的子定义」弹窗保留；ContainerActions `@opening` → WorkspaceView 置空右键菜单。**二级为单面板层级切换**（`childrenOpen` 翻转模板，「‹ 返回容器操作」返回），任何时刻仅一张菜单面板——满足契约 D1「父级收起、无叠层」语义，据实认可该设计（与参考站父子并排不同，报告已如实声明）✓ |
| **C1/C2 上下文绑定** | `ContainerNavigator.context()` **不再调用 `select(node)`**，改为 emit 显式 `ContainerContextTarget{type, containerUuid, definitionRef}`；定义节点四项全禁用并提示「请使用树工具栏＋或右键实例」。用例「never borrows the previous instance for a definition context menu」+「locates the error on the context target」实证右键目标 ≠ 表单选择 ✓ |
| **C3 删除零写入** | `remove()` 先捕获 uuid/shortName → `close()` → `await nextTick()` 后才弹确认（修浮层叠弹窗）；取消路径零写入有用例硬断言：**`JSON.stringify(store.config)` 逐字节不变 + `local.setItem` 零调用**；确认后 `store.activeUuid` 变化则拒绝跨配置操作 ✓ |
| **D2/D3 生命周期与键盘** | WorkspaceView `watch([showSets, showModules, showImport, showGenerated, isImporting])` 统一关闭 + 外点（pointerdown/click capture）+ Tab；用例覆盖外点/工具栏弹窗/模块对话框/导入/配置集切换五时机。键盘 上下左右/Home/End/Enter/Space/Esc/Tab 全路径有用例，Esc 后焦点恢复到树 treeitem ✓ |
| **E1/E2 定位边界** | `placeContainerMenu` 实测尺寸、右/下翻转、`Math.max(gap,…)` 非负钳制；it.each 展开 1366/1400/683/700 四视口 + 常规/负坐标 = 5 用例；`edge-dom.json` 实测 683×384（=1366@200% CSS 等效）rect=(9,8,360,320.4) 左翻转+顶部钳制，与截图 04 一致；项目菜单同样迁移至实测定位（旧 310×370 假定已删）✓ |

### 3. 证据审阅

- 截图 01（紧凑菜单+inline 原因）、03（「选择允许的子定义」弹窗打开、**右键浮层数量=0**、无叠层）评审方亲眼复核属实。
- `add-result-dom.txt`：右键 DemEventParameter → 新建 DemCallbackClearEventAllowed 落于其下，原表单选择未变，撤销恢复——与 C1 断言互证。
- 截图证据为真实浏览器（3001 内存样例），报告明确不宣称磁盘持久化实测（由既有持久化/恢复用例承担）——边界诚实 ✓。

## 二、建议项（🟡，不阻塞）

1. **🟡-1** `evidence/task016/typecheck.log` 为 0 字节空文件入库——证据卫生；建议后续提交前清理空证据文件或补实际内容。
2. **🟡-2** 「配置集切换关闭右键菜单」目前由树重渲染/`@selected` 间接触发（WorkspaceView watch 未含 `store.activeUuid`），本轮测试实证行为正确；建议后续显式 watch `activeUuid` 关闭，防树结构不变场景回归。
3. **🟡-3** `.menu-arrow` 同时使用 `float: right` 与父级 flex `margin-left: auto`，二选一即可（无害洁癖项）。

## 三、裁定

- **TASK-016 round 0 = APPROVED**（绑定 `341b05fdc2373ef2591fc455d2db9a550e9ab2d9`）。
- 🟡-1/🟡-3 就地择机清理即可，不另立任务；🟡-2 并入后续 UI 任务（可随 S4 剩余项）。
- **按队列恢复 TASK-015（S3b）READY**：契约以归档 `TASK-015-CONTRACT.md` 恢复为 ACTIVE（哈希 `9f2bb2eb…fe200e` 实算一致），stage 回 PHASE-15；TASK-014 🟡-1/🟡-3 附带项随其恢复生效。
