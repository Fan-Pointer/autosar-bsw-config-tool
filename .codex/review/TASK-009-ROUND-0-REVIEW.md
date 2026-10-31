# TASK-009 评审意见（第 0 轮）— 不可覆盖快照

> round 0 冻结快照。后续轮次不得修改本文件；新轮次另建 `TASK-009-ROUND-<n>-REVIEW.md`。
>
> - 任务：TASK-009 NvM CHOICE 全链路 + 必填项一键确认建议值
> - 评审人：WorkBuddy（架构师）
> - reviewedCommit：`6812b39524cb15a723dcbdf74a742d2126b42464`
> - 契约哈希：`cf2a86f978694d46471354eca2d3617559fcac8e117d70fb2adc0bdfdc7fc0f0`
> - 评审时间：2026-11-01
> - **判定：APPROVED** ｜ 🔴 0 ／ 🟠 1 ／ 🟡 3

---

## 一、版本与范围绑定

| 核验项 | 结果 |
|---|---|
| `git merge-base --is-ancestor 6812b39 HEAD` | ✅ 成立 |
| 提交后产品路径改动 | ✅ 无 |
| 契约哈希 | ✅ 一致 |
| 改动规模 | 18 文件 / +1027 −28 |
| 新增核心模块 | `ChoiceSelection.ts`、`RequiredDefaults.ts`（均无模块名） |

---

## 二、我独立跑出来的证据

### 2.1 构建与测试

| 项 | 我的实测 |
|---|---|
| `npm run build` | ✅ 10.62s 通过 |
| `npm test -- --run` | ✅ **252 passed / 15 files**（上轮 208，+44） |

### 2.2 红线核查（我上轮预告要卡的三条）

| 红线 | 结果 |
|---|---|
| `src/core` 出现 `NvM`/`CanIf`/`Dem` 字面量 | ✅ **零匹配** |
| 为导出 NvM 而**放宽必填拦截** | ✅ **未放宽**：`if (!def.isOptional && …) missing.push` 逻辑原样保留，反而**新增**了 `choiceSelectionError` 导出前校验 |
| CHOICE 用「同时写两个候选」蒙混 | ✅ 未发生：`addContainerInstance` 直接拒绝第二个候选 |

### 2.3 CHOICE（A/B 组）

| 断言 | 我的实测 |
|---|---|
| `arxmlExportBlockers` | ✅ **0**（上轮 1） |
| CHOICE 识别 | ✅ `NvMTargetBlockReference`，**候选数 2** |
| 互斥 | ✅ 加第二个候选时被**直接拦截**：`CHOICE 只能选择一个候选，请使用切换候选操作` |
| 空选择 + 要求必选 | ✅ `choiceSelectionError` 返回「CHOICE 尚未选择候选」 |
| NvM 导出 | ✅ 选候选 + 填必填后成功，`len=11602`，无错 |
| 候选往返 | ✅ 回读后 `候选子项=1`，`definitionRef` 与选中候选**完全一致** |

`choiceSelectionError` 是通用校验（编辑/导入/导出三处共用），覆盖四种错误：多选、空选（按需）、候选不匹配、候选上限为 0。**没有为 NvM 写任何专用分支。**

### 2.4 一键确认建议值（C 组）

| 断言 | 我的实测 |
|---|---|
| 只处理带 `DEFAULT-VALUE` 的必填项 | ✅ 计划 11 项 = 独立统计的「有默认值」11 项 |
| 不用 fallback 充数 | ✅ `RequiredDefaults.ts` 明确排除：注释「Fallback editor values (0/false/empty) are not evidence of DEFAULT-VALUE」 |
| 剩余项统计 | ✅ 26 项 = 独立统计的「无默认值」26 项 |
| 只读项排除 | ✅ 条件含 `!parameter.readOnly` |

### 2.5 不退化（C4）

| 断言 | 我的实测 |
|---|---|
| CanIf 全未配置仍拒绝导出 | ✅ `ARXML 导出校验失败，必填项未配置…` |
| Dem 15 配置 → 15 VALUE | ✅ 精确相等 |
| Dem 往返内容（值/标志/描述） | ✅ 31 键，**内容差异 0** |

---

## 三、问题清单

### 🔴 阻塞项：无

### 🟠-1 CHOICE 值实例的元素名与 `DEFINITION-REF` 的 DEST 类型不对应

**事实**（我实测导出片段）：

```xml
<ECUC-CONTAINER-VALUE UUID="274c7741-…">
  <SHORT-NAME>NvMTargetBlockReference</SHORT-NAME>
  <DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">/AUTOSAR/EcucDefs/NvM/NvMBlockDescriptor/NvMTargetBlockReference</DEFINITION-REF>
  …
```

统计：`<ECUC-CONTAINER-VALUE>` 4 个、`<ECUC-CHOICE-CONTAINER-VALUE>` **0 个**、`DEST="ECUC-CHOICE-CONTAINER-DEF"` 1 个。

**问题**：用 `ECUC-CONTAINER-VALUE` 承载，却把 `DEFINITION-REF` 的 `DEST` 标成 `ECUC-CHOICE-CONTAINER-DEF`。
schema 上 `ECUC-CONTAINER-VALUE` 的定义引用应指向 `ECUC-PARAM-CONF-CONTAINER-DEF`，两者类型不对应。

**影响**：我们自己的导入器能读回（自往返通过），但**严格按 schema 校验的第三方工具可能拒收或忽略该容器**。这直接关系到「导出的文件能不能给别人用」，是本产品的立身之本。

