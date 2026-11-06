# TASK-018 交付报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-018 / 0 |
| 完成时间 | 2026-11-06T14:41:00+08:00 |
| 契约 | ACTIVE.md，SHA256 a0ac1ce12d10547cf891955b893eb6da87bd59f0482f2f4716da40ec817bdff5 |
| 实现前版本 | 064259f22f8df48d96b216ddc528a196d5690b20 |
| 构建 | npm run build 通过，16.45s |
| 全量自检 | test:verify 22/22 文件收集，317/317 通过（315 基线 + 2 新增） |
| 实机验收 | 官方 Dem 4.4.0，1400×900 / 1366×768；localhost:3001 隔离内存，未修改用户 3000 配置库 |

## 交付文件

| 文件 | 改动 |
|---|---|
| src/ui/ConfigTree/ContainerContextMenu.vue | 三项菜单、名称直选、禁用 title/aria-description、保留原动作守卫 |
| src/ui/FormEditor/DynamicForm.vue | 删除逐行字段说明块；参数名与行触发只读说明事件 |
| src/ui/FormEditor/FieldDescriptionPanel.vue | 新建底部说明组件，读取现有 BSWMD 字段信息 |
| src/views/WorkspaceView.vue | 参数说明/问题共享底部停靠区，维护局部视图状态 |
| tests/ui.test.ts | 呈现断言适配；保留显式目标、取消零写入、CHOICE/上限等语义断言 |
| tests/editing-experience.test.ts | 新增说明零写入、切换/收起/定位/跨实例清理测试 |
| reports/evidence/task018/ | 截图、DOM、测试/构建原始输出、隔离复现入口 |

## 验收标准自检（R1–R5）

- [x] **R1 / A1–A2**：主菜单仅新建实例、克隆实例、删除实例。无标题、错误定位或关闭菜单项。Esc、Tab、外点、其他浮层、上下左右/Home/End/Enter 与焦点恢复继续通过；定位转由问题面板承载。
- [x] **R2 / B1、B3**：新建直接显示右键实例的全部子定义名称；没有说明、数量、多重性附加行。保留一行空态、滚动和一个返回箭头。实机 DemEventParameter 列出 7 个子定义；新建 DemCallbackClearEventAllowed 后树中出现实例，撤销后恢复原来的 3 个实例。
- [x] **R3 / B2**：上限/CHOICE/导入只读的原因仍取自现有动作对象。灰显项通过 title 和 aria-description 提供原因。可键盘聚焦读取原因，Enter/Space 不执行；鼠标动作仍由原函数守卫拒绝。实机 End 聚焦已达上限的 DemDebounceAlgorithmClass，读得 `upper multiplicity 1 reached`。
- [x] **R4 / C1–C2**：定义节点三项禁用，短原因 `请右键实例节点` 只在 title/aria-description；没有重复正文。never-borrows 测试继续断言右键定义不借用之前选中的实例，触发动作不改变配置。
- [x] **R5 / D1–D3**：每行 `.field-help` 清零，保留原值控件、四态及错误提示。点击参数名/参数行显示底部说明、定义路径、类型、范围/枚举或引用目标。参数名是纯按钮，点击布尔参数名不会切换值。底部说明/问题使用同一停靠区，切换保留内容且只显示一个内容区；收起后点击参数可重新打开。
- [x] 问题定位保持问题页签并聚焦对应控件，不因程序化聚焦自动抢到说明页签。切换实例、配置集或关闭模块时清除旧字段说明。
- [x] TASK-017 CHOICE 预览/快照保护、引用草稿取消四方式、创建并引用、双向引用导航、批量操作均保留通过。
- [x] src/core、store、存储恢复层、输出闸门、契约与 review 零改动；仅在实现提交后填写允许的 SUBMITTED 字段。

## 关键实现说明

1. 菜单改用 `aria-disabled`，让灰显项也能由方向键聚焦读取原因；这不是放开操作。`openChildren/add/clone/remove` 仍读取同一动作原因并提前返回，键盘 Enter/Space 也拒绝 aria-disabled 项。禁用条件没有重新实现。
2. 字段说明是 Workspace 的局部 `helpFieldUuid`，不写配置、撤销历史或本地库。说明来源为当前容器定义的 parameters/references，不复制标准规则。`field-help` 仅由点击触发，避免问题定位的程序化 focus 改变页签。
3. 两个底部内容使用 v-show 保留组件与滚动状态，停靠区负责尺寸、各自内容负责单层滚动；会话内保留打开/收起和页签状态，刷新不持久化此视图状态。

## 前后对照及浏览器证据

