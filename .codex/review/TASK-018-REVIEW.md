# TASK-018 评审意见（第 0 轮 · 冻结快照）

> 评审方：WorkBuddy ｜ 时间以本文件 git 提交时间为准 ｜ 判定：**APPROVED**

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-018 / round 0（UI 简化优先插队：R1–R5） |
| reviewedCommit | `65308eec999e6e230a511de5aec429890a82e382`（实现）；交接提交 `7f4c512ec242be57acd4d9a85903d3967bb8037d`（STATE SUBMITTED，仅三字段，合法；两次运行间 `git diff 65308ee 7f4c512` 仅 STATE 3 行——**首次 555ms 失败与最终通过之间零代码改动**，性能门槛未动） |
| 契约 | ACTIVE = TASK-018，哈希 `a0ac1ce12d10547cf891955b893eb6da87bd59f0482f2f4716da40ec817bdff5` |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 2 建议 |
| 验收 | A1–A2 / B1–B3 / C1–C2 / D1–D3 全达成；验收标准 1–5 全过 |

---

## 一、独立复核证据

### 1. 运行

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 独立重跑（12.62s） |
| **独立 `npm run test:verify`** | **22/22 收集守卫 + 317/317 passed, 0 fail, 0 skip，一次通过**（315 基线 + 2 新增说明区用例） |
| 撤销性能 | 评审方本机 20 步 undo **21.44ms**（门槛 500ms）——首跑 555ms 系与 build 并行的资源竞争（报告诚实保留原始失败日志 `tests-initial-parallel-build.txt` 且未改阈值/未删证据，处理方式合格） |
| 红线 diff | `src/core` + `src/stores` **0 行**；存储/恢复协议 0 diff；OutputGate/W6 定位模块未动 ✓ |
| 测试删削 | 删除行仅报告映射表声明项（菜单四动作/关闭项断言、行下说明断言、长解释断言），替换断言**等价或更强**（title/aria-description 逐字相等 + Enter/逐行 click 后 `JSON.stringify(config)` 不变）；用例数 315→317 无删测 ✓ |

### 2. 逐项核验（R1–R5）

| 项 | 核查 |
|---|---|
| **R1 三项收敛** | 模板仅剩 新建实例/克隆实例/删除实例；「定位错误」「关闭菜单」菜单项删除（`navigate` emit、firstError 一并清理）；用例精确比较三项文本 + 断言无定位项；Esc/Tab/外点/键盘/焦点恢复用例保留通过；定位能力由问题面板承载（「keeps error location in the problem panel after removing the context-menu shortcut」）✓ |
| **R2 名称直选** | 子列表项模板仅 `{{ option.definition.shortName }}`，`<small>` 说明行/menu-caption 全部删除；保留一行空态与返回箭头；官方 Dem 实机 7 个子定义（截图 04 亲眼复核：仅名称、末项灰显、无任何解释/多重性文字）✓ |
| **R3 禁用悬停** | `aria-disabled` + `title` + `aria-description` 三通道同源（均为 core 动作对象原因）；键盘可聚焦读原因（focusItem 改选全部 button，注释说明意图）；**写入拒绝为函数级守卫**（add/clone/remove 提前 return 未删）——用例断言 Enter 与逐行 click 后 config 逐字节不变 + `addContainerInstance` 直调仍 throw「正在应用导入」；CHOICE 候选 title 逐字等于 disabledReason 且含「CHOICE」✓ |
| **R4 定义节点** | 长解释改为「请右键实例节点」（仅 title/aria-description，无正文重复）；三项 aria-disabled；「触发全部动作后 exportJson 仍相同」+ never-borrows 断言保留——不借用上次实例 ✓ |
| **R5 底部说明** | `.field-help` 行内块移除（断言 exists=false + dom-1366 `inlineHelpBlocks=0`）；新 `FieldDescriptionPanel.vue` 读 BSWMD 定义（路径/类型/范围/枚举），`helpFieldUuid` 为纯视图状态零写入；底部「参数说明/问题」同停靠区 v-show 切换（`bottomDocks=1`，无叠层）；程序化 focus（问题定位）不抢页签；切实例/切集/关模块清理旧说明——均有断言 ✓ |

### 3. UI 证据审阅

- 截图 04 亲眼复核（1400×900）：二级直选仅 7 个名称、DemDebounceAlgorithmClass 灰显、返回箭头；底部「参数说明｜问题(33)」双页签共存且展示 DemEventConfirmationThreshold 说明+定义路径+类型/范围——R2/R3/R5 一图三证。
- `dom-1366.json`：无横向溢出、dock (0,507,1366,261) 窗口内；09-final-child-help-1366 同屏名称菜单+底部说明。
- 官方 Dem 4.4.0 真实定义实机、3000 用户库未编辑——边界诚实 ✓。

## 二、建议项（🟡，不阻塞）

1. **🟡-1** `vite.config.ts.timestamp-*.mjs` 临时文件仍未加入 `.gitignore`（TASK-017 🟡-1 顺延；本轮未混入提交，但每次 dev 都会再生）——建议 S5 首契约顺手处理。
2. **🟡-2** 底部说明/页签状态为会话内视图状态，刷新不保持（报告已声明）——属合理边界，建议 S7 交付文档写明，不另立任务。

## 三、裁定

- **TASK-018 round 0 = APPROVED**（绑定 `65308eec999e6e230a511de5aec429890a82e382`）。
- S4 收尾插队完成；UI 简化（R1–R5）落地，用户指令闭环。
- **下发 TASK-019（S5 首契约：多模块并存，ADR-11）**：gen 脚本批量模式、Dem+CanIf/NvM 并存全链路、「按工程导出」manifest、跨模块引用边界（含 TASK-015 🟡-1 本地 instance 导出拦截）。
