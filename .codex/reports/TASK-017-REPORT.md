# TASK-017 交付报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-017 / 0，A–G 全部交付 |
| 完成日期 | 2026-11-06（Asia/Shanghai） |
| 基线 | 9fbb329c762c4dfa2ff68bbb4c01b326ef4ca564 |
| 契约哈希 | bce835ceef48686197370fae48ffce41f5561539d4838896ebcc4db79a2ec3a1 |
| 适用范围 | AUTOSAR CP 4.4.0，单配置方案；本轮为 UI/store 薄封装，未修改 core、数据协议、OutputGate 或 W6 |
| 验证 | build（含 vue-tsc）通过；test:verify 315/315、22/22 文件、0 skip；完整输出见 evidence/task017；浏览器双视口实操见下 |

## 交付对照

| 契约 / 产品项 | 实现及实际验收 |
|---|---|
| A1 / G09 | 界面统一配置集/模块；移除空 RTE、AUTOSAR 文件、输入/输出分支及新建/工程管理/自动计算占位菜单。保留顶部配置集管理、真正的导入导出/模块管理/生成入口。仅隐藏导航，未删数据。 |
| B1–B2 / G10 | 新 FieldState 与真实 isConfigured/validator 联动：可选、未确认、已配置、已配置但非法。未确认必填行保留 ⚠ 标识并显示校验红色原因；false 建议值与确认 false 明确不同。可选值未确认时复选框未勾选、控件禁用；点击启用才确认建议。字段说明可展开查看路径/范围/枚举/说明，非仅 tooltip。 |
| C1 / G11 | 工具栏「添加实例」在定义节点直接添加该定义，在实例节点打开既有子定义选择器；操作浮层主按钮「添加」。新增 addOptionsFor 仅转发 core getAddOptions，禁用原因同源。选择器切集/切实例关闭；删除等待期间切集不误删。W6 紧凑竖向菜单原样保留，无横向浮层回退。 |
| D1–D2 / G12 | CHOICE 预览逐行显示真实已配参数（含 false）、出站引用、被替换候选的外部入站引用。后者保留但目标将失效，预览明确告知。确认时比较整份序列化快照，阻止预览之后配置已变化仍按旧结果操作。取消零写入；切换单步撤销，恢复原 UUID、值、配置标记和引用。 |
| E1–E2 / G13 | 引用弹窗用本地 draft：搜索名称/路径、单选高亮；确定才产生历史；取消、X、Esc、遮罩零写入。空目标时兼容创建按钮也先暂存，确定后用既有 createReferenceTarget 原子创建并引用；取消不创建。一条历史可完整撤销。外部引用继续只读。 |
| F1–F2 / G14 | 问题面板底部停靠、计数/严重度/路径/原因/建议/定位/收起；定位保留列表及滚动上下文。错误来自既有 store.violations；生成/导出闸门失败自动打开；非校验的输出异常另列 alert 并计入错误总数，不另写规则。 |
| G1 / G20 | 组合回归：20 次编辑后切第二配置集，再回首集逐步撤销/重做，序列化完全一致；第二集保持独立；批量成功/跳过逐实例说明，整体一次撤销。旧生命周期、隔离、导入写锁、取消/W6 测试继续通过。 |
| G2 / G22 列表 | 新 ReferenceRelations 从当前实例和定义派生入站/出站列表；入站跳来源并聚焦引用字段，出站跳目标实例；未配置/悬空/外部目标给出状态。没有引入 Vue Flow 图。 |

## W1–W4 对照与边界

- W1：保留三栏、面包屑/实例名和数据安全横幅；补齐四态、可展开字段帮助与底部问题区。保存/隔离写锁仍由既有实现负责，S5 自动保存不提前实现。
- W2：隔离详情与原始数据恢复本轮零修改，既有恢复/快照测试继续覆盖；不宣称本轮重新浏览器验收全部旧迁移流程。
- W3：搜索列表、暂存选中、取消/确定和空态创建均真实操作，截图 02、09。
- W4：严重度/路径/原因/定位与自动计数刷新，截图 06、07、10。定位保留面板；撤销修复问题后计数从 2 归零。
- W6：本轮不改 ContainerContextMenu 及其定位模块；旧右键、键盘、边界、取消测试完整保留。

## CHOICE 策略：实测后沿用重新创建

测试先建立 A 候选，确认 CandidateFlag=false、CandidateMemoryRef→First，Root/CandidateRef→A。实际切换 B 后，A 移除，B 的 OtherFlag=false、isConfigured=false；入站 CandidateRef 保留原目标 UUID，由既有校验报告悬空。一次 undo 恢复完整序列化结果。

因此沿用 core 的**按新候选定义重建（清空旧候选数据）**策略，不猜测异构字段映射、不将旧字段强拷贝到新定义。预览明示将丢失的配置与失效引用；用户取消不会产生任何写入。没有修改互斥约束。

## 测试与浏览器证据

最终日志位于 `.codex/reports/evidence/task017/{tests,build}.log`。新增 `tests/editing-experience.test.ts` 13 项，原 302 项保留；315/315 通过，完整收集守卫为 22/22 文件。

取消零写入断言清单（均包含完整 exportJson 序列化不变；等价使用 serializeConfig 的固定格式输出）：

