# TASK-015 交付报告

## 元信息

| 项 | 值 |
|---|---|
| 任务 / 轮次 | TASK-015 / 0 |
| 完成时间 | 2026-11-06T13:23:00+08:00 |
| 基线 | WorkBuddy 恢复契约提交 8a19708ee65ee3fd63bc77e7b551e634fdcc1fdb |
| 契约 | ACTIVE.md，SHA256 9f2bb2eba3b0663627f3fdd708810cb6f96f5f9132ddb69f86e48456f3fe200e |
| 构建 | npm run build 通过；生产代码最终版无后续改动 |
| 回归 | test:verify 21/21 文件收集，302/302 通过，0 skip |
| 类型检查 | 最终 vue-tsc --noEmit 通过；typecheck.txt 记录退出结果 |

## 交付对照

| 条目 | 实现及验证 |
|---|---|
| A1 | Arxml.ts 输出 namespace r4.0；配置版本仍绑定官方定义 4.4.0。 |
| A2 | importArxml 接收 r4.2.2，通过 onWarning 回调→临时 ImportSession.warnings→ImportDialog 警告；拒绝其他命名空间及非 AUTOSAR 根。 |
| A3 | 修改 tests/io.test.ts 旧命名空间测试标题、tests/fixtures/external-entity.arxml 的 xmlns；恶意实体拒绝断言保持。兼容性专用新用例有意保留 r4.2.2。未取得完整官方 XSD。 |
| B1 | ReferenceCandidates.ts 共用匹配：有 destinationRefs 时遍历全部路径，否则单 destinationRef，均缺失才兼容旧短名称。store 候选、可创建目标和 DefinitionConstraints 同源。 |
| B2 | DEFINITION-REF DEST 按 reference/choice/foreign/instance 对应 ECUC-REFERENCE-DEF / ECUC-CHOICE-REFERENCE-DEF / ECUC-FOREIGN-REFERENCE-DEF / ECUC-INSTANCE-REFERENCE-DEF。真实支持本地 REFERENCE/CHOICE 值；不伪造外部值。 |
| B3 | 外部引用按钮、清除入口只读并显示原因，store 写入也拒绝；候选为空。输出仍使用既有 OutputGate 跨模块拒绝。输入 INSTANCE-REFERENCE-VALUE 明确拒绝上下文链，避免静默丢掉该节点。 |
| C1 | **选择 BSWMD 定义顺序**：参数/引用导出按定义数组；XML 解析器按 tag 分组后，读入根据定义索引恢复混合类型和缺省字段顺序。没有按名称排序。容器实例顺序保留原序。 |
| C2 | 完整序列化对象比对覆盖 0/false/转义文本、配置标记、可选禁用/未确认建议、描述、配置/容器 UUID、参数/引用顺序、时间戳，重复往返一致；重复参数仍拒绝。 |
| C3 | 删除私有 ADMIN-DATA 后，标准配置值/引用仍可读，字段顺序仍为定义顺序。 |
| D1 | ConfigOutputCheck 绑定 configUuid + lastModified + revision；validate 拒绝跨配置、过期时间和同一毫秒内编辑的旧结果。仅 store 封装，未改 OutputGate 规则。 |
| D2 | 无 DTC 导出元数据的有效模块，CSV 明确拒绝“此模块未定义 DTC CSV 导出字段”，新增断言。 |
| D3 | gen 脚本移除 generatedAt；对象键固定、语义数组不排序；原文件 sha256 + 语义正文 contentSha256；同目录 changelog.json 按模块记录上次实际变化，UUID 对象数组字段 diff，顺序变动记 /$order。版本非 4.4.0 在写出前拒绝。 |

## 文件与范围

- 核心：新增 src/core/config/ReferenceCandidates.ts；修改 constraint/DefinitionConstraints.ts、io/Arxml.ts、io/IoTypes.ts。
- 应用：stores/configStore.ts、ui/FormEditor/DynamicForm.vue、ui/ImportExport/ImportDialog.vue。
- 工具：scripts/gen-bswmd-from-arxml.mjs（现有 Vite middleware 加载纯 TS 解析器，不启动网络监听或新增依赖）。支持 `<module> [source.arxml] [output.json]` 及 `<module> <output.json>`。
- 测试：新增 arxml-interoperability.test.ts 10 项、generation-script.test.ts 3 项；基线 289 + 13 = 302。
- 未改生产 bswmd 资产、存储 schema/S1 恢复协议、OutputGate、C 生成规则、ACTIVE、stage 或 review。

## 实际页面验证

2026-11-06 12:21–13:20，本地 3001 隔离 origin，纯内存持久化适配器，真实 WorkspaceView / store / ImportDialog / ReferencePicker。未读写用户 3000 工程数据。文件选择操作等待宿主返回较久，页面本身未报异常；不是产品耗时测量。

1. 打开 MemoryDestinationRef，列表同时包含 FirstMemory、SecondMemory（01 图）。选择第二项，表单改变为 SecondMemory；点代码验证，面板“验证通过”（02 图）。
2. 下载初始化时保存的 r4.2.2 测试文件，通过真实文件选择器打开项目右键→导入→ARXML。预览警告明确说明来源旧命名空间、导出转 r4.0；冲突表准确显示文件 FirstMemory / 当前 SecondMemory（03 图、legacy-preview.txt）。
3. 点应用导入，成功提示且表单恢复 FirstMemory，脏标记消失，弹窗关闭（04 图）。
4. 控制台无 error；一个 Vue Router 警告来自隔离脚本直接挂 WorkspaceView 而非 router-view，非产品入口问题。

