# TASK-015 评审意见（第 0 轮 · 冻结快照）

> 评审方：WorkBuddy ｜ 时间以本文件 git 提交时间为准 ｜ 判定：**APPROVED**

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-015 / round 0（S3b ARXML 互操作：namespace/引用/顺序保真） |
| reviewedCommit | `d2606e790304738bf2da2eb49cb169a0095bac52`（实现）；交接提交 `e37b4da741d5c2cefb8efc856c77868ee6392000`（STATE SUBMITTED，仅 status/submissionCommit/submittedAt 三字段，合法） |
| 契约 | ACTIVE = TASK-015，哈希 `9f2bb2eba3b0663627f3fdd708810cb6f96f5f9132ddb69f86e48456f3fe200e`（恢复下发时实算一致） |
| 结论 | **APPROVED** — 0 阻塞 / 0 重要 / 2 建议 |
| 验收 | A1–A3 / B1–B3 / C1–C3 / D1–D3 全达成；验收标准 1–6 全过 |

---

## 一、独立复核证据（本机重跑/实读）

### 1. 运行

| 项 | 结果 |
|---|---|
| `npx vue-tsc --noEmit` | ✅ 独立重跑 exit 0 |
| `npm run build` | ✅ 独立重跑通过（15.34s，既有 chunk 警告保留） |
| **独立 `npm run test:verify`** | 首跑遇宿主 EPERM 收集抖动（`%TEMP%` 写入被 node-brokered-fs-shim 拦截 → io.test/io-ui.test 未收集，**258 collected 全 pass、0 用例失败**，收集守卫按设计拒绝）；**二次重跑 21/21 文件 + 302/302 passed, 0 fail, 0 skip + 守卫通过** ✓（302 = 289 基线 + 13 新增：互操作 10 含 it.each 展开 2 + 脚本 3） |
| 红线 diff | 存储层/恢复协议 **0 diff**；OutputGate 语义未动（`getOutputCheck` 仅包装加绑定，规则仍纯函数重求值）；`AUTOSAR_NAMESPACE` 为唯一口径改动 ✓ |
| 测试删削 | io.test 仅 namespace 标题随口径更新；external-entity.arxml xmlns 更新后恶意实体**仍必须拒绝**（断言保留）；ecuc-ui 外部引用用例按 B3 行为跟随改写且**断言更强**（新增 `exportJson` 前后逐字节相等）；无删削 ✓ |

### 2. 逐组核验

| 组 | 核查 |
|---|---|
| **A1/A2 namespace** | `AUTOSAR_NAMESPACE = 'http://autosar.org/schema/r4.0'`（注释引 TPS_ASR_00011/00017，namespace≠发布版本）；`LEGACY_NAMESPACE` r4.2.2 兼容读入 + `onWarning` 回调 → `ImportSession.warnings` → ImportDialog 黄条（截图 03 实证：「来源为旧版本命名空间 r4.2.2…再次导出使用 r4.0」）；其余命名空间与非 AUTOSAR 根仍拒绝 ✓ |
| **B1 全候选** | 新增 `src/core/config/ReferenceCandidates.ts`（纯 TS 零模块名）：`destinationRefs[]` **遍历全部路径**，缺省回落单 `destinationRef`，再缺省回落短名称（旧定义兼容）；三消费方同源——store 候选、可创建目标过滤、`DefinitionConstraints` 校验均改调 `matchesReferenceDefinition`，消除三处重复实现 ✓ |
| **B2 DEST 分类** | `referenceDefinitionDest` 按 kind 映射 ECUC-REFERENCE-DEF / ECUC-CHOICE-REFERENCE-DEF / ECUC-FOREIGN-REFERENCE-DEF / ECUC-INSTANCE-REFERENCE-DEF；测试断言导出含 `DEST="ECUC-CHOICE-REFERENCE-DEF"` ✓ |
| **B3 外部只读/有损拒绝** | UI：选择按钮 `disabled="readonly \|\| isExternal"` + inline 原因 + 清除引用同禁；store `setReferenceTarget` 对 isExternal 直接 throw（双保险）；候选为空。导入端 `ECUC-INSTANCE-REFERENCE-VALUE` **显式拒绝**（「未丢弃原始数据」），不静默丢上下文链 ✓ |
| **C1/C2 顺序保真** | 导出改为按 `definition.parameters/references` **定义顺序** flatMap（不再 Map 插入序）；导入解析后按定义索引恢复混合顺序；测试用例「nonalphabetic」：先把 Map reverse（Z 在 A 前）再导出，断言 `/ZText` 出现早于 `/ANumber`、`/ZChoice` 早于 `/APlain`——**无字母排序直接实证**；`serializeConfig` 全字段逐项比对 + 双重往返（restored→export→import 仍相等）；容器实例序保留原序 ✓ |
| C3 | ADMIN-DATA 剥离后标准值仍读（0/false/转义文本/引用均断言）✓ |
| **D1 绑定** | `ConfigOutputCheck extends OutputCheckResult + {configUuid, lastModified, revision}`；`validate()` 对跨配置/过期时间/同毫秒旧 revision 一律 throw「输出检查已过期」；仅 store 封装层，OutputGate 纯函数语义未变（TASK-014 R2 不回退）✓ |
| **D2 CSV** | 有效非 DTC 模块 CSV 明确拒绝「此模块未定义 DTC CSV 导出字段」+ 断言 ✓ |
| **D3 确定性** | 评审方**独立连跑**：`gen-bswmd-from-arxml.mjs Dem` 对官方 14.6MB 两次运行 JSON sha256 **逐字节一致**（`713e7bd2…`）；`$source.contentSha256 = 709cdde6…` 与报告表格逐字一致；日志「容器 67 \| 参数 162 \| 引用 64」与报告一致；changelog 格式 `bswmd-changelog/1` 记录 before/after + 前后 hash；4.2.2 定义版本写出前拒绝 ✓ |