**依据**：AUTOSAR TPS_ECUConfiguration §2.3.3.1 明确「在 ECU Configuration Values 中，选择列表里只会出现其中一个实例」，且候选 multiplicity 恒为 `0..1`；对应值文件示例见该章 Listing（各版本编号不同）。正确表达应按规范确认（是 `ECUC-CHOICE-CONTAINER-VALUE`，还是干脆不写 CHOICE 层、直接在其父下写被选中的候选实例）。

**定性**：属格式偏差，不影响我们内部往返，故**不阻塞本轮批准**；但下一轮必须按规范校准，并以「用独立 schema/DOMParser 校验 + 若能取得 DaVinci 或官方 XSD 则对照」为验收方式。若校准后仍无法确定正确形式，请在报告中列出两种候选表达并说明依据，不要静默保留现状。

### 🟡-1 参数顺序在往返后被打乱

我按 UUID 建 map 比对，内容零差异；但按数组顺序比对时**不一致**：

```
往返前: [functional-unit(未配置), severity(已配置), …]
往返后: [severity(已配置), functional-unit(未配置), …]
```

原因推测：导出跳过未配置项，导入时按文件顺序追加，导致未配置项被排到后面。

**影响**：AUTOSAR 按 `DEFINITION-REF` 匹配，语义无损；但界面导入后参数行顺序会跳变，逐字节 diff/审计也会误报。
**建议**：导入后按 BSWMD 定义顺序规范化参数/引用顺序（或导出时保留定义顺序占位）。

### 🟡-2 一键确认只覆盖 11 / 37 个必填项，UI 需说清

NvM 有 37 个必填，其中只有 11 个带 `DEFAULT-VALUE`，其余 **26 个必须手填**。
这不是缺陷（官方定义本身如此），但按钮叫「一键确认建议值」容易让人以为能一次搞定。
建议：按钮上或结果提示里直接写明「已确认 11 项，仍有 26 项需手工填写」，并可一键跳到第一个待填项。

### 🟡-3 承前挂账

首次渲染 ≤500 ms 仍未做真实浏览器计时（三轮挂账）；参考图 870 KB 仍在库内。

---

## 四、契约验收逐条核对

### CHOICE（6 条）

| # | 要求 | 判定 | 证据 |
|---|---|---|---|
| 1 | 候选数 ≥2、带 shortName 与路径 | ✅ | 2 个候选 |
| 2 | 互斥 | ✅ | 第二个候选被直接拒绝 |
| 3 | 切换提示 | ⚠️ 未单独验（UI 层，我未开浏览器；代码有 `ChoiceSelector.vue`） | — |
| 4 | 切换可撤销 | ⚠️ 同上，未验 | — |
| 5 | 导出成功且合规 | ✅ / ⚠️ | 导出成功、命名空间/UUID/前缀对；但 🟠-1 的元素名待校准 |
| 6 | 往返保留选中候选 | ✅ | 回读 `候选子项=1`、`definitionRef` 一致 |

### 必填 UX（3 条）

| # | 要求 | 判定 |
|---|---|---|
| 7 | 只处理带 DEFAULT-VALUE 的项、给出剩余数 | ✅ 11 = 11、剩余 26 = 26 |
| 8 | 一条历史、一次撤销 | ⚠️ 核心层未验历史（属 store/UI 层） |
| 9 | 无 DEFAULT-VALUE 不赋任意值 | ✅ 代码条件明确排除 |

### 不退化（4 条）

| # | 要求 | 判定 |
|---|---|---|
| 10 | build 通过 | ✅ |
| 11 | 用例 ≥205 | ✅ 252 |
| 12 | Dem 与 CanIf 不退化 | ✅ 内容零差异、CanIf 仍拦截 |
| 13 | core 零模块名/零 UI 依赖/无新依赖 | ✅ |

**应做项 13 条：9 条完全通过、3 条我未验（UI 层切换提示/撤销/历史）、1 条有条件（导出合规待校准）。**

> 我明确标出「未验」的三条：它们都在 UI 层，我本轮没开浏览器实测。**不代替验证**，也不因未验而扣分——但下一轮若涉及这些文件，我会一并验。

---

## 五、判定

**APPROVED**。

核心目标达成：NvM 从「能读不能写」变成「能读、能选、能导、能回读」，且**没有为它写一行专用代码**——`ChoiceSelection` 与 `RequiredDefaults` 都是通用模块，`src/core` 零 `NvM` 字面量。第二模块闸门到这里才算真正过完。

三道红线守住了：必填拦截没放宽（反而加严）、互斥是真拦截、`arxmlExportBlockers` 机制保留但 CHOICE 不再需要它。

唯一实质问题是 🟠-1 的**元素名/DEST 类型不对应**——自己读得回，别人未必。这是下一轮必须校准的。

---

## 六、下一任务

**TASK-010：ARXML 互操作校准（P0）+ 引用图与拖拽排序**

分两组：

**A 组（P0，必须先做）**
1. 按 TPS_ECUConfiguration §2.3.3.1 校准 CHOICE 值实例的表达（元素名与 DEST 必须自洽）；
2. 参数/引用顺序往返稳定（🟡-1）；
3. 一键确认按钮文案与结果提示写明覆盖率（🟡-2）；
4. 用独立手段校验导出文件（至少 DOMParser + 结构断言；若能拿到官方 XSD 更好）。

**B 组**
5. 引用关系图（Vue Flow）：悬空引用红边、点击定位；
6. 树节点拖拽排序并持久化。

理由：A 组是「导出的文件能不能给别人用」，B 组是「用起来顺不顺手」。前者优先。
