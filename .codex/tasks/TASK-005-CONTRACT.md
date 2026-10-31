# ACTIVE TASK — TASK-005

> 当前唯一有效契约。`STATE.json.task.contractPath` 指向此处。
> 前置契约归档：`TASK-004-CONTRACT.md`、`TASK-003-CONTRACT.md`、`TASK-002-CONTRACT.md`。
> 需求来源：`docs/REQUIREMENTS.md` §2.2 FR-Assist-005、§3.3 NFR-SEC-002。**这两条是既有必做需求，不得降级或移入「已知限制」。**

## 元信息

| 项 | 值 |
|---|---|
| 任务 ID | `TASK-005` |
| 阶段 | PHASE-5（数据进出） |
| 优先级 | P0 |
| 依赖 | TASK-004（APPROVED，界面已定稿） |
| 验收方 | 架构师 |

## 目标（一句话）

让配置**能出去也能进来**：JSON / ARXML / CSV 导出、JSON / ARXML 导入（带预览与冲突四列对比）、且导入过程**不被恶意 XML 击穿**、失败不破坏现有配置。

## 交付清单

### A. 导出（FR-Assist-005）

| # | 要求 |
|---|---|
| 1 | **JSON 导出**：完整配置（元数据 + 全部容器/参数/引用），可被本工具重新导入还原（round-trip） |
| 2 | **ARXML 导出**：命名空间 `http://autosar.org/schema/r4.2.2`；根 `AUTOSAR → AR-PACKAGES → AR-PACKAGE → ELEMENTS → ECUC-MODULE-CONFIGURATION-VALUES`；每个容器/参数值带 `UUID`；`DEFINITION-REF` 指向 `/AUTOSAR/EcucDefs/<Module>/...` |
| 3 | **CSV 导出**：仅 DTC 列表（`DtcValue(hex) | Severity | WWH-OBD Class | Attributes 名 | EventId`），UTF-8 带 BOM 以便 Excel 正确识别中文 |
| 4 | 导出入口放在工程右键 `导出 ▸`（该项当前为禁用占位，本轮改为可用并展开三个子项） |

### B. 导入（FR-Assist-005）

| # | 要求 |
|---|---|
| 5 | **JSON 导入**、**ARXML 导入**；导入前**先预览**，不直接落盘 |
| 6 | 预览面板显示：新增容器数 / 新增参数数 / 冲突数 / 将被删除项数 |
| 7 | **冲突表四列对比**（严格按此列序）：`冲突实例路径 | 参数名 | 文件生成值 / 文件引用值 | 工程配置值 / 工程引用值` |
| 8 | 冲突解决策略三选一：**覆盖**（默认）/ **跳过** / **重命名**（冲突实例重命名后并入） |
| 9 | 导入**事务性**：解析或应用失败时，当前配置必须保持导入前状态（先快照、失败回滚），不得留下半截数据 |
| 10 | 导入入口放在工程右键 `导入 ▸`（当前禁用占位，本轮改为可用） |

### C. 安全（NFR-SEC-002，红线）

| # | 要求 |
|---|---|
| 11 | **禁止 DTD 与外部实体**：解析前拒绝含 `<!DOCTYPE` 的 ARXML，或解析器显式关闭外部实体展开；必须提供**含外部实体的攻击样本测试**，断言未被读取/展开 |
| 12 | 文件大小上限（建议 50MB），超限拒绝并提示 |
| 13 | 不得 `eval`、不得 `innerHTML` 注入解析出的字符串 |
| 14 | 解析异常统一捕获并转成用户可读错误，不得抛裸异常到控制台就结束 |

### D. 顺带修复（TASK-004 评审遗留，不单开任务）

| # | 要求 |
|---|---|
| 15 | 🟠-1：表单底部「添加子容器」入口与工具栏 `＋` 语义重叠且平铺拥挤 → 改为工具栏 `＋` 为唯一主入口，底部改带 `＋` 图标的竖排/下拉，加间距 |
| 16 | 🟡-1：模块页签 `Dem(配置集名)` 加 tooltip 区分「模块 / 配置集」 |
| 17 | 🟡-2：参数行控件列固定宽度并右对齐，使开关/输入/下拉右边界一致 |