### 3. UI 与证据审阅

- 截图 02：候选同含 FirstMemory/SecondMemory，第二候选可选中、验证通过——CHOICE-REFERENCE 多候选贯通（另有官方 Dem DemPrimaryMemory 自动化集成实证，非仅合成样例）。
- 截图 03：导入预览黄色警告条 + 冲突表 FirstMemory(文件)/SecondMemory(工程)、冲突数 1——旧文件兼容 + 冲突预览实证。
- `legacy-preview.txt`、`generator-determinism.json`、`changelog-example.json`（来自测试副本，原 fixture 未动）均在；`typecheck.txt` 有内容（TASK-016 🟡-1 空证据问题已改进）。
- 报告 §限制显式声明：未做完整 XSD 验证、未做供应商导入/BSW 集成验证、XML value 元素 UUID 不持有——无过度宣称 ✓。

## 二、建议项（🟡，不阻塞）

1. **🟡-1** 导出对本地 instance 类引用目前统一用 `<ECUC-REFERENCE-VALUE>` 元素名 + `DEST="ECUC-INSTANCE-REFERENCE-DEF"`，元素名与 DEST 存在潜在不匹配（标准上 INSTANCE 值元素应为 `ECUC-INSTANCE-REFERENCE-VALUE` 且需 CONTEXT-REF 上下文链）。当前产品数据路径不可达（instance 引用均为外部只读、导入端已显式拒绝），测试亦无覆盖；建议在支持本地 instance 序列化之前，导出端对 `kind === 'instance'` 显式拦截给原因（沿 B3 有损拒绝精神），或于 S5 多模块契约一并统一。
2. **🟡-2** `changelog.json` 语义为「保留最后一次真实 diff」而非累积历史（报告已声明，Git 承担历史）——建议 S7 交付文档（README/操作手册）同步写明该语义，避免使用者误当变更日志库。

## 三、裁定

- **TASK-015 round 0 = APPROVED**（绑定 `d2606e790304738bf2da2eb49cb169a0095bac52`）。
- 🟡-1 入 S5 多模块契约前置清单；🟡-2 记 S7 交付文档。
- 03-ROADMAP S3（S3a+S3b）全部完成；**进入 S4**：W6 已由 TASK-016 交付，S4 剩余范围（G09 术语/IA、G10 行四态、G11 入口收敛收尾、G12 CHOICE 切换预览、G13 引用弹窗暂存、G14 问题面板、G20 撤销/批量回归、G22 入站/出站列表）下发 TASK-017；S5 前置多模块（ADR-11）保留不降级。
