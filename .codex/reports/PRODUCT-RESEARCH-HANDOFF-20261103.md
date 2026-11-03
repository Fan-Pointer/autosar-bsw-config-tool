# PRODUCT_RESEARCH_HANDOFF_20261103

Codex → 指定 WorkBuddy 任务「配置器 / 设计 Autosar BSW 配置工具架构」。这是调研与需求设计交接，不是业务实现提交或评审结论。

## 已完成且须阅读的研究

- `docs/product-research/00-STATUS.md`
- `docs/product-research/01-CURRENT-PRODUCT.md`
- `docs/product-research/02-BENCHMARK-INVENTORY.md`
- `docs/product-research/03-GAP-MATRIX.md`：G01–G30，含代码定位、优先级、验收建议。
- `docs/product-research/04-STANDARDS-AND-EVIDENCE.md`
- `docs/product-research/evidence/` 与 `.codex/references/easysar-2026-11-03/`：真实浏览器观察。未验证能力明确标记，不可升级成事实。

基线源码 `1e03827c10722e0f45d98acd5774454e9030f325`；规划已到 `1b76986`。本轮没有改业务代码。构建通过；全量测试 250 项，179 通过、70 失败、1 环境跳过，原始 JSON 在 `.temp/baseline-20261103-tests.json`。

## 首先修正 S0 草案（有实际反例）

`tests/helpers/legacy-map.json` 是测试适配表，不是无损迁移表：

1. `ecuc-dem-dtc-j1939-node-ref` 被映射为 `ECUC:ec5f19c2-2f59-4a05-a5a7-21fc4e8b49e3`，真实新定义是 **DemDTCSeverity**。节点字符串不能升级成严重性枚举。
2. `ecuc-dem-attr-immediate-nv` 被映射为 `ECUC:13bf7d23-8cc0-4b57-8911-92658b0cb328`，真实新定义是 **DemAgingAllowed**。两者业务含义不同。
3. 存在多对一替换，层级也变化。47/47 命中不证明语义等价，更不能在 `src/core` 写 Dem 专用映射。

请独立核对并撤回 D5 的产品化映射及 A4。S0 应先逐项隔离、保护原始数据、原样下载、保留可恢复的版本/定义关系；准确历史定义可作为独立只读恢复来源。跨版本迁移须另有逐字段语义依据、未映射保留与预览，不承诺本轮无损自动升级。

实际观察到的是打开旧库加载失败，原 IndexedDB 记录仍在；覆盖是后续写路径的代码风险，未在用户真实数据上故意复现。请修正“打开即已证实丢失”的措辞。还须处理草案 D2 拒写与 A3 首次写尝试备份的时序矛盾；永久保留初始恢复快照，不能被普通三份轮转淘汰；备份失败必须阻止覆盖。

## 其他核心事实

在隔离的 localhost origin 创建官方 Dem 后，布尔/数值保存刷新正常，引用选择/撤销重做、CHOICE 均实际操作。但校验显示通过后，ARXML 导出拒绝 28 个必填未配置项；证据见 `evidence/local-export-after-validation.dom.txt`。需要统一校验/输出的 isConfigured 规则；C 生成也必须检查，不可偷偷生成建议值。

命名空间为 r4.0，发布基线为 CP 4.4.0，二者不同；官方源文件标示 AUTOSAR_00046.xsd。标准依据和未取得完整 XSD 的限制见 04。不得以自制小 schema 冒充官方验证。

## 请 WorkBuddy 完成设计与阶段契约，然后交回 READY

用户本轮已明确授权继续；常规设计无需再请用户逐轮确认。遵循已确认范围：CP 4.4.0、单一配置、标准文件及通用可编译 C；无供应商环境，不宣称供应商集成通过；本地离线，保持数据与角色边界。

1. 完整阅读研究并独立核对关键代码，修正 S0；将所有 G01–G30 逐项安排阶段或解释不纳入理由，不用降低质量标准清空待办。
2. 在 `docs/product-design/` 完成可维护设计：目标/角色/场景/边界、功能与优先级、信息架构/核心流程/状态、重要页面线框或可运行原型、技术方案/模型/接口/改动范围、阶段计划/可验证验收/交付限制。先完成文档，再下发实现。
3. 更新规划，保留 TASK-011 既有有效成果和测试失败事实；第一 READY 聚焦安全恢复，后续按依赖拆小契约，记录输出一致性/标准互操作/体验/交付任务。测试语义适配不得沿用错误映射削弱断言。
4. WorkBuddy 只写架构、设计、契约、评审及允许的状态字段；不要改业务源码，不要暂存 Codex 的研究文件。Codex 将自行提交研究。
5. 完成后 scoped commit，并在 STATE 绑定新契约哈希、设置 READY；本轮 Codex 主对话继续实施，不同时另唤后台 Codex worker。请回传你的提交和第一阶段契约。

最终阶段须真实运行与独立技术评审，交用户产品验收，达到既定边界后停止派无关任务。
