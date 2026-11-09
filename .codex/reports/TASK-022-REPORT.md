# TASK-022 实现报告 — 功能补全批次一（G31/G32/G33/G38 最小版）

- 状态：SUBMITTED
- 实现者：WorkBuddy（用户 2026-11-08 授权代 Codex 执行；Codex 恢复后可接续评审流转）
- 契约：`.codex/tasks/ACTIVE.md`（哈希 fc90f4df…，2026-11-06 绑定）
- 基线：TASK-021 评审锚 c9e3579（346 用例）

## 交付摘要

| 项 | 状态 | 说明 |
|---|---|---|
| A · G31 多实例列表视图+列设置 | ✅ 完成 | `InstanceListView.vue`：按子容器定义分组表格（containerName 固定列 + 参数列）、排序（视图层）、分页（每页 20）、列设置弹窗（containerName 恒在）、勾选批量编辑入口、行打开定位表单；与表单视图共用 store 数据源，`formView` 切换按钮（表单/列表）置于参数区顶部 |
| B · G32 多值参数增删行 | ✅ 完成 | **解除「多值字段仅编辑单值」TASK-021 已知限制**。语义：多值参数 value 存行数组；单条目保持标量（pre-G32 形态零 diff）；仅重复 ARXML 条目聚合。行 API：add/remove/set（upper 界拒绝、全删清 isConfigured）；hydrate 三形态归一；ARXML 导出逐行展开；约束逐行校验报 `名称[行号]`；C 生成逐行字段 `_0/_1` 后缀；DynamicForm 每行控件+×/＋+计数 |
| C · G33 进制切换 | ✅ 验收 | TASK-021 已实现（radices/hexDrafts，DEC/HEX 显示切换零写入），本轮核对无回归，验收通过 |
| D · G38 最小版（导入入口预留） | ✅ 完成 | `referenceDataStore.ts`（独立键 `autosar-reference-data`，不触配置库）+ `ReferenceDataPanel.vue` + 起始页入口按钮。文件选择→内容嗅探识别（DBC/LDF 签名、CDD 专有二进制）→存档（≤8MB）→列表→下载→删除；**解析展示明示后续版本**，未知格式明确拒绝不伪造 |

## 关键文件

- 新增：`src/ui/FormEditor/InstanceListView.vue`、`src/stores/referenceDataStore.ts`、`src/ui/Portal/ReferenceDataPanel.vue`、`tests/multivalue.test.ts`（4 用例）、`tests/lists-reference.test.ts`（4 用例）
- 修改：ConfigTypes（value 数组语义注释）、ConfigInstance（行 API 三件套）、ConfigJson（hydrate 聚合+数组形态支持）、Arxml（多值展开）、DefinitionConstraints（逐行校验重构，行号入消息）、CGenerator（逐行字段）、configStore（三方法走 edit 历史+childInstanceGroups getter+parameterData 数组透传）、DynamicForm（多值行 UI）、WorkspaceView（视图切换+批量接线）、ConfiguratorStartView（参考数据入口）

## 验证

- build ✓（13.74s）；vue-tsc ✓
- `test:verify`：26/26 收集守卫；353/354——唯一失败 editor-ui 撤销性能（默认并发满载抖动，既定口径场景）→ **隔离复跑 9/9 通过** ✓
- 346 基线零回退（既有用例无删削；新增 8 用例全过）
- 既有快照/序列化用例全部原样通过——pre-G32 数据形态零 diff 已被基线证明

## 已知限制（如实声明）

1. G31 列表视图列设置为组件内状态，不跨会话持久化（原站行为一致）
2. G32 行数组仅对 multiplicity 上限 >1 或 unbounded 的定义生效；`lower > 0` 的最少行数未强制（删除至低于 lower 时约束面板会报 required，不阻断）
3. G38 仅存档级：DBC/LDF 解析展示、CDD 解析（需规范授权）均在 TASK-025
4. editor-ui 撤销性能满载余量问题沿用 TASK-021 S7 提级结论，未在本轮扩修

## 诚实度声明

- 本报告由实现者（WorkBuddy 代 Codex）撰写；评审若由同一主体执行，将在评审文件中显式标注身份并按独立标准（隔离复跑+逐 diff 实读+证据核验）执行，不冒充第三方。
- G33 未新增代码，仅验收——不冒充为本轮实现。

## 追加节：用户反馈修复（2026-11-09 round 1）

**用户两项裁定 + 一项新需求**（附截图）：

1. **必填参数已显示值仍报「必填项未配置」**——根因双处：① DynamicForm 以 defaultValue 回退显示而 config 缺条目/未确认；② OutputGate `confirmed()` 把未确认值清空后再校验（TASK-008「显式配置语义」）。
2. **BOOLEAN 开关默认关闭即合法**——「开关两种状态，默认没打开就是没打开，按 XML 参数默认值，没必要提醒报错」。
3. **新需求：模块树右键菜单**——模块校验 / 代码生成 / 导入 / 导出（模块 ARXML）。

**产品语义变更（用户裁定推翻 TASK-008 显式配置口径）**：「默认值即配置」。实现：

- DefinitionConstraints：required 判定回退 `defaultValue`，BOOLEAN 再回退 false（有默认值的必填不再报；无默认值仍报）
- OutputGate：`confirmed()` 不再清空未确认参数值（原注释 "so defaults cannot satisfy required fields" 的旧语义废止）；引用清空语义保留（用户未裁定引用放行）
- FieldState：新增「默认值」中性态（替代黄色 ⚠ 未确认，BOOLEAN/有 defaultValue 的未确认参数显示）
- DemConstraints `optionalUnset`：optional 且未显式确认即跳过域检查（预填值不是用户选择）
- CGenerator：必填参数即使未确认也输出（默认值生效，缺了配置不完整）；optional 未确认不输出
- ARXML 导出保持「只写显式确认值」（ECUC 惯例；未写条目导入时按默认值语义回退，往返零 diff）
- WorkspaceView：模块节点右键菜单四项（复用 project-menu 机制与 placeContainerMenu 定位；模块校验/生成先切模块再执行；导入走模块 ARXML ImportDialog；导出即当前模块 exportConfig('arxml')）；document click/contextmenu 统一关闭浮动菜单

**用例口径调整（12 处，全部注明裁定依据）**：A2×4（arxml-fidelity，改为「无默认值必填仍拦 + 默认值放行」）、Dem/CanIf 官方回归×2（参数不再拦、引用仍拦）、explicit false 中间断言、output×2（permits defaults / L08 反转）、editing-experience×2（四态区分 default 态、问题面板定位路径适配）+ core.test 新增缺条目回退用例。

**验证**：typecheck ✓；build 15.48s ✓；26/26 收集守卫；354/355（唯一失败 editor-ui 撤销性能既定口径）→ 隔离复跑 9/9 ✓。
