# TASK-027 实现报告 — 批次 A（G39 校验驱动禁用 + G40 工程管理三项）

- 状态：SUBMITTED
- 实现者：WorkBuddy（代 Codex，用户 2026-11-09 批准批次 A 后实施）
- 需求来源：`EasySAR调研手册/需求文档_v3.0.md` FR-25、FR-08（§3.2 工程根菜单、§10 Q3/Q4/Q5）

## G39 参数级校验驱动禁用 + notice（FR-25）

**如实说明数据前提**：官方 `AUTOSAR_MOD_ECUConfigurationParameters_4.2.2/4.4.4.arxml` 中 `ENABLE-CONDITION-REF` 出现次数均为 **0**（实测），因此**不臆造依赖型禁用**。本期落地为两条权威来源 + 一条可扩展通道：

| 来源 | 行为 |
|---|---|
| 可选参数未勾选 | 行锁定 + notice「可选参数未勾选：勾选后才能编辑」（需求 §5.1 明文） |
| 定义声明 readOnly | 行锁定 + notice「定义声明只读（来自 XML）」 |
| 模块规则通道 | `ParameterStateRule[]` 扩展点：模块可声明 `{disabled, notice}`（已单测覆盖；官方数据具备 ENABLE-CONDITION 后可直接接入） |

- 新增 `src/core/constraint/ParameterStates.ts`：`evaluateParameterStates(config, module, containerUuid?, rules?)`
- store 暴露 `parameterStates`（仅选中容器，随选择/编辑响应式重算）
- DynamicForm：7 处控件 disabled 统一收敛为 `rowDisabled(param)`；行尾渲染 `data-row-notice` 提示（冷灰 `ⓘ`，非错误色）
- 测试：`tests/parameter-states.test.ts` 4 用例（未勾选锁定/勾选解锁+必填默认值不锁/只读锁定/容器范围+规则通道）

## G40 工程管理三项（FR-08）

- `ProjectMetadata` 增加 `description?`（≤100）与 `updatedAt?`；`parseProjects` 宽松兼容旧记录（不迁移不重写）
- store `updateProject(projectUuid, {name?, description?, chip?})`：
  - AUTOSAR 版本**不接受修改**（改版本会使模块与全部配置失效；弹窗内明示原因）
  - 配置集名仅在遵循「工程名 · 模块」模式时同步改名，用户自定义名不覆盖
  - 写索引失败抛错并保留原数据
- store `duplicateProject(projectUuid)`：连配置数据复制，命名「原名 副本」；配置集与**容器实例 UUID 全部重生成**（两个工程的选择/导航目标互不干扰），定义 UUID 不变
- UI：
  - 工程根右键菜单补 `新建工程` + `工程管理`（编辑/复制/详情）；子菜单机制泛化为 `children` 数组（原 import/export 列表保留）
  - 新增 `ProjectSettingsDialog.vue`（edit/detail 双模式；detail 展示 名称/描述/版本/芯片/模块数/配置集数/创建与最后修改时间）
  - 复制走确认弹窗（提示连数据复制）
- 测试：`tests/project-manage.test.ts` 3 用例（编辑+派生名同步+版本不变/超长描述与空名拒绝/复制独立性与容器 UUID 重生成）

## 口径调整

- `tests/replica.test.ts`：菜单断言 6→8 项、「工程管理」由「不得出现」改为「必须出现」（需求 v3.0 §3.2 明确要求；「自动计算」仍不得出现）

## 验证

- typecheck ✓；build 15.15s ✓；28/28 收集守卫；361/362 —— 唯一失败 editor-ui 撤销性能（既定口径）→ 隔离复跑 9/9 ✓
- 新增 7 用例全部通过（G39 4 + G40 3）