## 约束（铁律）

1. `src/core/**` 纯 TypeScript，禁止 import vue/pinia/element-plus；导入导出实现放在 `src/core/io/`。
2. `src/ui/**`、`src/views/**` **禁止出现 `CanIf`/`DemDtc` 等具体模块字段名**（验收 grep）。CSV 列名可写 DTC 语义，但取值必须来自定义驱动。
3. 禁止 `any`、`@ts-ignore`、关 strict、删既有测试。
4. 不得回退 TASK-003/TASK-004 已有能力；测试数 **≥ 83**。
5. 不得实现未核实 UI（引用选择弹窗、自动计算、首页工程列表）。
6. 不得引入后端；全部本地完成。
7. 不得改 `review/**`、`STATE.stage`、本契约、`.codex/references/**`。

## 验收标准

### 功能

- [ ] 导出 JSON → 清空/新建配置集 → 导入该 JSON → 容器数、参数值、引用关系与导出前**完全一致**（逐项比对，非仅"能导入"）
- [ ] 导出 ARXML → 用 XML 解析器（或 XPath 断言）验证：根命名空间为 r4.2.2、`ECUC-MODULE-CONFIGURATION-VALUES` 存在、每个容器有 UUID、`DEFINITION-REF` 形如 `/AUTOSAR/EcucDefs/Dem/...`
- [ ] 导出 CSV → 行数 = DTC 数 + 1 表头；`DtcValue` 为 6 位大写十六进制带 `0x`
- [ ] 构造冲突导入（同实例路径不同参数值）→ 预览显示冲突数、四列对比正确（文件值 vs 工程值）
- [ ] 选「覆盖」→ 工程值被替换；选「跳过」→ 工程值不变；选「重命名」→ 出现重命名实例且原实例不变
- [ ] 导入中间抛错（可注入损坏 JSON）→ 配置回到导入前状态，且给出可读错误

### 安全

- [ ] 含 `<!DOCTYPE ... SYSTEM "file:///...">` 的 ARXML 被拒绝或实体未展开；测试断言外部内容未进入结果
- [ ] 超过大小上限的文件被拒绝并提示
- [ ] 全仓无 `eval(`、无 `innerHTML =` 接收解析结果

### 工程

- [ ] `npm run build` 通过
- [ ] `npm test -- --run` 全绿，**测试数 ≥ 83**
- [ ] `grep -rn "from 'vue'\|pinia\|element-plus" src/core/` 无结果
- [ ] `grep -rniE "CanIf|DemDtc" src/ui/ src/views/` 无结果
- [ ] 全仓无 `any`、无 `@ts-ignore`

### 交付物

- [ ] `.codex/reports/TASK-005-REPORT.md`：含 round-trip 逐项比对表、ARXML 断言输出、XXE 测试输出、三种冲突策略实测记录
- [ ] `STATE.json`：`SUBMITTED`、`round` 0、`submissionCommit` 为**先提交取得的完整 SHA**，状态另提交

## 后续必须覆盖（不得声称已完成）

| 需求 | 归属 |
|---|---|
| 撤销重做 20 步、批量修改、全局搜索、暗色主题（NFR-UX-001 / FR-UI-004） | TASK-006 |
| 引用关系图与悬空引用高亮（FR-Auto-002）、引用选择弹窗、自动计算、首页工程列表 | TASK-006 |
| 1000 DTC 性能、跨浏览器、新手引导、交付文档（NFR-PERF/COMP/UX） | TASK-007 |

## 自检命令

```bash
cd "D:/ProFile/教培业务/配置器/autosar-bsw-config-tool"
npm run build
npm test -- --run
grep -rn "from 'vue'\|pinia\|element-plus" src/core/ || echo "OK core"
grep -rniE "CanIf|DemDtc" src/ui/ src/views/ || echo "OK 无写死模块"
grep -rn ": any\|@ts-ignore\|eval(" src/ tests/ || echo "OK 无 any/eval"
```
