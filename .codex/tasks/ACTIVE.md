# ACTIVE TASK — TASK-003

> 当前唯一有效契约。`STATE.json.task.contractPath` 指向此处。
> 前一版契约已归档为 `.codex/tasks/TASK-002-CONTRACT.md`（内容未改）。

## 元信息

| 项 | 值 |
|---|---|
| 任务 ID | `TASK-003` |
| 阶段 | Phase 2 → Phase 3（配置器可用化） |
| 优先级 | P0 |
| 依赖 | TASK-002（APPROVED，引擎已就绪） |
| 验收方 | 架构师 |

## 目标（一句话）

把已经正确的 BSWMD 引擎接到界面上，让工程师**在浏览器里真正配得起多条 DTC**——能建配置集、能加/删/克隆实例、能一眼看到哪里错了。

## 为什么现在做这个

TASK-002 修正 `lower=0` 语义后，DEM 打开时 6 类子容器全为空，而 UI 层没有任何增删入口（`src/stores/configStore.ts`、`src/views/WorkspaceView.vue` 零调用 `addContainerInstance`/`removeContainerInstance`）。

**当前产品在浏览器里不可用**：看得见表单，配不了内容。这不是「已知限制」，是本轮必须清掉的阻塞项。引擎层已具备能力（`ConfigInstanceManager.addContainerInstance/removeContainerInstance` 含上下界保护），本轮只做接线与配置集管理。

## 交付清单

### A. 配置集管理（对应 `docs/REQUIREMENTS.md` FR-Core-001）

| # | 内容 | 要点 |
|---|---|---|
| 1 | 新建 DemConfigSet | 输入名称 → 生成唯一 UUID → 自动切换为当前 |
| 2 | 克隆配置集 | **深拷贝**全部容器/参数/引用；克隆后引用字段的 `targetUuid` 必须重映射到新副本内对应容器，不得指向原配置集 |
| 3 | 删除配置集 | 二次确认；删除当前项后自动切到剩余第一项；无剩余则回到空态 |
| 4 | 配置集切换 | 切换时不得丢失未保存改动（先落库或提示） |
| 5 | 元数据展示 | 显示 `lastModified`、容器数、错误数 |

### B. 容器实例生命周期（本轮核心）

| # | 内容 | 要点 |
|---|---|---|
| 6 | 新增实例 | 从**定义树**选择「当前父容器下允许的子定义」→ `addContainerInstance`；受 `upper` 限制，达上限时按钮禁用并给出原因 |
| 7 | 删除实例 | 受 `lower` 限制，必填项禁用删除并说明「lower multiplicity N required」；删除前确认 |
| 8 | 克隆实例 | 深拷贝单个容器子树，名称按 `原名_2`/`_3` 递增去重，引用字段按规则重映射或置空 |
| 9 | 实例树刷新 | 增删后配置树立即反映，当前选中节点不失效（被删则回退父级） |

### C. 配置树状态与导航（FR-UI-002 的可验收子集）

| # | 内容 | 要点 |
|---|---|---|
| 10 | 节点状态标记 | 绿=已配置（必填齐全）、黄=有 WARNING、红=有 ERROR；状态由 `ConstraintEngine` 结果驱动，**不得**在 UI 另写一套判断 |
| 11 | 错误定位 | 点击违规项 → 树选中对应容器、表单滚动并聚焦对应字段（TASK-002 已有字段级 `definitionRef`） |
| 12 | 右键菜单 | 新增子项 / 删除 / 克隆 / 定位错误（不含拖拽排序，留 TASK-005） |

### D. 导航与首页接线

| # | 内容 | 要点 |
|---|---|---|
| 13 | 首页 → 工作区 | 选模块 → 建或打开配置集 → 进工作区；不得再出现「点新建却落到空白无操作」的死路 |
| 14 | 空态引导 | 无配置集时给「新建」主按钮；配置集内无子容器时给「添加第一条 DTC」引导 |

## 约束（架构铁律，违反即打回）