证据目录：`.codex/reports/evidence/task015/`。复现脚本 ui-entry.ts/html 复制到 `.temp/task015-ui.ts/html` 后由 3001 Vite 提供；脚本仅允许 localhost:3001，测试页面不入生产构建。
另有官方 Dem 自动化集成实证：DemMemoryDestinationRef 的第二定义是 DemPrimaryMemory，可选、写入并消除该引用项错误；不是仅靠合成样例。

## 抽取脚本确定性与变更样例

输入为仓库父目录既有官方 `AUTOSAR_MOD_ECUConfigurationParameters.arxml`，CP 4.4.0；未采用 EXT-001 的 4.2.2 供应商数据。三个模块均在 `.temp/task015-official/` 连跑两次，生成 JSON 和对应 changelog 均字节一致，完整 SHA 见 generator-determinism.json。

| 模块 | 容器 / 参数 / 引用 | 语义 contentSha256 |
|---|---|---|
| Dem | 67 / 162 / 64 | 709cdde682d4a0f31f157cae3f8a0687f95f939c303e914c901d13816f72c23a |
| CanIf | 20 / 82 / 16 | 5d82f526175322e8901d3daa7b585ce0ab4c0d3b8863df16cea74dda751b4420 |
| NvM | 6 / 51 / 9 | 73e054fc77f108ed64f1d9a2d29168bda21b2fb0c6eedc99cceafeae75f2b0ec |

changelog-example.json 来自 **测试副本** 的一个 defaultValue false→true 修改，原 fixture/生产定义未动。记录具体容器 UUID/参数 UUID/defaultValue 路径，before/after，前后内容 hash。无变化再次运行保留最后一次真实 diff；不是累计历史库，长期历史由 Git 保留。首次生成时记录正文整体新增。源码文件名/bytes/hash 仅为溯源，不纳入语义 contentSha256。

## 既有断言调整及自检过程

| 既有文件 | 调整理由与保留约束 |
|---|---|
| io.test.ts | namespace 标题更新为 r4.0，实际断言沿用常量，XXE/往返其他断言不删。 |
| external-entity.arxml | xmlns 更新为 r4.0，使恶意实体 fixture 继续走当前合法 namespace，仍必须拒绝。 |
| ecuc-ui.test.ts | 契约 B3 将外部引用改为只读，原“点开空候选弹窗”断言不再符合产品行为。改为按钮 disabled + 原因可见 + 点击仍无弹窗/创建按钮 + 序列化数据逐字节未变。内部引用空态创建/撤销用例保持。 |

首次全量回归 301/302，唯一失败为上述旧外部引用弹窗预期，按 B3 更新后 302/302。新增测试开发中修正了不适用于当前 Vitest 的 matcher、解析器函数名；未掩盖产品失败。完整成功日志 tests.log；build.log 包含既有 >500KB chunk 警告，构建成功；性能优化按 S7。

## 标准依据与限制

- 官方 CP4.4.0 [ARXML Serialization Rules](https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TPS_ARXMLSerializationRules.pdf)：TPS_ASR_00011 / TPS_ASR_00017，兼容版本共享 r4.0 namespace，namespace 不是发布版本号。
- 官方 CP4.4.0 [ECU Configuration](https://www.autosar.org/fileadmin/standards/R18-10_R4.4.0_R1.5.0/CP/AUTOSAR_TPS_ECUConfiguration.pdf)：CHOICE-REFERENCE 多目标定义与引用分类；FOREIGN 目标来自其他模板（TPS_ECUC_02041）。
- **未进行完整官方 XSD 验证，未进行 DaVinci/其他供应商导入或 BSW 集成验证。** 单模块 ECUC 文件策略、跨模块引用不支持等既有边界保留；有配置的外部引用拒绝有损输出，不宣称能导出 FOREIGN/INSTANCE 的完整值语义。
- XML 中的参数/引用 value 元素 UUID 原模型不持有，导出重新生成；保证配置/容器 UUID，未声称 XML 文件字节级稳定。脚本生成 BSWMD JSON 才是逐字节确定性输出。
- 私有 metadata 用于编辑器名称、时间戳、未配置状态/自定义描述等扩展；移除后保证标准值可读，不保证恢复编辑器专有信息。
- 抽取器仍按既有规则裁剪描述至 160 字；字段 diff 比较裁剪后语义正文，原文件变化另由 source.sha256 追踪。解析器尚未支持的 ECUC 结构仍由现有 blockers 暴露，不宣称全标准支持。
- 桌面入口沿用 scripts/desktop/Start-Configurator.ps1，源码更新自动生效；实际健康检查返回 `Ready: http://localhost:3000/workspace`（受限沙箱内检查失败后，经允许的本机检查成功）。后台依赖本机服务与应用运行，本轮没有启动常驻调度器。

## 待确认

本契约内无待用户决定项；独立验收与下一阶段由 WorkBuddy 决定。
