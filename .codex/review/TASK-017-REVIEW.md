# TASK-017 评审意见（第 0 轮 · 冻结快照）

> 评审方：WorkBuddy ｜ 时间以本文件 git 提交时间为准 ｜ 判定：**APPROVED**

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-017 / round 0（S4 编辑体验收尾，A–G 全部交付） |
| reviewedCommit | `b268625f618ee64fdb243ebf79ff243f99bb3480`（实现）；交接提交 `a86c6f35164702bff9e484206943e4e04d1afa83`（STATE SUBMITTED，仅三字段，合法） |
| 契约 | ACTIVE = TASK-017，哈希 `bce835ceef48686197370fae48ffce41f5561539d4838896ebcc4db79a2ec3a1` |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 2 建议 |
| 验收 | A1 / B1–B2 / C1 / D1–D2 / E1–E2 / F1–F2 / G1–G2 全达成；W1–W4 语义落地；302 基线不回退 |

---

## 一、独立复核证据

### 1. 运行

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 独立重跑（12.46s） |
| **独立 `npm run test:verify`** | **22/22 文件收集守卫 + 315/315 passed, 0 fail, 0 skip，一次通过**（302 基线 + 13 新增 editing-experience，其中 it.each 四种退出方式展开） |
| 红线 diff | `src/core` **0 行**；W6 两文件（ContainerContextMenu/containerMenuPosition）**0 diff**；存储/恢复协议 0 diff；OutputGate 未动 ✓ |
| 测试删削 | 删除行逐条核对：ChoiceSelector 确认内容 VNode 化、工程菜单 9 占位项→6 真实入口、「新增子项」→「添加」、「工程」→「配置集」术语、ElSelect→radio 暂存——均为报告声明的行为跟随，替换断言保留且加严（如「配置集已在预览后更改」拦截断言延续）；无削断言 ✓ |

### 2. 逐组核验

| 组 | 核查 |
|---|---|
| **A1/G09** | 空分支/占位菜单移除有 replica 断言（菜单 9 项→6 真实入口、空分支消失）；仅隐藏导航未删数据 ✓ |
| **B1–B2/G10** | `FieldState.vue` 与真实 isConfigured/validator 联动；用例区分 unconfirmed false / confirmed false / optional absence / validator error 四态 ✓ |
| **C1/G11** | 工具栏「添加」在定义/实例节点分流；`addOptionsFor` 仅转发 core getAddOptions；用例断言上限原因同源 + 打开选择器零写入；W6 行为原样保留（0 diff 实证）✓ |
| **D1–D2/G12** | `choiceImpact.ts` 派生预览；用例断言预览含已配值（false）/出站引用/入站引用明细；**「refuses a CHOICE confirmation when the configuration changed after its preview」**——预览后配置变更再确认被拒且零写入（快照比对）；策略=按新候选重建（实测数据支撑，报告 §CHOICE 策略如实记录，一次 undo 完整恢复）✓ |
| **E1–E2/G13** | 引用弹窗 draft 暂存：`it.each(['cancel','close','escape','outside'])` 四退出方式 × `exportJson` 逐字节不变 + `setItem` 零调用 + undoLabel 不变；空态创建先暂存后原子创建+引用同一历史；外部引用只读延续 ✓ |
| **F1–F2/G14** | 底部停靠面板；生成失败自动打开；输出异常计入错误总数不另写规则；「retains the issue panel after locating」断言定位后列表保留；撤销后计数归零 ✓ |
| **G1/G20 + G2/G22** | 20 步撤销/跨集独立/批量逐实例原因组合用例；`ReferenceRelations` 入站/出站派生自真实实例+定义，点击双向跳转；未引入 Vue Flow ✓ |

### 3. UI 与证据审阅

- 截图 02 亲眼复核：radio 暂存 Second 高亮、背景表单 MemoryRef 仍 First、取消/确定——暂存语义实证。
- 截图 05 亲眼复核：切换预览三列明细（字段路径/当前值/影响：移除已配值/移除引用/保留引用但目标将失效）+「按新候选定义重新创建，可通过一次撤销恢复」策略如实展示。
- `dom-1400/1366.json`、`workspace-dom.txt` 提供视口读数；诚实记录浏览器过渡动画期入口短暂不可用并改真实 Transition 处理（未删失败断言）。
- 零写入断言清单 5 类 14 处 `exportJson` 逐字节比对——覆盖密度为本项目最高一轮 ✓。

## 二、建议项（🟡，不阻塞）

1. **🟡-1** 工作区遗留未跟踪临时文件 `vite.config.ts.timestamp-*.mjs`（Vite dev 中间产物），建议加入 `.gitignore` 并清理，防误提交。
2. **🟡-2** 字段说明以每行可展开块呈现占空间较大——用户 2026-11-06 已明确改为「行内说明移除 + 底部统一展示」（见 TASK-018 契约），本条不作为缺陷挂账，仅记录呈现规范由 TASK-018 收敛。

## 三、裁定

- **TASK-017 round 0 = APPROVED**（绑定 `b268625f618ee64fdb243ebf79ff243f99bb3480`）；S4（G09–G14/G20/G22 列表）完成。
- 🟡-1 就地清理即可；🟡-2 由 TASK-018 承接。
- **下发 TASK-018（UI 简化优先插队，用户 2026-11-06 指定）**：右键菜单收敛三项 / 子列表仅名称+禁用原因悬停 / 定义节点去重复解释 / 字段说明移至底部统一展示；呈现规范同步更新于 `01-IA-AND-SCREENS.md`。S5 多模块随后继续，不降级。
