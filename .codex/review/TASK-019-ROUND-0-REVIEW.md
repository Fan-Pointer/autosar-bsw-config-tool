# TASK-019 评审意见（第 0 轮 · 冻结快照）

> 评审方：WorkBuddy ｜ 时间以本文件 git 提交时间为准 ｜ 判定：**APPROVED**

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-019 / round 0（工程向导 + 内置模块 4.4.0 + 悬停直选 + 首页 EasySAR-C） |
| reviewedCommit | `46a39e5a60bc6c80a6b175003a79e2ea938cd3df`（实现）；交接提交 `d055113b2a65d04933b97a88023d6c9099f13022`（STATE SUBMITTED，仅三字段，合法） |
| 契约 | ACTIVE = TASK-019，哈希 `0bb62d5d2427cb0e85a6c0ab69ce9af826775e288c5333ccdce515aaa2c45c2b`（二次增补重绑版） |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 3 建议 |
| 验收 | A0–A3 / B1–B3 / C1–C4 / D1–D2 / E1–E4 全达成；验收标准 1–7 过（第 1 条经隔离复跑判定，见 §1） |

---

## 一、独立复核证据

### 1. 运行（含评审方环境事件的两轮排查）

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 独立重跑（13.12s，含 vue-tsc） |
| `npm run test:verify` | 首轮 1 失败 + 守卫 24/23：①守卫多收集 `_archive/20261106-cleanup/temp-full/verify-independent.test.ts`——**评审方清理备份污染扫描面，评审方责任**，当场修复（备份内测试文件改名 `.bak` + `.gitignore` 增 `_archive`）；②editor-ui「20 步撤销 ≤500ms」连续三轮 502.77/532.12ms 超限 → **单文件隔离复跑 342.88ms 通过**（与 Codex 全量基线 352.86ms 一致；逻辑层 editor.test 25.53ms 稳定）→ 判定为**多 worker 并发满载下的边缘抖动，非 46a39e5 回归**；Codex 自测 327/327 通过属实。终态：23/23 守卫 + 326/327 + 该用例隔离通过 |
| `src/core` diff | **0 行** ✓（ADR-13 复合键留给 TASK-021，与本轮承诺一致） |
| STATE 提交 | 仅 status/submissionCommit/submittedAt 三字段 ✓ |

### 2. 逐组核验（A0–E4）

| 组 | 核查 |
|---|---|
| **A 悬停直选** | `pointerenter` 展开 / 父项与子菜单 `pointerleave` 300ms 延迟收起 / 子菜单进入取消延迟；键盘 ArrowRight/Left/Esc 与悬停共用同一子菜单组件；DOM 断言「快移不关闭、不重复浮层、仍可点击」；报告诚实声明截图 03/04 为键盘展开（不冒充 hover 实测）✓ |
| **B 内置模块** | `builtinCatalog.ts` 三模块（Dem/CanIf/NvM@4.4.0）+ `?raw` 动态 import 独立 chunk（237.02/81.68/41.67 kB gzip 29/11/6.7）——主包 1187.51 kB 不含定义资产；`readBuiltinModules` 校验目录版本与定义一致；changelog/溯源入库；README 提供再生成命令 ✓ |
| **C 工程向导（ADR-12）** | `projectMetadata.ts` 独立侧表（moduleShortNames/setUuids）；assertWritable + 原始侧表比较；**双键写入的孤儿可检测/可恢复语义如实声明**（不宣称跨键事务）；缺失 UUID 警告保留；删归属不删配置；旧 sets 归默认工程读取零写入；两步取消零写入测试 ✓ |
| **D 诚实边界** | 4.2.2 待接入 + 全源盘点如实（`fullcatalog-source-inventory.json`：4.2.2 **84 总/20 解析**、Dem rejected「DemDTCSeverity 枚举无效」；4.4.0 **98/92**）；「解析通过 ≠ 功能支持」声明；增补 5 点中未完成项显式交接不虚报 ✓ |
| **E 首页改版** | 截图 `task019-supplement/home-1366x768.png` 亲眼复核：航海科技/OneSAR 品牌、蓝白清爽目录、打开配置器+新建工程真实入口、本机工程列表（默认工程·研究验证_20261103）、知识库/订阅中心入口、无二维码/外链；服务区 bottom 599.69 DOM 存证（1366×768 首屏可见）✓ |
| **附加** | 实例名输入 draft 修复（真实浏览器发现的旧缺陷：change/blur 提交、失败恢复、单测覆盖）——契约外真实缺陷修复，报告显式声明 ✓ |

### 3. UI 证据审阅

- `task019-supplement/`（用户浏览器补查）：home-1366x768.png + start-page.png（起始页不自动续开旧工程）——覆盖报告自述「最新压缩布局尚未浏览器复核」的缺口。
- 报告诚实度突出：01/05/06/09 旧截图显式标注为压缩前布局不冒充；「未虚报请求文件等于调用成功」；中途测试失败过程留痕。

## 二、建议项（🟡，不阻塞）

1. **🟡-1** editor-ui 20 步撤销在满载并发下余量不足（隔离 342ms / 满载 500+ms，阈值 500ms）——非本轮回归，建议 S7 性能阶段处理（提升余量或该用例降并发），在此之前全量验证偶发超限按「隔离复跑」口径判定。
2. **🟡-2** 工程侧表双键写入窗口的孤儿关联已可检测可恢复，建议 TASK-020/021 顺手补「打开工程时自动修复提示」的 UI 呈现（当前仅警告）。
3. **🟡-3** `HANDOFF.md` 保持未暂存（Codex 处理正确）；TASK-019 评审通过后由评审方按迭代规则更新至 v1.1 并随下一契约提交。

## 三、裁定

- **TASK-019 round 0 = APPROVED**（绑定 `46a39e5a60bc6c80a6b175003a79e2ea938cd3df`）。
- 用户新增确定范围（完整双版本目录 / 统一左右选择器 / 工程内增减模块 / 4.2.2 Dem 枚举修复）**已修订进 TASK-021 并下发 READY**；旧「三模块/Dem 起步即完成」口径废止，以清单验收收口。
- `AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml` 澄清采纳：文件名 4.4.4、内部实为 4.4.0（SHA256 `c01fbd95…` 与 4.4.0 官方一致），版本以文件内容为准。
- 本轮证据（含 task019-supplement）与两份官方 ARXML 保留。
