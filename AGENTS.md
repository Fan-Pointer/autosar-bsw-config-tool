# AGENTS.md — AUTOSAR BSW Config Tool 开发规约

> **本文件由 Codex 在每次任务开始时自动读取。任何任务执行前，必须先完整阅读本文件与 `.codex/STATE.json`。**

## 0. 你必须先做的事（每次任务开始，无条件执行）

```
1. 读 .codex/STATE.json          → 得知当前阶段与任务状态
2. 按 state 分派：
   - "READY"               → 读 .codex/tasks/ACTIVE.md，开始实现
   - "CHANGES_REQUESTED"   → 读 .codex/review/<TASK>-REVIEW.md，只修阻塞项+重要项
   - "SUBMITTED"           → 不要动代码，等人工评审（说明一句即可退出）
   - "APPROVED"            → 读 .codex/tasks/ACTIVE.md，看是否有下一个任务
3. 读 .codex/decisions/ADR-*.md  → 遵守已定架构决策，不得擅自推翻
```

**禁止跳过第 0 步直接写代码。** 状态不符时擅自开工，是本项目最严重的违规。

---

## 1. 项目事实

| 项 | 值 |
|---|---|
| 项目 | 网页版 AUTOSAR Classic BSW 配置工具（对标 Vector DaVinci Configurator）|
| 技术栈 | Vue 3 + TypeScript(严格) + Pinia + Element Plus + Vite |
| 仓库根 | `D:\ProFile\教培业务\配置器\autosar-bsw-config-tool` |
| 当前阶段 | Phase 2 — BSWMD 解析器与动态配置引擎 |

## 2. 架构铁律（违反即打回）

1. **`src/core/**` 必须是纯 TypeScript**，禁止 import vue / pinia / element-plus。
2. **UI 不得硬编码模块字段**。所有表单/树/校验，必须由 BSWMD 定义驱动（`src/core/bswmd`）。
3. **模块可插拔**：新增 BSW 模块 = 新增 `bswmd/<module>_bswmd.json`，不改核心代码。
4. **禁止 `any`**。确需时写 `unknown` + 类型守卫。
5. **UUID 统一走 `src/utils/uuid.ts`**，不得自造。
6. **配置实例必须保留 `definitionRef`**（指回 BSWMD uuid），否则导出/校验会断链。

## 3. 代码规范

- 所有导出函数写 JSDoc（含 `@param`/`@returns`）。
- 组件用 `<script setup lang="ts">`，文件名 PascalCase。
- 复杂逻辑（递归解析、约束求值、模板渲染）必须有行内注释解释**为什么**，不是复述代码。
- 提交粒度小：一个文件一个关注点，commit message 用 `feat:` / `fix:` / `refactor:` 前缀。

## 4. 完成即交付（必须写报告）

任务实现完成且 `npm run build` 通过后，**必须**：

1. 创建 `.codex/reports/<TASK-ID>-REPORT.md`，模板见 `.codex/reports/_TEMPLATE.md`。
2. 修改 `.codex/STATE.json`：
   - `task.status` → `"SUBMITTED"`
   - `task.submittedAt` → 当前 ISO 时间
   - `task.reportPath` → 报告相对路径
3. `git add -A && git commit -m "feat(<task-id>): <一句话>" && git push`

**未写报告 = 任务未完成。** 评审环节依赖报告，缺报告会直接被退回。

## 5. 收到评审意见后

`.codex/STATE.json` 的 `task.status` 为 `CHANGES_REQUESTED` 时：

1. 读 `.codex/review/<TASK-ID>-REVIEW.md`。
2. **只修 🔴 阻塞项和 🟠 重要项**，🟡 建议项除非零成本否则跳过。
3. 在 `.codex/reports/<TASK-ID>-REPORT.md` **追加**「## 第 N 轮修复」小节，逐条对应评审编号说明改法。
4. `STATE.json` 改回 `SUBMITTED`，`task.round` 加 1。
5. 推送。

不要重写整个文件来"绕过"评审——必须逐条响应。

## 6. 禁区

- ❌ 引入后端服务、向远程发配置数据（本项目纯前端离线）。
- ❌ 修改 `.codex/review/**`（那是评审方的产物）。
- ❌ 修改 `.codex/STATE.json` 的 `stage` 字段（阶段推进权在评审方）。
- ❌ 为通过编译而 `@ts-ignore` / 关 strict / 删测试。
- ❌ 一次 commit 混合多个无关模块。

## 7. 不确定时

在报告里写「## 待确认」小节列问题，**不要猜**。架构类问题一律停下等答复，实现细节可自行决定并说明理由。

---

**协议版本**：1.0 ｜ **维护方**：架构师（锻码师）｜ **执行方**：Codex
