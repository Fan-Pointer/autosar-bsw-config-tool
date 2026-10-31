# 项目工程档案：AUTOSAR BSW Config Tool

## 1. 项目概况

**一句话目标**：基于浏览器的 AUTOSAR BSW 配置工具，首期实现 DEM DTC 模块的可视化配置与 ARXML 导入导出。

**当前阶段**：② 架构设计 → ③ 模块实现（Phase 2：BSWMD 解析器与动态配置引擎）

**仓库维护责任**：由架构师（锻码师）承担，含评审通过后提交、定期推送、远程同步校验

**最后更新时间**：2026-10-31

---

## 2. 技术栈与版本

| 层级 | 技术 | 版本 | 状态 |
|------|------|------|------|
| 前端框架 | Vue 3 | 3.4.x | ✅ 已确认 |
| 语言 | TypeScript | 5.2+ | ✅ 已确认 |
| UI 组件库 | Element Plus | 2.4+ | ✅ 已确认 |
| 状态管理 | Pinia | 2.1+ | ✅ 已确认 |
| 本地存储 | LocalForage | 1.10+ | ✅ 已确认 |
| ARXML 处理 | fast-xml-parser | 4.x | ✅ 已确认 |
| 图形可视化 | @vue-flow/core | 1.x | ✅ 已确认 |
| 构建工具 | Vite | 5.x | ✅ 已确认 |
| 测试 | Vitest | 1.x | ⏳ 待核实 |
| UUID 生成 | uuid | 9.x | ✅ 已确认 |

---

## 3. 架构决策记录（ADR）

### ADR-001: 纯前端架构（无后端）
- **场景**：工具需离线可用，部署简单，无敏感数据上云顾虑
- **决策**：纯前端实现，浏览器本地存储（IndexedDB）
- **理由**：
  - 满足 NFR-SEC-003 安全需求
  - 单用户本地使用场景，无并发需求
  - 部署零成本，GitHub Pages 可直接托管
- **代价**：无法多用户协作、数据无服务端备份
- **状态**：已接受

### ADR-002: 模块化单体（Module-based Architecture）
- **场景**：BSW 模块众多（DEM/DCM/NvM/Can...），需逐步扩展
- **决策**：模块化单体架构，每 BSW 模块为独立子模块
- **理由**：
  - 当前团队<5人，微服务过度设计
  - 模块边界清晰（DemConfig/DcmConfig/...），便于逐步交付
  - 后期可拆分为微前端
- **代价**：需自律维护模块边界，避免跨模块直接引用
- **状态**：已接受

### ADR-003: 数据模型层与 ARXML 转换层分离
- **场景**：ARXML 格式复杂，内部模型需面向 UI 优化
- **决策**：双模型架构——内部 JSON Model ↔ ARXML Model ↔ XML String
- **理由**：
  - UI 操作使用扁平化 JSON Model，便于表单绑定
  - ARXML Model 保留完整 AUTOSAR 结构
  - 转换层可独立测试、迭代
- **状态**：已接受

### ADR-004: 先 DEM 后全 BSW 的演进策略
- **场景**：BSW 模块众多，资源有限
- **决策**：MVP 聚焦 DEM DTC 模块，验证技术可行性后扩展
- **理由**：DTC 配置是 DEM 核心，场景典型，复杂度适中
- **切换触发**：DEM 模块验收通过 → 扩展至 NvM/DCM/Can 等
- **状态**：已接受

---

## 4. 模块清单与进度

| 模块 | 状态 | 说明 |
|------|------|------|
| DemConfigSet 管理 | 🚧 未开始 | Phase 2 |
| DemDTC 配置 | 🚧 未开始 | Phase 2 |
| DemDTCAttributes 配置 | 🚧 未开始 | Phase 2 |
| DemEventParameter 配置 | 🚧 未开始 | Phase 2 |
| Debounce 算法配置 | 🚧 未开始 | Phase 2 |
| FreezeFrame 配置 | 🚧 未开始 | Phase 2 (P1) |
| ExtendedData 配置 | 🚧 未开始 | Phase 2 (P1) |
| ARXML 导入导出 | 🚧 未开始 | Phase 3 |
| 配置验证引擎 | 🚧 未开始 | Phase 2 |
| 引用关系图 | 🚧 未开始 | Phase 3 |
| 配置向导 | 🚧 未开始 | Phase 4 (P1) |
| 暗色/亮色主题 | 🚧 未开始 | Phase 4 |

---

## 5. 接口约定

### 5.1 ARXML 命名空间与 UUID 规范

```
命名空间: http://autosar.org/schema/r4.2.2
UUID 生成: RFC4122 v4，使用 uuid 库
ECUC 前缀: ECUC_Dem_{参数短名}
```

