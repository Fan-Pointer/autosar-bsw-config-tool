# 当前状态总览（2026-11-09 22:30）

> 本文件是**唯一入口**：任何人（人或 AI）接手本项目，读这一份即可接上，不必翻阅过程记录。
> 过程证据在 `.codex/reports/`、`.codex/review/`、`.codex/STATE.json`；需求基线在
> `../EasySAR调研手册/需求文档_v3.0.md`。

## 1. 项目是什么

单机（纯前端）AUTOSAR BSW 配置器，对标 EasySAR Configurator（`config.gkanghui.com`）。
浏览器内完成：选模块 → 建容器实例 → 填参数 → 校验 → 生成 C / 导出 ARXML。

- **技术栈**：Vue 3 + TypeScript + Pinia + Element Plus + Vite；存储 localforage；测试 Vitest
- **定义库**：官方 ECUC 定义抽取为 `bswmd/builtin/`（4.4.0 / 4.2.2），Dem 98 / Dem 4.2.2 84 等
- **边界（不做）**：账号登录、云端协作、回收站、历史版本、分享/转让

## 2. 当前进度

| 状态 | 内容 |
|---|---|
| ✅ 已完成（批次一） | 多实例列表视图 + 列设置、多值参数增删行、进制切换、参考数据导入入口预留 |
| ✅ 已完成（用户反馈轮） | 「默认值即配置」（必填默认值/BOOLEAN 缺省不再误报）、模块右键菜单（校验/生成/导入/导出模块 ARXML） |
| ✅ 已完成（批次 A） | G39 参数行禁用通道 + G40 工程管理三项（编辑/复制/详情） |
| ✅ 已完成（批次 B 部分） | G41 四固定树节点、G43 工作现场恢复 + 容器校验绿 ✓、G42 引用多值（模型/ARXML/JSON/UI） |
| ⏳ 未做 | 引用选择器树形分页、工程 ARXML/工程包 zip、批量验证/关闭、G34 生成策略、G35 芯片 11 项、G36 列表筛选分页、G37 顺序管理、辅助批（描述/源码版本/类型列/横向表格/自动计算） |

**测试基线**：30 个测试文件 / 369 个用例。并行跑时 `editor-ui` 与 `ecuc-ui` 的 500ms 性能断言
可能抖动超时（既定环境口径），隔离复跑通过即判过。

## 3. 目录职责（哪些能动、哪些别动）

| 路径 | 性质 | 可否清理 |
|---|---|---|
| `src/` `tests/` `scripts/` | 源码与测试 | ❌ 绝不动 |
| `bswmd/builtin/` | 官方定义抽取结果 | ❌ 重建成本高 |
| `.codex/` | 状态机、报告、评审追溯 | ❌ 追溯链 |
| `.temp/` | 测试/构建日志（可再生） | ✅ 可随时清空 |
| `dist/` | 构建产物（可再生） | ✅ 可删，需重建 |
| `../onesar-site-deploy/` | 发布副本（`git archive` + build） | ✅ 构建日志可删 |
| `../EasySAR调研手册/` | 需求基线 + 调研证据（含 `appendix/raw-probe-20261106.zip` 原始抓包存档） | ❌ 别动 |
| `../交付文件/` | 交付物（205 个 SVG） | ❌ 别动 |
| `../Autosar Configurator/` | 原站二进制参考 | ❌ 别动 |

## 4. 工作纪律（三条硬规则）

1. **每完成一个任务立即 `git push origin main`**。教训：11-09 曾有 7 个提交未推，导致 Codex
   基于 11-06 的旧基线重复实现，两边界面出现"只有一边有"的功能。
2. **每次功能完成后发布**到 `https://onesar-configurator.app.workbuddy.host/?sharecode=JBNIKOXRCN`：
   `git archive HEAD` → `onesar-site-deploy/` → `npm run build` → 发布。只发布已提交且测试通过的版本。
3. **UI 细节以用户裁定为准**，需求文档写的功能不等于必须照搬（L2 顶级容器页签、实例名称行、
   行内 notice 均已被用户要求移除）。

## 5. 已验证的事实（避免重复踩坑）

- 官方 `AUTOSAR_MOD_ECUConfigurationParameters_4.2.2/4.4.4.arxml` 中 **`ENABLE-CONDITION-REF` 出现 0 次**
  → 依赖型禁用不可从数据推导，参数行禁用只来自：可选未勾选、定义只读、模块规则通道
- 「默认值即配置」：ARXML 只写显式确认值（ECUC 惯例，往返零 diff）；C 代码输出必填默认值
- 单值引用与多值引用共用 `ConfigReferenceValue`：多值时用 `targetUuids`，单值保持 `targetUuid`（零迁移）

## 6. 下一步（按价值排序）

1. **C 批次产出闭环**：工程 ARXML（多模块合一）+ 工程包 zip（ARXML + C + manifest）+ 验证所有工程/关闭所有工程
2. **TASK-023**：G34 生成目录 4 策略 → G36 工程列表筛选分页 → G37 顺序管理 + 自动命名
3. **G42 收尾**：引用选择器树形 valuePath + 分页 10；多值目标逐项悬空检测
4. **辅助批**：新建工程描述/源码版本、问题面板类型列、横向表格、自动计算
