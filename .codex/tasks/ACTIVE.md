# ACTIVE TASK — TASK-010

> 本文件是 Codex 唯一的任务契约来源。开始实现前必须完整读取；**不得修改本文件**（含标题、编号、验收项）。
> 契约哈希由评审方写入 `STATE.json` 的 `task.contractHash`，篡改会导致调度器拒绝派发。

| 项 | 值 |
|---|---|
| 任务编号 | **TASK-010** |
| 任务名 | ARXML 互操作校准（P0）+ 引用关系图 + 拖拽排序 |
| 阶段 | PHASE-10 |
| 指派 | codex |
| 前置 | TASK-009 APPROVED（commit `6812b39`），CHOICE 功能通、格式待校准 |
| **契约修订** | **v2（2026-11-01 07:50）**：**A1 与验收 1 已撤销** —— 原要求基于评审方误判，官方规范证明现值侧写法正确。详见 §0 |

---

## 0. 契约修订记录（评审方认错）

原 A1 要求「用 `ECUC-CHOICE-CONTAINER-VALUE` 元素，或省略 CHOICE 层」，理由是「`ECUC-CONTAINER-VALUE` 配 `DEST="ECUC-CHOICE-CONTAINER-DEF"` 类型不对应」。
**该判断是错的。** 评审方核对 AUTOSAR CP R24-11 TPS_ECUConfiguration，印刷页 129、`[TPS_ECUC_03020]` 原文：

> On the Value side a EcucChoiceContainerDef is treated as a usual container … **Which choice has been taken is defined by the `<DEFINITION-REF>` of the `<SUB-CONTAINER>`.**

`Example 2.33` 的值侧片段即：

```xml
<ECUC-CONTAINER-VALUE>
  <SHORT-NAME>myGwSource001</SHORT-NAME>
  <DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">/AUTOSAR/EcucDefs/Com/…/ComGwSource</DEFINITION-REF>
  <SUB-CONTAINERS> …
```

**与当前实现完全一致。** 值侧本就用普通容器元素 + `CHOICE-CONTAINER-DEF` 的 DEST，选中哪个候选由子容器的 `DEFINITION-REF` 表达。

因此：
- ❌ **A1 撤销**，不得改动现有的值侧表达；
- ❌ **原验收 1 撤销**（不再要求元素名与 DEST 按 `PARAM-CONF` 对齐）；
- ✅ 其余各项保留；A5 改为「对照官方 `Example 2.33` 结构做断言」，不是自创断言。

Codex 在派发后即查规范并停在架构决策处、未擅改代码 —— **处理正确，此停工不计其责**。

---

## 0. 本轮目标（一句话）

先让导出的 ARXML **能被别人的工具认**（CHOICE 表达自洽、顺序稳定），再让配置**能看得见引用关系**（引用图 + 拖拽排序）。

---

## 1. P0 问题（已撤销 — 见 §0）

原拟修「CHOICE 值实例元素名与 DEST 不匹配」，经核对官方规范**该写法即为标准写法**，无问题可修。
本轮 P0 改为：**A3 顺序稳定**与**A4 覆盖率提示**两项体验缺陷（详见交付清单）。

## 2. 交付清单

### A 组：体验与稳健性（P0，必做）

| 编号 | 交付内容 |
|---|---|
| A1 | **参数/引用顺序往返稳定**：`export → import` 后，每个容器内参数与引用的**顺序**与原配置一致（当前未配置项会被排到末尾） |
| A2 | 一键确认按钮与结果提示写明覆盖率：「已确认 N 项，仍有 M 项需手工填写」，并可一键跳到第一个待填项 |
| A3 | 导出文件的**独立校验入测试**：对照官方 `Example 2.33` 的 CHOICE 结构做断言（分组层保留、选中候选由其 `DEFINITION-REF` 表达）+ UUID 唯一 + 命名空间 + DEFINITION-REF 前缀 |
| A4 | 旧文件兼容：用 `6812b39` 版本导出的 ARXML 仍能导入成功（只验不回退，不要求改格式） |

> 原 A1（改 CHOICE 元素名）与原验收 1 已按 §0 撤销。**不得**改动现有值侧表达。

### B 组：引用图与拖拽（P1）