### 5.2 内部 JSON Schema 约定

见 `docs/internal-data-model.md`

### 5.3 本地存储键名约定

| 键名 | 内容 | 格式 |
|------|------|------|
| `autosar-config-v1` | 主配置数据 | IndexedDB (via LocalForage) |
| `autosar-ui-state` | UI 状态（主题、面板折叠）| LocalStorage |
| `autosar-history-v1` | 撤销/重做历史 | IndexedDB |

---

## 6. 已知风险

| 风险编号 | 描述 | 等级 | 缓解措施 |
|----------|------|------|----------|
| R-001 | ARXML Schema 验证复杂，可能无法完全兼容 DaVinci | 高 | Phase 3 用真实 DaVinci 导入验证 |
| R-002 | 1000+ DTC 大数据量性能风险 | 中 | Phase 2 做虚拟滚动优化 |
| R-003 | 纯前端无法做服务端 Schema 校验 | 中 | 内置 XSD 子集校验，复杂场景提示用户 |
| R-004 | 条件字段联动逻辑复杂，易遗漏 | 中 | Phase 2 用联动配置表驱动 |
| R-005 | 跨 BSW 模块扩展时数据模型需重构 | 中 | ADR-002 模块化设计预留扩展点 |

---

## 7. 待办

### 当前待办（Phase 1）
- [ ] 创建 GitHub 仓库（等待王上手动创建）
- [ ] 初始化 Vue 3 + Vite 项目骨架
- [ ] 配置 ESLint + Prettier + TypeScript 严格模式
- [ ] 实现 Dem 数据模型定义
- [ ] 实现基础 Pinia Store

### 后续待办
- [ ] Phase 2: 核心配置模块（Codex 开发）
- [ ] Phase 3: ARXML 导入导出（Codex 开发）
- [ ] Phase 4: UI/UX 完善（Codex 开发）
- [ ] Phase 5: 测试与验收

---

## 附录：Codex 协作流程

### 任务下发格式（给 Codex 的指令模板）

```markdown
# Task-{编号}: {模块名}

## 背景
参考: SRS 第 X 章，工程档案第 X 节

## 目标
具体要实现的功能点

## 输入
- 已有代码路径
- 数据模型定义

## 输出
- 需交付的文件列表
- 验收标准

## 约束
- 禁止事项（纯前端、TS 严格模式等）
- 性能要求

## 参考
- 代码示例
- ARXML 片段
```

### 验收流程
1. Codex 提交代码 → 写 `reports/<task>-REPORT.md` → 改 `STATE.json` 为 `SUBMITTED`
2. 锻码师评审（按 `.codex/review/_TEMPLATE.md` 出具 `review/<task>-REVIEW.md`）
3. 问题分级输出（🔴阻塞/🟠重要/🟡建议）
4. Codex 按 REVIEW 修复 → 追加报告 → 改回 `SUBMITTED`，`round` +1
5. 通过后 `APPROVED` → 架构师提交并推送 → 更新工程档案

---

## 附录 B：仓库维护规约（2026-10-31 定）

**责任归属**：仓库由架构师（锻码师）维护，王上不再手动操作 Git。

| 项 | 规约 |
|---|---|
| 远程 | `git@github.com:Fan-Pointer/autosar-bsw-config-tool.git`，主分支 `main` |
| 提交时机 | ① 每次评审判定后立即提交评审产物；② 架构文档/协议变更后；③ 定时守护任务发现滞留改动时 |
| 提交前置 | 有 `node_modules` 时先跑 `npm run build`，失败不提交并保留现场 |
| 提交粒度 | 一次提交一个关注点，不混合无关模块 |
| 消息格式 | `feat(<模块>): ...` / `fix(<模块>): ...` / `review(<task-id>): ...` / `chore(repo): ...`；禁用 "update"/"修改" |
| 禁止操作 | `push --force`、`reset --hard`、提交 `node_modules`/`dist`/`.env`、提交构建失败产物 |
| 远程冲突 | `pull --rebase`，冲突即停并报告，不强推 |
| 自动化 | ①`AUTOSAR配置器-Codex交付自动评审`（每小时）；②`AUTOSAR配置器-仓库定时守护`（每 6 小时） |

**同步判据**：`git rev-parse HEAD` 与 `git rev-parse origin/main` 一致才算已同步。

---

**下次工程卡**
- 本次已交付：AGENTS.md 握手协议、STATE 状态机、TASK-002 契约、评审/报告模板、两个定时任务（自动评审 + 仓库守护）
- 下次回来做什么：等 Codex 跑完 TASK-002 一轮，看 `.codex/review/TASK-002-REVIEW.md` 首轮判定
- 需带来的材料：Codex 执行输出（若有报错）、`STATE.json` 当前内容
