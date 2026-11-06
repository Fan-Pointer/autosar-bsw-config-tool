# TASK-014 评审意见（第 0 轮）— 不可覆盖快照

> 评审方：WorkBuddy ｜ 2026-11-06T10:55:00+08:00（以 git 提交时间为准）｜ 判定：**APPROVED**
> 本文件为 round 0 冻结快照，后续轮次不得修改；新轮次另建 `TASK-014-ROUND-<n>-REVIEW.md`。

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-014 / round 0（S3a 输出同源闸门） |
| reviewedCommit | `ccb8f12`（实现主体；中间澄清 v2→v3→v4 三轮哈希演进 `6825d106→633c8b41→cda634f9`，最终按 v4 实现） |
| 契约 | ACTIVE v4，哈希 `cda634f973e634ee1090cac6b72dd729d41a21c31386c0e6a10a0097a7ddcece` |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 3 建议 |
| 验收 | A1–A4 / B1–B3 / C1–C2 / D1–D3 全达成 |

---

## 一、独立复核证据（本机重跑/实读）

### 1. 运行

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 17.91s 通过 |
| **独立 `npm run test:verify`** | **18/18 文件收集守卫通过 + 277/277 passed, 0 fail, 0 skip**（265 基线 + 12 新增：output 9 + definition-metadata 3） |
| recovery 15 项 / core 43 项 | 全绿不回退 ✓ |
| XXE 攻击矩阵 | 回归全拒（io.test 保持）✓ |

### 2. 白名单纪律（逐文件）

| 文件 | 核查 |
|---|---|
| `src/core/output/OutputGate.ts`（新增 166 行） | **纯 TS**：import 仅 core 类型 + ConstraintEngine/DefinitionConstraints；grep `Dem\b` **零匹配**——无模块名硬编码 ✓ |
| `src/core/io/Arxml.ts`（40 行） | diff 仅两处白名单改动：①`assertOutputReady(outputCheck ?? evaluateOutputReadiness(...))` 闸门消费（同动作求值或传递，R2 语义）②`definitionPath ?? 既有路径回退` 取值接线。**namespace/DEST/结构生成零触碰** ✓ |
| `src/core/generator/CGenerator.ts` | **`const actual = value ?? parameter.defaultValue;` 已删除**——defaultValue 回退路径清除（B1 ✓） |
| `src/modules/dem/DemConstraints.ts` +10 | `optionalUnset()` 修正：插件不再把官方可选未配 DTC 参数升级为必填（bug fix，模块层允许）✓ |
| `tests/helpers/legacy-map.json` | 已删除（D2 ✓） |
| `scripts/test-collection-guard.ts` + `test:verify` | 磁盘文件数与 runner 集合核对，含 CLI 负例（故意漏收 → exit 1）（D1 ✓） |

### 3. 语义与分类断言（本轮核心）

| 断言 | 位置与内容 |
|---|---|
| **拒绝原因两类分类** | `arxml-fidelity.test.ts:360-369`：`CanIfCtrlDrvNameRef`/`CanIfCtrlCanCtrlRef` → reason 含「目标跨模块（本期不支持）」；**模块内** `CanIfInitHoh` → reason **不含**「跨模块」——与 v4 裁定逐字一致 ✓ |
| NvM 两候选 | `choice.test.ts:220-225`：EaBlock/FeeBlock → 跨模块拒绝 ✓；`arxmlExportBlockers` 机制保留 ✓ |
| **四输出一致性** | `output.test.ts`：必填建议值未确认 → 校验/ARXML/CSV/C 同一 issues 拒绝 + JSON 可取回；**L08 回归用例在列** ✓ |
| **纯函数重求值（防陈旧）** | `output.test.ts:197`「re-evaluates after edits instead of authorizing a new state with a previous pass」——R2 语义直接落地 ✓ |
| **规则注入无模块名** | `output.test.ts:225`「injects module rules without naming a module in core, then shares the same action result」✓ |
| **官方集合恒等** | `output.test.ts:278`：官方 Dem 补齐必填 CHOICE/内部引用后，逐 definitionPath 比对 已配置集 ≡ ARXML VALUE 集 ≡ C 字段集（实测 40，不写死）；合成 15=15=15 保留 ✓ |
| false/0 与可选缓存 | `output.test.ts:173`：确认的 0/false 保留、可选与缓存未配引用从全部输出剔除 ✓ |

### 4. UI 证据

`evidence/task014/ui-blocked.png`、`ui-error-anchor.png` + DOM 文本：真实 Vue/Pinia/WorkspaceView 流程——「代码验证」显示 ERROR（不再"验证通过"）、「生成 C 代码」被拦截且验证列表保留、错误点击定位到字段。**L08 缺陷闭环**。

## 二、过程观察（不阻塞）

1. **`5b8a7e4` 桌面启动器提交**在本轮实现期间入库（scripts/desktop + AGENTS.md 7 行）——工具性内容、非产品代码，但属契约外提交；建议今后契约外产物在报告「范围外动作」节显式声明。
2. **诚实度**：Codex 主动记录自己两处自我纠正（InitHoh 跨模块误判 → 模块内；CanIfCtrlDrvCfg lower 误判 → 1），原始澄清与纠正均留档——合格。
3. 早期失败过程（13 项前提问题）保留在 `.temp/task014-*`，最终证据不掩盖——合格。

## 三、建议项（🟡，不阻塞）

1. **🟡-1** `exportArxml(config, module, outputCheck?)` 的可选参数允许调用方传陈旧结果（类型上无防护）；建议 S3b 或 S4 给 store 封装加「result.configUuid + config.lastModified 校验」，把"同动作"约束类型化。
2. **🟡-2** `OutputGate` 复用 ConstraintEngine 时每次构造引擎实例，5000 实例场景可测后决定是否缓存引擎（S7 性能）。
3. **🟡-3** 报告矩阵中「CSV 需要 DTC 语义」的非 DTC 配置 CSV 行为未显式断言，S3b 顺手补一行。

## 四、裁定

- **TASK-014 round 0 = APPROVED**（绑定 `ccb8f12`）。
- 🟡-1 入 TASK-015 附带项；🟡-2 记 S7 性能清单；🟡-3 入 TASK-015。
- 下一契约 **TASK-015（S3b）**：namespace r4.0 + 输入兼容 + 引用全候选/DEST/isExternal + 往返保真顺序稳定，见 `ACTIVE.md` 与 STATE 绑定哈希。
- 02-TECH §5 fixture 规则按 D3 要点由评审方补录（另提交）。