| 检查 | 之前 | 本轮 |
|---|---|---|
| 主菜单 | task016/01-context-menu.jpg，含附加动作/原因正文 | task018/03-three-actions-1400.jpg，仅三项 |
| 子列表 | task016/02-child-options.jpg，含说明/数量 | task018/04-child-names-1400.jpg，仅名称，最后一项灰显 |
| 定义节点 | 用户本轮截图，重复大段解释 | task018/05-definition-menu-1400.jpg，三项短提示在属性中 |
| 参数行 | task017/01-fields-1400.jpg，逐行字段说明入口 | task018/01-compact-form-1400.jpg，无逐行说明块 |
| 底部说明 | TASK-017 无独立底部说明 | task018/02-bottom-help-1400.jpg、07-bottom-help-1366.jpg |
| 问题定位 | task017/06-errors-located-1366.jpg | task018/08-issues-location-1366.jpg，问题页签仍选中 |
| 直选真实新增 | — | task018/06-created-child-1400.jpg，真实新增后再撤销 |
| 同屏结果 | — | task018/09-final-child-help-1366.jpg，名称菜单与底部说明 |

1400 实际 DOM 读取：主菜单三个名称；定义菜单三个 aria-disabled=true，title 均为短提示；子菜单返回箭头及 7 个名称、前 6 项可用，DemDebounceAlgorithmClass 灰显且 title 为 core 上限原因。1366 原始 DOM 见 `dom-1366.json`：无文档横向溢出、inlineHelpBlocks=0、bottomDocks=1，dock (0,507,1366,261)；菜单在窗口内。问题定位后焦点 aria-label 为 DemEventAvailable，所选页签仍为问题（33）。收起后 dock 不可见，再点击参数名重新显示说明。

隔离复现：把 evidence 中 ui-entry.ts/html 复制为 `.temp/task018-ui.ts/html`，运行项目 Vite 于 localhost:3001，访问 `/.temp/task018-ui.html`。入口只在该来源运行并把 localforage 替换为内存 Map；实际 Workspace/store/官方 BSWMD 都是产品代码，不改用户库。临时浏览器页已关闭，窗口覆盖已恢复。正式 localhost:3000 已重新加载并显示原工程“研究验证_20261103”，本轮未通过正式页执行参数或结构编辑。

## 测试适配映射

| 原断言 | 新断言 / 保留项 |
|---|---|
| 菜单显示「新建」及四动作/关闭项 | 精确比较新建实例、克隆实例、删除实例三项文本 |
| 原因正文/原生 disabled | aria-disabled=true + title 原因逐字相等；新增 aria-description 同值和灰显项键盘 Enter 零变化 |
| 定义节点四项禁用且有长解释 | 三项禁用、无长解释、短 title/aria-description；触发全部动作后 exportJson 仍相同 |
| End 到关闭菜单 | End 到删除实例；Esc 焦点恢复不变 |
| 右键定位错误 | 断言菜单无此项，Esc→验证→问题定位，同一目标和字段断言保留 |
| CHOICE 子项正文禁用原因 | 每项文本精确等于 shortName，title/aria-description 精确等于 core 原因；不可创建语义保留 |
| 字段说明在行下 | 旧行下说明断言移除；新增 2 测试：参数/引用说明正确、零配置/历史/库写入；共享底部切换/收起/定位/跨实例与配置集清理 |

没有删除用例、改性能阈值或放松核心语义；ui.test.ts 仍 22 项，editing-experience.test.ts 13→15 项。

## 自检命令输出与失败记录

- `npm run build`：通过，保留既有大 bundle 提示，见 `evidence/task018/build.txt`。
- 定向 ui + editing-experience：37/37 通过。
- 首次全量与 build 同时执行：316 pass / 1 fail，20 步撤销含渲染为 555.15ms，超过原 500ms，见 `tests-initial-parallel-build.txt`。未删除失败证据。
- build 结束后，同样命令 `npm run test:verify` 再次全量：**317/317，22/22 收集**；20 步含渲染 **391.14ms**，核心 **27.76ms**，见 `tests.txt`。两次之间没有产品或测试代码修改；并发资源竞争是推测，不能作为已证实原因。
- `git diff --check`：通过。src/core 框架 import 搜索、本轮源文件显式 any 搜索：均无匹配。
- 桌面入口 `Start-Configurator.ps1 -NoBrowser`：`Ready: http://localhost:3000/workspace`，无需更新链接目标。

## 未完成、限制及待确认

- 本轮契约无未完成项；独立通过结论由 WorkBuddy 作出。
- 二级仍使用原 W6 的单面板层级切换，返回使用箭头；仅文本极长时省略，完整名称/禁用原因可悬停及辅助技术读取。
- 1366/1400 为本轮已验尺寸；极窄手机窗口不是本轮适配范围。底部说明刷新后不保持，属于会话内视图状态。
- 原有 Vite bundle 大小提示和已有未跟踪 Vite 时间戳临时文件未混入本轮提交；S5 多模块计划由 WorkBuddy 后续契约推进。
- 无需新增产品范围决策；不宣称本轮实现常驻调度或供应商集成。