| 操作 | 额外断言 |
|---|---|
| 引用取消、X、Esc、遮罩 | undoLabel 不变、localforage.setItem 零调用；真实 Dialog 关闭生命周期完成，再打开无旧 draft |
| 空态目标创建暂存后取消 | 新目标不存在，零存储写；确认后目标+引用同一历史，undo 完全恢复 |
| CHOICE 预览取消 | 已配值/引用/UUID 不变、零存储写；确认切换可单步恢复 |
| 预览后配置被修改再确认 | 不覆盖新编辑、不切候选、零存储写，显示配置已变化 |
| 工具栏打开添加选择器后关闭 | 无新增实例、零存储写；上限禁用原因来自 core |

浏览器使用真实组件、Pinia 和 core，在 `http://localhost:3001/.temp/task017-ui.html` 的**隔离内存样例**验收；localforage 替换为内存 Map，未触碰 localhost:3000 用户配置库。可复现入口源码已保存为 `evidence/task017/ui-entry.ts/html`：分别复制到 `.temp/task017-ui.ts/html`，用 Vite 在 3001 提供服务。测试定义为 Edit，完全由 BSWMD 注入，不是生产硬编码模块。

| 证据 | 观察结果 |
|---|---|
| 01-fields-1400.jpg | 未确认 false、已配数字、未启用可选项；空导航隐藏 |
| 02-reference-draft-1400.jpg | 搜索 Second，暂存已选；背景 MemoryRef 仍 First；X/Esc 退出仍 First；确认变 Second，undo 回 First |
| 03-confirmed-false-relations-1400.jpg | 开关两次编辑后仍 false，但标识变已配置；展开出站列表 |
| 04-inbound-list-1400.jpg | 点击 First 后显示 Root/MemoryRef 与 Root/Choice/A/CandidateMemoryRef 两条入站；点来源返回并聚焦字段 |
| 05-choice-preview-1400.jpg | A=false、A→First 和 Root→A 三条真实影响明细；取消仍 A，确认变 B |
| 06-errors-located-1366.jpg | 生成失败，2 条问题；点 CandidateRef 定位后底部列表仍在，字段标红错误 |
| 07-choice-restored-1366.jpg | undo 后 A=false、A→First 均恢复；底部问题归零 |
| 08-toolbar-add-1366.jpg | Root 下 Choice 1/1，添加禁用并给上限原因；无残留上下文菜单 |
| 09-reference-create-draft-1366.jpg | 新目标暂存提示；取消再开仍无目标；确认后 NewTargetRef=NewTarget，undo 后恢复 -- |
| 10-validated-1400.jpg | 正常验证通过；底部面板可收起 |
| dom-1366.json / dom-1400.json / workspace-dom.txt | 真实 DOM 读数：bodyWidth=视口宽度，无页面横向溢出；面板分别贴至 y=768/y=900；1366 表单边界落在视口内 |

浏览器执行中曾在弹窗关闭动画未结束时立即重开，遇到入口短暂不可用；观察当前状态后重开完成验证，未增加重复写入。测试环境最初 stub 了 Transition，导致关闭动作的 modelValue 断言不更新；改为真实 Transition 并等待关闭事件后，四种退出方式均通过。没有删除失败断言来过关。

## 既有测试变更逐项

- editor-ui：引用选择改为 radio 暂存后点确定，新增确认前数据不变；原目标/撤销断言保留。
- ecuc-ui：空态创建先暂存后确定，新增中间状态不变断言；原单步撤销断言保留。
- choice-ui：确认内容由字符串改为带明细的 VNode，类型断言相应更新；真实 DOM 丢失警告/取消/确认测试保留。
- replica：工具栏 aria 文案改为添加实例；菜单由 9 项（4 占位禁用）改为 6 个真实入口（无配置时仅导出禁用），并断言空分支与占位项消失。
- ui：旧「新增子项」按钮查找改为「添加」，其他断言不变。
- io-ui：预览错误和列名中的「工程」改「配置集」，冲突保护断言不变。
- 新增用例和历史用例无 skip/删测/放宽耗时门槛。首次旧用例失败及新增用例的验证修正已处理，最终完整日志保留。

## 交付文件与自检

新增 FieldState.vue、ReferenceRelations.vue、choiceImpact.ts；修改 DynamicForm、ChoiceSelector、ContainerActions、ContainerNavigator、ValidationPanel、WorkspaceView、ImportDialog 和 configStore 薄封装，另有上述测试与本报告/证据。

- `git diff --check` 通过；`git diff --name-only -- src/core` 为空。
- ACTIVE 原文哈希与 STATE 绑定一致；未修改 stage、评审记录、架构或契约。
- `scripts/desktop/Start-Configurator.ps1 -NoBrowser` 实测返回 `Ready: http://localhost:3000/workspace`。桌面原快捷方式无需更改，仍读取当前仓库源码。
- 已打开 localhost:3000 最新配置器，保留用户原配置并只执行校验（显示原有 29 项未确认问题），未编辑用户数据。

## 范围与限制

- 本轮完成 A–G；S5 多模块并存/首页/自动保存/排序/图、新手引导，S6 迁移和 S7 性能交付继续由 WorkBuddy 后续契约安排。现有排序按钮仍禁用，不宣称完成排序。
- 列表仅当前配置集范围；外部引用保持只读、不宣称供应商或跨模块集成已验证。
- 构建仍有既存大 chunk 警告（主包约 1.19MB）；优化依 S7，不修改门槛掩盖。
- 标准仍按已确认 CP 4.4.0 及 TASK-015 互操作边界；本轮不新增标准协议行为。
- 本报告是 Codex 自检，待 WorkBuddy 对绑定提交独立评审；无自行批准或推进阶段。