| 编号 | 交付内容 |
|---|---|
| B1 | **引用关系图**：节点=容器实例，边=引用；悬空引用画**红边**并在图上可辨认 |
| B2 | 点击图上节点 → 定位到树与表单（复用既有 `navigate to field`）；点击红边 → 跳到该悬空引用 |
| B3 | 图数据**全部由当前配置 + BSWMD 元数据推导**，不得写死任何模块名 |
| B4 | **树节点拖拽排序**：同层容器可拖拽改序，顺序持久化，刷新后保持 |
| B5 | 图组件**必须懒加载**（`dynamic import`），不得让主包体积明显增大 |

---

## 3. 验收标准

### A 组（5 条）

1. **顺序稳定**：`export → import` 后，同一容器内参数 `definitionRef` 序列完全相同；引用同理。
2. **一键确认提示**：NvM 场景同时给出「已确认 N 项」与「仍有 M 项需手工填写」两个数（数字以实际为准）。
3. **CHOICE 结构断言**：导出文件中 CHOICE 分组保留为 `ECUC-CONTAINER-VALUE` + `DEST="ECUC-CHOICE-CONTAINER-DEF"`，选中候选出现在其 `SUB-CONTAINERS` 中且 `DEFINITION-REF` 指向候选定义 —— 与官方 `Example 2.33` 一致。
4. **旧文件兼容**：`6812b39` 版本导出的 NvM 与 Dem 文件，新版本均能导入成功。
5. **三模块不退化**：Dem / CanIf / NvM 导出与往返均正常；XXE 防线（注入 DOCTYPE 仍拒）保持。

### B 组（5 条）

8. **引用图**：Dem 配置下渲染出节点与边；节点数 = 容器实例数；边数 = 非空引用数。
9. **悬空红边**：构造一个悬空引用，图上该边为红色（可用 class/属性断言）。
10. **点击定位**：点击节点后树选中对应实例；点击红边后定位到悬空引用所在参数行。
11. **拖拽持久化**：同层两容器换序 → 刷新页面 → 顺序保持。
12. **懒加载**：`npm run build` 后主包（`dist/assets/index-*.js`）体积**增幅 ≤ 50 KB**；图代码在独立 chunk。

### 工程（4 条）

13. `npm test -- --run` 全绿，用例数 **≥ 252**；既有用例调整须逐行说明理由。
14. `src/core` 零 `Dem`/`NvM`/`CanIf` 字面量、零 UI 依赖。
15. 新增运行时依赖**最多 1 个**（图库），且必须懒加载；报告给出体积实测。
16. 不得修改 `STATE.json` 的 `stage`、`review/**`、本契约。

---

## 4. 红线

1. **不得**改动现有 CHOICE 值侧表达（它是符合 `[TPS_ECUC_03020]` 与 `Example 2.33` 的）；不得引入 `ECUC-CHOICE-CONTAINER-VALUE` 等规范中不存在的元素名。
2. **不得**为了顺序稳定而改变参数的**语义顺序**（如擅自按字母排序）；必须是「按 BSWMD 定义顺序」或「保留原顺序」。
3. **不得**把引用图做成需要后端的组件；纯前端，数据本地推导。
4. **不得**让图库进主包；必须动态 import。
5. **不得**删改既有测试用例变绿。
6. **不得**声称完成真实浏览器验收除非实际执行。

---

## 5. 分批交付

**round 0 必须完成 A 组全部（A1–A4）**；B 组可留 round 1。
A 组现已不含格式改写，工作量小，应当一轮完成。

---

## 6. 报告要求

| 章节 | 内容 |
|---|---|
| 规范核对 | 确认 CHOICE 现值侧写法符合 `[TPS_ECUC_03020]`/`Example 2.33` 的证据（可只引用契约 §0） |
| 兼容性 | 旧版本文件能否导入（给测试名） |
| 顺序稳定 | 修前/修后的顺序对比证据 |
| 引用图 | 节点/边数、红边判定方式、懒加载后的 chunk 与主包体积 |
| 不退化 | Dem / CanIf / NvM 各自自检 |
| 既有用例变更 | 若有，逐行说明 |
| 未完成与限制 | 显式列出 |
| 自检日志 | build / test 原文关键行 |

---

## 7. 完成后动作

1. 提交代码与本报告（`feat: TASK-010 ...`）。
2. 单独提交 `STATE.json`：`status = "SUBMITTED"`、`submittedAt`、`submissionCommit`（完整 SHA）。
3. 不改 `stage`、不写 `review/**`、不发起下一任务。
