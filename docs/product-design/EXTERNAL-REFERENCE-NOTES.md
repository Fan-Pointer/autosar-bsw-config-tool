# 外部输入登记与裁定（持续更新）

> 维护方：WorkBuddy 评审方。登记一切来自项目外的交付物/参考物及其**是否并入、何时并入、为什么不并入**的裁定，防止范围漂移。

---

## EXT-001：MISAR 会话 ECUC 抽取器（2026-11-06 登记）

| 项 | 值 |
|---|---|
| 来源 | `C:\Users\Pointer\WorkBuddy\2026-11-06-10-29-38\ecuc-extractor\`（另一 WorkBuddy 会话，服务 ORIENTAIS Studio V4.2 MISAR 项目线） |
| 形态 | `ecuc_extract.py`（Python 标准库单文件，974 行，零第三方依赖）+ `CONTRACT.md`（`ecuc-ui-schema/1.0`，明确写"交接给 BSW 配置工具架构任务"）+ `out/`（index / 38 模块 JSON / fields.json 2994 字段 / values / changelog / JSON Schema） |
| 数据源 | **AUTOSAR CP 4.2.2** 厂商定义（PUHUA/ORIENTAIS，iSoft SDG 元数据，38 个 `*Def.arxml`）；SHA `60d39e2d…` —— **与我们产品基线 CP 4.4.0 官方 14.6MB 文件（SHA `c01fbd95…`）不同源** |
| Dem 交叉验证 | 4.2.2 厂商版：65 容器/153 参数/57 引用/**14 choiceReference**；我们 4.4.0 官方：67/162/64/10 CHOICE-REFERENCE-DEF —— 版本演进差异，两边独立提取可互为对照 |

### 裁定

| # | 裁定 | 依据 |
|---|---|---|
| 1 | ❌ **38 份模块 JSON 不作为产品定义** | 版本冲突（4.2.2 vs 已裁定 4.4.0 基线）+ 结构不同（path 键 vs uuid+definitionPath、children vs subContainers）+ 单一事实源纪律；TASK-014 进行中不引入第二抽取管线 |
| 2 | ✅ **吸收三点思路到我们的 `gen-bswmd-from-arxml.mjs`**（S3a 后小改动，非契约项）：确定性输出（无时间戳/键序固定，ARXML 不变→逐字节不变）+ `contentSha256` 比对跳过重建 + **changelog 字段级 diff** | 该实现的确定性设计成熟，直接增强我们的溯源与再生成体验 |
| 3 | 🔭 **S5（多模块，ADR-11）评估两项**：①厂商 ADMIN-DATA/SDGS 元数据提取（HIDE_FLAG/GROUP_NAME 等 16 种 → 界面分组/隐藏提示）②widget 命名体系（boolean/choiceContainer/choiceReference…，对齐 ORIENTAIS Unit 体系）作为 UI 提示元数据候选 | 属 UI 增强与多模块"厂商定义来源"范围，需王上届时裁定；不自动纳入 |
| 4 | ⚠️ **边界提醒**：若王上未来想用 ORIENTAIS 厂商模块定义（如厂商特定参数），必须显式声明「定义来源=厂商包 4.2.2」并标注版本，与 4.4.0 官方定义并存时同名模块按版本区分——属范围决策，未经裁定不得混入 | 防止 4.2.2/4.4.0 静默混淆 |

### 与 CONTRACT.md 的接口关系

其契约自称"界面唯一接口约定"，但我方已有同等能力（官方 4.4.0 直读 + `bswmd/*_bswmd.json` + definitionPath），**采纳其思想、不采纳其作为接口**。若未来确需消费其 38 模块数据，须先写适配层并入 ADR，当前不做。
