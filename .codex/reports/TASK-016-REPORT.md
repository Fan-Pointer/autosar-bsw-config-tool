# TASK-016 交付报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-016 / 0 |
| 实现时间 | 2026-11-06 11:38–11:53 +08:00 |
| 前置 | WorkBuddy `86df94b80f3511bb416d817ebcea545d9a9225ce` 下发 READY |
| 契约哈希 | `80a0946e22521ecc40545fdf479bccc6d1eeab6955ffbf37a3215cb422dfff07`，交付前重算一致 |
| 构建 | `npm run build` 通过；Vite 13.91s；原有大包警告保留 |
| 回归 | `npm run test:verify`：19/19 文件完整收集，289/289 通过，0 fail / 0 skip |
| 基线 | 277 原有用例全部保留，新增 12；core 零改动 |
| 评审绑定 | 完整实现 SHA 由提交后的 STATE.task.submissionCommit 记录，本报告不自行判定通过 |

## 改动和验收对照

| 契约 | 实现及证据 |
|---|---|
| A1 / W6-1、2 | 新增独立 `ContainerContextMenu.vue`，原横排 `ContainerActions` 只用于工具栏。菜单固定定位、竖排 13px、每项约 33px，禁用说明放在本行下方，无大按钮横条。 |
| A2 / W6-4、6 | `max-height: calc(100vh - 16px)` + overflow auto；限制文字直接消费现有 core 返回值。根实例克隆上限、删除下限、子项上限、NvM CHOICE 已选均实测。 |
| B1–3 | 明确 UUID 调用 `store.containerActionsFor(target)`，复用 manager.getAddOptions/getRemovalReason；完整遍历定义顺序，无截断、不复制规则。点击可用项直接 addContainerInstance(definitionUuid, parentUuid)。 |
| B4 / D1 | 工具栏原选择弹窗保留；打开时发 opening 事件关闭上下文。按契约 D1，进入二级列表后父菜单收起，列表顶部提供「返回容器操作」；仅一张菜单面板存在，不采用父子面板同时叠放。 |
| C1、2 | Navigator 不再在右键处理内调用 select。实例/定义目标显式区分；定义右键四项禁用，提示使用＋或右键实例。新建/克隆/删除/错误定位均携带显式 UUID，与之前表单选择无关。 |
| C3 | 删除捕获 UUID/配置集 UUID，关闭菜单并等待 DOM 更新后再确认；取消无历史/写盘；确认后若配置集已经变化则不操作另一个配置。 |
| D2 | 成功、外部 pointer/click、Esc、Tab、工具栏弹窗、模块/配置集/导入/生成等对话框、配置集切换及导入开始均关闭。 |
| D3 / W6-5 | 上下循环、Home/End、右进入/左返回、Enter/Space 执行、Esc 退出恢复树焦点，Tab 退出不拦截默认导航；禁用项不可激活。 |
| E1 | 新增 `placeContainerMenu` 测量真实面板宽高、向左/上翻转，钳制不小于 8px；主菜单/二级列表均用同一定位函数，resize 重算。Workspace 移除固定 310×370 假定，项目菜单也按实测尺寸定位。 |
| E2 | 1366×768、1400×768 实机布局测量；683×384、700×384（分别对应上述宽度 200% 缩放的 CSS 可用区域）实测。五项定位用例覆盖同一尺寸组、翻转与负坐标。 |
| 生命周期 | 创建后选中新实例；新增、克隆、删除使用现有 edit/history；取消删除零写入；撤销/重做新增、撤销删除通过。 |
| 红线 | src/core、输出闸门、命名空间、定义资产、存储层/恢复协议未修改。无 TASK-015 实现。未改契约/stage/review。 |

## 文件范围

- `src/ui/ConfigTree/ContainerContextMenu.vue`：独立菜单、二级列表、焦点、生命周期。
- `src/ui/ConfigTree/containerMenuPosition.ts`：目标类型与测量定位。
- `src/ui/ConfigTree/ContainerNavigator.vue`：传递真实右键目标，不影响表单选择。
- `src/ui/ConfigTree/ContainerActions.vue`：保留工具栏弹窗，移除上下文复用模式，通知 opening。
- `src/views/WorkspaceView.vue`：接线、关闭条件、测量项目菜单。
- `src/stores/configStore.ts`：显式目标查询；新增与克隆允许 UUID 参数，省略时保留旧工具栏行为。
- `tests/ui.test.ts`：新增 7 个真实组件+store 集成用例。
- `tests/container-menu.test.ts`：新增 5 个定位用例。