1. `src/core/**` 仍必须是纯 TypeScript，**不得** import vue/pinia/element-plus。
2. `src/ui/**` 与 `src/views/**` **不得**出现 DEM 专有字段名（`DemDtcValue` 等），一律由定义驱动。
3. 禁止 `any`、`@ts-ignore`、关 strict、删测试。
4. 增删必须走 `ConfigInstanceManager` 既有 API，**不得**在 store 里另写一套 multiplicity 判断（避免两处规则漂移）。
5. 克隆的引用重映射必须有测试；不得只做浅拷贝后放任悬空引用。
6. 不得改 `review/**`、`STATE.stage`、本契约文件。
7. 不得顺手做导入导出 / undo / ARXML / 主题 / 搜索——那些是 TASK-004/005 的**明确范围**，不是可选。

## 验收标准

### 功能（浏览器可复现）

- [ ] 打开 DEM 工作区：根 `DemConfigSet` 存在（lower=1），6 类子容器为空，显示「添加第一条 DTC」引导
- [ ] 连续新增 3 条 DTC，名称为 `DemDTC`、`DemDTC_2`、`DemDTC_3`，三者 UUID 不同
- [ ] 删除第 2 条后再新增，名称不与现存冲突（不得出现两个 `DemDTC_2`）
- [ ] 对 `upper=1` 的定义，第 2 次新增按钮禁用并说明原因
- [ ] 对 `lower=1` 的定义，删除按钮禁用并说明原因
- [ ] 克隆配置集后，修改克隆内某条 DTC 的 Attributes 引用，原配置集不受影响（引用已重映射）
- [ ] 删除配置集有二次确认，删除当前项后自动切换
- [ ] 构造「两条 DTC 同值」，树上对应节点变红，点击违规项能定位到该字段
- [ ] 刷新页面后配置集、容器实例、参数值全部恢复

### 工程

- [ ] `npm run build` 通过（含 `vue-tsc --noEmit`）
- [ ] `npm test -- --run` 全绿，测试数 ≥ 60（当前 52 + 本轮新增）
- [ ] `src/core/**` 无 vue/pinia/element-plus
- [ ] `src/ui/**`、`src/views/**` 无 `Dem*` 字段名
- [ ] 全仓无 `any`、无 `@ts-ignore`
- [ ] 新增导出函数带 JSDoc

### 交付物

- [ ] `.codex/reports/TASK-003-REPORT.md` 按模板填写，含**可复现步骤清单**（每条给「点哪里 → 期望看到什么」）
- [ ] `STATE.json`：`task.status = SUBMITTED`、`task.round` 保留 0、写入 `task.submissionCommit`（**先提交代码取完整 SHA，再改状态单独提交**）

## 自检命令

```bash
cd "D:/ProFile/教培业务/配置器/autosar-bsw-config-tool"
npm run build
npm test -- --run
grep -rn "from 'vue'\|pinia\|element-plus" src/core/ || echo "OK: core 无 UI 依赖"
grep -rn "Dem[A-Z]" src/ui/ src/views/ || echo "OK: UI 无 DEM 硬编码"
grep -rn ": any\|@ts-ignore" src/ tests/ || echo "OK: 无 any"
```

## 后续任务必须覆盖（不得声称已完成，也不得降级为可选）

| 需求 | 归属 |
|---|---|
| JSON 导入导出、ARXML 导入导出、CSV 导出、导入预览与冲突解决、XXE 防护（`FR-Assist-005`、`NFR-SEC-002`） | TASK-004 |
| 撤销/重做 20 步（`NFR-UX-001`）、批量修改（TC-003）、全局搜索（FR-UI-004）、暗色主题 | TASK-005 |
| 引用关系图（`FR-Auto-002`）、悬空引用高亮 | TASK-005 |
| 拖拽排序、自动保存 30s、新手引导、1000 DTC 性能（`NFR-PERF-003/004`） | TASK-006 |

## 参考

- 引擎 API：`src/core/config/ConfigInstance.ts`（`addContainerInstance` / `removeContainerInstance` / `findContainer`）
- 定义树：`src/core/bswmd/BswmdTypes.ts`
- 校验结果结构：`src/core/constraint/ConstraintTypes.ts`（含 `containerUuid`、`definitionRef`）
- 需求原文：`docs/REQUIREMENTS.md` FR-Core-001、FR-UI-002、FR-UI-004
