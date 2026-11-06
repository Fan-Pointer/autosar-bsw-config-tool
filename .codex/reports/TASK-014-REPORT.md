# TASK-014 交付报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-014 / 0 |
| 日期 | 2026-11-06（实际提交时间见 STATE.task.submittedAt） |
| 契约 | ACTIVE v4，SHA-256 `cda634f973e634ee1090cac6b72dd729d41a21c31386c0e6a10a0097a7ddcece` |
| 基线 | TASK-013 已评审提交 `a15331500b46882c7591d17768d09b0ff4fc010e`；开始实现前 WB 下发 READY |
| 代码提交 | 本报告所在提交；完整 SHA 由随后单独的 STATE 交接绑定 |
| 构建 | `npm run build` 通过，10.81 s；保留既有大包体警告 |
| 测试 | 277/277 pass，0 fail / 0 pending，18/18 文件收集；原 265 项 + 新 12 项 |

## 交付文件与验收对照

| 契约 | 文件 | 实现和实测 |
|---|---|---|
| A1 | `src/core/output/OutputGate.ts` | 纯 TS、无模块名硬编码；确认值投影后复用 DefinitionConstraints；返回 ready + 有路径/原因/锚点的 issues；必填参数、必填引用、未选择 CHOICE 均 ERROR；false/0 有效；不修改输入 |
| A2–A3 | `src/stores/configStore.ts`、`src/views/WorkspaceView.vue`、`src/core/io/Arxml.ts`、`Csv.ts`、`generator/CGenerator.ts` | store 唯一注入 DemConstraints；校验、导出、生成分别重新求值；同一动作内传递同一结果；JSON 取回不受业务闸门阻挡 |
| B1–B3 | `CGenerator.ts` | 仅生成 isConfigured 且有值的字段；可选参数/引用不填假值；移除 defaultValue 回退；文件头解释通用数据与接入方初始化职责；实际 gcc 严格编译成功 |
| C1–C2 | `BswmdTypes.ts`、`BswmdParser.ts`、`Arxml.ts` | 模块/容器/参数/引用 definitionPath、官方 $source 保留；引用 destinationRef(s)/kind/isExternal 保留用于真实分类；非默认包路径完整往返；Arxml 仅路径取值和闸门接线变化 |
| D1 | `scripts/test-collection-guard.ts`、`package.json` | `npm run test:verify` 独立扫描磁盘 .test.ts，与 runner 集合逐路径核对；漏收/重复/意外文件/空集合或空文件失败；故意只收单文件的 CLI 负例 exit 1 |
| D2 | `tests/helpers/legacy-map.json` | 删除已无引用的旧映射；Git 历史保留 |
| D3 | 本报告末节 | 给评审方提供 fixture 文档要点，未擅改其设计文件 |
| A4 | `tests/arxml-fidelity.test.ts`、`choice.test.ts`、`output.test.ts` | 按 v4 改正三项旧官方成功测试；官方 Dem 成功输出由真实必填引用和 CHOICE 支撑；CanIf/NvM 不冒充成功 |

core 改动严格为新闸门、parser 元数据、三个输出消费方接线及 C 生成保真；未改 namespace、DEST、引用候选算法、标签顺序、恢复/存储协议、官方定义或核心约束算法。Dem 插件补充跳过可选未配置值，避免插件把官方可选 DTC 参数错误升级成必填。

## 闸门语义与一致性矩阵

| 输入 | 校验面板 | ARXML | CSV | C 头/源 | JSON |
|---|---|---|---|---|---|
| 必填建议值未确认 | ERROR | 同 issues 拒绝 | 同 issues 拒绝 | 同 issues 拒绝 | 可取回 |
| 必填引用为空 / CHOICE 未选 | ERROR | 同 issues 拒绝 | 同 issues 拒绝 | 同 issues 拒绝 | 可取回 |
| 确认值超范围 / 模块扩展规则失败 | ERROR | 同 issues 拒绝 | 同 issues 拒绝 | 同 issues 拒绝 | 可取回 |
| 有效 false / 0 | 通过 | 原值 | 语义对应原值 | FALSE / 0 | 原值 |
| 可选值或引用仅有缓存、未确认 | 无该项假错 | 不输出 | 不输出假数据行 | 不生成字段 | 保留编辑状态 |
| 必填外部引用 | 明确跨模块未支持 | 拒绝 | 拒绝 | 拒绝 | 可取回 |

共用的是业务就绪问题集合。各编码器仍保留格式能力检查：例如 CSV 需要 DTC 语义，ARXML 不接受 XML 控制字符/非法实例名；C 格式边界测试使用合成夹具，不拿 XML 命名规则阻止合法 C 转义。直接调用 core 且不传结果时执行通用定义规则；应用消费方通过 store 统一注入模块规则。参数 result 仅供当前同步动作使用，应用未跨动作缓存。

## 运行与 L08 界面证据

使用真实 Vue/Pinia/WorkspaceView，在 `http://localhost:3001/.temp/task014-ui.html` 创建官方 Dem 内存样例。入口限制 3001 origin，createConfig 后不读取或写入本机配置库；用户 `localhost:3000` 原有工程保留。