## 前后与实机证据

修正前：[用户原横向菜单](../references/child-menu-current-20261106.png)、[弹窗叠层](../references/child-menu-overlay-20261106.png)。

修正后（均为真实浏览器，测试副本在 localhost:3001；3000 用户配置库不写入）：

1. [紧凑菜单，内联上限/下限原因](evidence/task016/01-context-menu.jpg)
2. [DemEventParameter 全部 7 个直接子定义，必选单例已满灰显](evidence/task016/02-child-options.jpg)
3. [工具栏弹窗，右键浮层数量=0](evidence/task016/03-dialog-no-overlay.jpg)
4. [683×384 左翻转、顶部钳制](evidence/task016/04-edge-200-percent-equivalent.jpg)：rect=(9,8,360,320.4)，见 [DOM](evidence/task016/edge-dom.json)。
5. [700×384 长列表 End 到末项](evidence/task016/05-scroll-end.jpg)：面板高 368/clientHeight 366、scrollHeight 399、scrollTop 29、焦点 DemPidClass。
6. [真实添加后的 DOM](evidence/task016/add-result-dom.txt)：原表单在 DemEventParameter_2；右键 DemEventParameter → 新建 DemCallbackClearEventAllowed，面包屑明确落在 DemEventParameter 下；撤销恢复 DemEventParameter_2。

实测 1400×768 二级菜单 rect=(665,69,360,320.4)，1366×768 rect=(665,157.6,360,320.4)，均未溢出。证据 1–3 使用额外 900×720 窗口保存完整画面。浏览器临时 viewport 已 reset。缩放验证使用等效 CSS 视口，未改变用户浏览器缩放偏好。

测试入口源代码：[TS](evidence/task016/ui-entry.ts)、[HTML](evidence/task016/ui-entry.html)。复现时将其复制为 `.temp/task016-ui.ts/html` 并在 3001 开启 Vite；持久化适配器仅内存 Map，业务 store/core/UI 均为真实代码。该浏览器验证不宣称测得磁盘持久化；保存恢复由全量现有持久化与恢复用例验收。

## 自动验证与既有用例变更

- [完整回归日志](evidence/task016/tests.log)：19 文件 / 289 用例通过（含 15 恢复、43 core 原有用例）。
- [构建日志](evidence/task016/build.log)：TypeScript 与生产构建通过。
- 新增 UI 覆盖：实际右键目标与此前选择不同、全子定义列表、单步撤销重做；定义节点不借用旧实例；显式目标克隆/删除、取消无写盘；错误定位目标；全键盘路径及空态；多关闭时机；官方 NvM CHOICE、导入写锁。
- 原 UI 右键用例只调整两处定位：按实例 data-container-id 找实例（原文字会同时命中定义）；删除按钮包含内联原因，改按包含“删除实例”定位。原禁用、当前选中、关闭断言完整保留。其他既有断言未删改。
- 开发中发现测试构造错误（把 NvM 对象当 createConfigSet 的模块名称）和新增测试的可空 UUID 类型，已修正后全量通过；未改产品规则迎合测试。
- `git diff --check` 通过；core diff 为空；契约哈希一致。
- 桌面入口 `scripts/desktop/Start-Configurator.ps1 -NoBrowser` 复测返回 `Ready: http://localhost:3000/workspace`，无需改链接。正常源码更新自动反映在同一入口。

## 范围与限制

- 只读恢复查看仍走原 RecoveryPanel，不暴露实例编辑菜单；本轮没有新增“容器只读”字段。既有参数 readOnly、隔离保护、导入写锁不变，菜单不绕过这些入口。
- 定义节点右键给出禁用原因及＋路径，没有伪装成实例；未重构定义＋工具栏。
- 父菜单到子菜单为单面板层级导航（契约 D1），与参考图父子并排有所不同；保留直接列出全部子容器和立即创建的核心要求。
- TASK-015 的 ARXML/EXT-001、后续多模块工程等仍由 WorkBuddy 后续契约安排，不在本轮暗中扩大。
- 尚待 WorkBuddy 独立评审；此报告是实现自检记录，不是评审结论。