1. 点击“代码验证”：显示必填参数、必填引用和 CHOICE ERROR，不再错误显示“验证通过”。
2. 点击“生成 C 代码”：显示“请先修复验证错误”，验证列表保留，没有打开生成文件弹窗。
3. 点击 DemClientId 错误：跳转 DemGeneral → DemClient，DemClientId 数字输入获得焦点，显示未确认建议值 0。
4. 关闭隔离测试页；最新实际配置器 `http://localhost:3000/workspace` 保持打开。

证据见 `evidence/task014/ui-blocked.png`、`ui-error-anchor.png` 及对应 DOM 文本；`ui-entry.ts` / `ui-entry.html` 是该隔离入口副本，复制回 `.temp/task014-ui.ts` / `.temp/task014-ui.html` 即可在 3001 Vite 复查。未用浏览器脚本直接改变产品状态。

## 自检命令输出

完整日志与逐项摘要在 `evidence/task014/`。

```text
npm run test:verify -- --reporter=json --outputFile=.temp/task014-final-tests.json
Test Files  18 passed (18)
Tests       277 passed (277)
Duration    19.04s
Test collection guard: 18/18 disk test files collected
core.test.ts: 43 passed; recovery.test.ts: 15 passed
Official Dem gcc -std=c11 -Wall -Wextra -Werror -pedantic -fsyntax-only: exit=0
Official Dem output identity: 40 configured = 40 VALUE = 40 C parameter fields

npm run build
vue-tsc --noEmit && vite build
✓ built in 10.81s
```

官方集合测试不写死 40，逐 definitionPath（由 definitionRef 对应）与值比对 ARXML，逐容器/字段顺序和值比对 C；本次实际为 40。另保留合成 TEST-SYNTHETIC-1 精确 15 = 15 = 15。C 既有特殊名称/转义编译测试原断言保持。XXE/攻击矩阵、15 项恢复测试全部通过，未跳过测试。收集守卫真实 CLI 负例（只指定 definition-metadata.test.ts）为预期失败，不计产品失败。

## 既有用例变更逐条说明

| 文件 | 变更前提 / 保留断言 |
|---|---|
| core.test.ts | 两个 C 成功用例显式确认 required 值及该用例关注的可选 false；DTC 非法值矩阵含 undefined 的测试将合成字段设为必填，继续检查全部非法值；原 43 项保留 |
| editor.test.ts / editor-ui.test.ts | 人工构造悬空引用补 isConfigured=true，继续断言真实已确认悬空引用 |
| lifecycle.test.ts / ui.test.ts | 重复 DTC 场景显式给两项相同值 1；不把未确认建议值当重复错误；C 阻止测试先补完整参数再清目标引用，原阻止断言保留 |
| io.test.ts | CSV 成功场景补合法必填值；引用所指目标同步重命名；CSV 自由文本转义使用合成 STRING 语义，保留原转义断言，不用非法 ENUM 测格式 |
| arxml-fidelity.test.ts 官方 Dem | 补 OperationCycle/EventMemorySet 两个已有合法内部引用，保留原 VALUE/往返/攻击断言 |
| arxml-fidelity.test.ts CanIf | 原 45 参数往返改为必填引用拒绝 + JSON 无损；45 参数确认/缺失路径检查保留；InitHohConfigRef 为模块内未配置，另两项跨模块明确拒绝；完整树和状态 JSON 保留 |
| choice.test.ts NvM 0/1 | 两候选原官方 ARXML 成功断言按 v4 改为 Ea/Fee 外部必填引用拒绝 + JSON 全树、候选身份无损；原通用 CHOICE 两候选 ARXML 成功测试保留 |

仅上述三项官方测试名称按契约重命名，未删除原测试数量；新增 output 9 项、definition-metadata 3 项。早期失败与修复过程保留在 `.temp/task014-*`；归档的最终证据不掩盖最初 13 项前提问题。

## 未完成与限制

- TASK-015 负责 ARXML r4.0 命名空间/旧输入兼容、DEST/候选、生成顺序等；本次仍为旧 namespace，不能据编译或自往返宣称供应商集成通过。
- CanIfCtrlDrvCfg 的官方 lower=1，不能删必选实例伪造可输出子集。CanIf 完整成功输出、NvM Ea/Fee 候选跨模块成功输出尚未支持；请求 WorkBuddy 在范围 G05 保留此限制。
- 我的初次澄清误称 InitHohConfigRef 跨模块，并错误建议可删 CanIfCtrlDrvCfg；原记录和随后纠正保留在 `TASK-014-CLARIFY-REFERENCES.md`，最终实现遵守 v4。
- 新右键“新建 → 子容器”、消除旧菜单/弹窗重叠及项目多模块仍在后续 S4/S5，未在本任务抢跑。
- 生成物是通用配置数据，接入/初始化由使用方负责；没有 DaVinci 或供应商 BSW 验收环境。大包体告警尚存。

## 提供给 WorkBuddy 的文档要点（D3）

建议在 `02-TECH-DESIGN.md` §5 加入：格式编码/渲染/转义测试使用明确标识的 TEST-SYNTHETIC-*，为该行为显式配置合法前提；业务就绪、官方默认/必填/CHOICE/引用使用官方定义，不能以旧手写映射或合成字段数量替代官方验收。外部目标不可伪造；未支持能力作为限制记录。

## 待确认

无新的产品范围问题；等待 WorkBuddy 对本代码版本独立评审。Codex 未修改评审结论、stage、契约或 lastReview。
